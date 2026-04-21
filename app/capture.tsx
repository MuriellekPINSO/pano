import CaptureGuideOverlay from "@/components/CaptureGuideOverlay";
import { CAPTURE_CONFIG, CapturePosition, toScreen, VF_W, VF_H, VF_TOP, VF_LEFT } from "@/constants/CaptureConfig";
import { usePanorama } from "@/context/PanoramaContext";
import { MaterialIcons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { DeviceMotion } from "expo-sensors";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Dimensions,
    Image,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// La caméra occupe tout l'écran (comme Teleport)
// Le viewfinder rectangulaire est dessiné par CaptureGuideOverlay


export default function CaptureScreen() {
  const router = useRouter();
  const {
    state,
    createProject,
    capturePhoto,
    setCurrentProject,
    setCapturing,
    saveProjects,
    getNextUncapturedPosition,
  } = usePanorama();

  // Permissions
  const [permission, requestPermission] = useCameraPermissions();

  // Camera
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [cameraLocked, setCameraLocked] = useState(false);

  // Project state
  const [showNameModal, setShowNameModal] = useState(!state.currentProject);
  const [projectName, setProjectName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);

  // Device orientation
  const [currentYaw, setCurrentYaw] = useState(0);
  const [currentPitch, setCurrentPitch] = useState(0);
  const [proximity, setProximity] = useState(0);
  const [targetPosition, setTargetPosition] = useState<CapturePosition | null>(
    null,
  );

  // Row transition message
  const [rowMessage, setRowMessage] = useState<string | null>(null);
  const prevRowRef = useRef<number | null>(null);

  // Auto-capture
  const alignedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashOpacity = useSharedValue(0);
  const captureScale = useSharedValue(1);
  const captureRingScale = useSharedValue(1);
  const successScale = useSharedValue(0);
  const rowMessageOpacity = useSharedValue(0);

  // Track initial yaw offset
  const initialYaw = useRef<number | null>(null);

  // Smoothed gyroscope values (low-pass filter)
  const smoothedYaw = useRef(0);
  const smoothedPitch = useRef(0);
  const SMOOTHING = 0.35;

  // Proximity haptic pulse
  const lastHapticTime = useRef(0);
  const proximityRef = useRef(0);

  // Setup device motion
  useEffect(() => {
    let subscription: any;

    if (Platform.OS === "web") {
      console.log("DeviceMotion not supported on web");
      return;
    }

    const setupMotion = async () => {
      try {
        const isAvailable = await DeviceMotion.isAvailableAsync();
        if (isAvailable) {
          DeviceMotion.setUpdateInterval(16); // ~60fps
          subscription = DeviceMotion.addListener((data) => {
            if (data.rotation) {
              const { alpha, beta } = data.rotation;
              let rawYaw = ((alpha || 0) * 180) / Math.PI;
              const rawPitch = ((beta || 0) * 180) / Math.PI;

              if (initialYaw.current === null) {
                initialYaw.current = rawYaw;
                smoothedYaw.current = 0;
                smoothedPitch.current = rawPitch;
              }

              rawYaw = rawYaw - (initialYaw.current || 0);
              if (rawYaw < 0) rawYaw += 360;
              if (rawYaw >= 360) rawYaw -= 360;

              // Low-pass filter
              let yawDiff = rawYaw - smoothedYaw.current;
              if (yawDiff > 180) yawDiff -= 360;
              if (yawDiff < -180) yawDiff += 360;
              smoothedYaw.current += yawDiff * SMOOTHING;
              if (smoothedYaw.current < 0) smoothedYaw.current += 360;
              if (smoothedYaw.current >= 360) smoothedYaw.current -= 360;

              smoothedPitch.current +=
                (rawPitch - smoothedPitch.current) * SMOOTHING;

              setCurrentYaw(smoothedYaw.current);
              setCurrentPitch(smoothedPitch.current);
            }
          });
        }
      } catch (error) {
        console.warn("DeviceMotion setup failed:", error);
      }
    };

    setupMotion();

    return () => {
      if (subscription) {
        try {
          subscription.remove();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  // Update target position
  useEffect(() => {
    if (state.currentProject) {
      const next = getNextUncapturedPosition();
      setTargetPosition(next);

      // Show row transition message
      if (
        next &&
        prevRowRef.current !== null &&
        next.row !== prevRowRef.current
      ) {
        const rowLabel = CAPTURE_CONFIG.ROW_LABELS[next.row];
        const instruction = CAPTURE_CONFIG.ROW_INSTRUCTIONS[next.row];
        setRowMessage(`${rowLabel}\n${instruction}`);
        rowMessageOpacity.value = withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(1, { duration: 2500 }),
          withTiming(0, { duration: 500 }),
        );
        setTimeout(() => setRowMessage(null), 3500);

        // Strong haptic to signal row change
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      prevRowRef.current = next?.row ?? prevRowRef.current;
    }
  }, [state.currentProject?.positions]);

  // Proximity-based haptic feedback
  useEffect(() => {
    if (!targetPosition || !isReady || isTakingPhoto) {
      setProximity(0);
      return;
    }

    let yawDiff = Math.abs(targetPosition.yaw - currentYaw);
    yawDiff = Math.min(yawDiff, 360 - yawDiff);
    const pitchDiff = Math.abs(targetPosition.pitch - currentPitch);
    const dist = Math.sqrt(yawDiff * yawDiff + pitchDiff * pitchDiff);
    const tolerance = CAPTURE_CONFIG.POSITION_TOLERANCE;

    const p = Math.max(0, Math.min(1, 1 - dist / (tolerance * 3)));
    setProximity(p);
    proximityRef.current = p;

    // Progressive haptic pulses
    if (p > 0.3 && p < 0.95) {
      const now = Date.now();
      const interval = Math.max(150, 600 - p * 500);
      if (now - lastHapticTime.current > interval) {
        lastHapticTime.current = now;
        if (p > 0.7) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    }
  }, [currentYaw, currentPitch, targetPosition, isReady, isTakingPhoto]);

  // Check alignment
  const checkIsAligned = useCallback(() => {
    if (!targetPosition) return false;
    const yawDiff = Math.abs(targetPosition.yaw - currentYaw);
    const normalizedYawDiff = Math.min(yawDiff, 360 - yawDiff);
    const pitchDiff = Math.abs(targetPosition.pitch - currentPitch);
    return (
      normalizedYawDiff < CAPTURE_CONFIG.POSITION_TOLERANCE &&
      pitchDiff < CAPTURE_CONFIG.POSITION_TOLERANCE
    );
  }, [targetPosition, currentYaw, currentPitch]);

  const aligned = checkIsAligned();

  // Take photo
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !targetPosition || isTakingPhoto) return;

    setIsTakingPhoto(true);

    try {
      // Flash animation (fast, satisfying)
      flashOpacity.value = withSequence(
        withTiming(0.6, { duration: 30 }),
        withTiming(0, { duration: 200 }),
      );

      // Capture button animation
      captureScale.value = withSequence(withSpring(0.75), withSpring(1));

      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: CAPTURE_CONFIG.CAMERA.QUALITY,
        skipProcessing: false,
      });

      if (photo) {
        // Save to project folder
        const projectDir = `${FileSystem.documentDirectory}panorama_projects/${state.currentProject?.id}/`;
        const fileName = `pos_${targetPosition.id}_r${targetPosition.row}_c${targetPosition.col}.jpg`;
        const destUri = `${projectDir}${fileName}`;

        await FileSystem.copyAsync({
          from: photo.uri,
          to: destUri,
        });

        // Update state
        capturePhoto(targetPosition.id, destUri);

        // Lock camera focus after first shot (prevents per-photo auto-adjustments)
        if (!cameraLocked) setCameraLocked(true);

        // Success animation
        successScale.value = withSequence(
          withSpring(1.2),
          withTiming(0, { duration: 400 }),
        );

        // Satisfying haptic
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );

      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      Alert.alert("Erreur", "Échec de la capture. Réessayez.");
    } finally {
      setIsTakingPhoto(false);
    }
  }, [targetPosition, isTakingPhoto, state.currentProject, capturePhoto]);

  // RECORDING ring pulse when aligned
  useEffect(() => {
    if (aligned && !isTakingPhoto) {
      captureRingScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 380 }),
          withTiming(1.0,  { duration: 380 }),
        ),
        -1,
        true,
      );
    } else {
      captureRingScale.value = withTiming(1.0, { duration: 200 });
    }
  }, [aligned, isTakingPhoto]);

  // Auto-capture when aligned
  useEffect(() => {
    if (aligned && !isTakingPhoto && isReady && targetPosition) {
      if (!alignedTimerRef.current) {
        alignedTimerRef.current = setTimeout(() => {
          handleCapture();
          alignedTimerRef.current = null;
        }, CAPTURE_CONFIG.AUTO_CAPTURE_DELAY);
      }
    } else {
      if (alignedTimerRef.current) {
        clearTimeout(alignedTimerRef.current);
        alignedTimerRef.current = null;
      }
    }

    return () => {
      if (alignedTimerRef.current) {
        clearTimeout(alignedTimerRef.current);
        alignedTimerRef.current = null;
      }
    };
  }, [aligned, isTakingPhoto, isReady, targetPosition, handleCapture]);

  // Create project
  const handleCreateProject = useCallback(async () => {
    if (!projectName.trim()) {
      Alert.alert("Nom requis", "Donnez un nom à votre panorama.");
      return;
    }
    await createProject(projectName.trim());
    setShowNameModal(false);
    setIsReady(true);
  }, [projectName, createProject]);

  // Resume existing project
  useEffect(() => {
    if (state.currentProject) {
      setShowNameModal(false);
      setIsReady(true);
    }
  }, []);

  // Handle complete → seamless flow: capture → stitch → view
  const handleComplete = useCallback(async () => {
    await saveProjects();
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/viewer");
  }, [saveProjects, router]);

  // Check completion
  useEffect(() => {
    if (state.currentProject?.isComplete) {
      handleComplete();
    }
  }, [state.currentProject?.isComplete]);

  // Animation styles
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const captureButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureScale.value }],
  }));

  const captureRingAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureRingScale.value }],
  }));

  const successStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
    opacity: successScale.value,
  }));

  const rowMessageStyle = useAnimatedStyle(() => ({
    opacity: rowMessageOpacity.value,
    transform: [{ scale: 0.9 + rowMessageOpacity.value * 0.1 }],
  }));

  const photoCountAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 }], // kept for API compat, not rendered
  }));

  // Permission handling
  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <LinearGradient
          colors={["#0F0F1A", "#1A1A2E", "#16213E"]}
          style={styles.gradient}
        >
          <View style={styles.permIconWrap}>
            <MaterialIcons name="camera" size={52} color="#6C63FF" />
          </View>
          <Text style={styles.permissionTitle}>Accès caméra requis</Text>
          <Text style={styles.permissionText}>
            Pour capturer votre panorama 360°, nous avons besoin d'accéder à
            votre caméra.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            style={styles.permissionButton}
          >
            <LinearGradient
              colors={["#6C63FF", "#4338CA"]}
              style={styles.permissionButtonGradient}
            >
              <Text style={styles.permissionButtonText}>Autoriser</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          >
            <Text style={styles.cancelText}>Retour</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Affichage des photos capturées dans l'espace (le "Vide Noir") */}
        {state.currentProject?.positions.map(pos => {
          if (!pos.captured || !pos.uri) return null;
          // toScreen donne le centre. On veut positionner la photo (qui a la taille du Viewfinder)
          // pour qu'elle semble physiquement à sa position.
          const pos2D = toScreen(pos.yaw, pos.pitch, currentYaw, currentPitch, SCREEN_WIDTH, SCREEN_HEIGHT);
          
          return (
            <Image
              key={`patch-${pos.id}`}
              source={{ uri: pos.uri }}
              style={{
                position: 'absolute',
                left: pos2D.x - VF_W / 2,
                top: pos2D.y - VF_H / 2,
                width: VF_W,
                height: VF_H,
                opacity: 0.85,
                zIndex: 1,
              }}
            />
          );
        })}

        <CameraView
          ref={cameraRef}
          style={{
            position: 'absolute',
            top: VF_TOP,
            left: VF_LEFT,
            width: VF_W,
            height: VF_H,
            zIndex: 5,
          }}
          facing="back"
          autofocus={cameraLocked ? "off" : "on"}
        />

        {/* Teleport-style Guide Overlay (black void + orbs + frame) */}
        {isReady && state.currentProject && (
          <CaptureGuideOverlay
            positions={state.currentProject.positions}
            currentYaw={currentYaw}
            currentPitch={currentPitch}
            targetPosition={targetPosition}
            isAligned={aligned}
          />
        )}
      </View>

      {/* Photo flash */}
      <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />

      {/* Success checkmark */}
      <Animated.View
        style={[styles.successIndicator, successStyle]}
        pointerEvents="none"
      >
        <View style={styles.successCircle}>
          <MaterialIcons name="check" size={40} color="#FFFFFF" />
        </View>
      </Animated.View>

      {/* Row change banner */}
      {rowMessage && (
        <Animated.View
          style={[styles.rowTransition, rowMessageStyle]}
          pointerEvents="none"
        >
          <View style={styles.rowTransitionInner}>
            <Text style={styles.rowTransitionTitle}>
              {rowMessage.split("\n")[0]}
            </Text>
            <Text style={styles.rowTransitionSubtitle}>
              {rowMessage.split("\n")[1]}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── TOP CONTROLS ──
          Exact Teleport layout:
          - White circle with undo arrow (top-left)
          - Red filled circle with X (top-right)
          Positioned above the frame, in the black void */}
      <View style={styles.topControls} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.undoButton}
          onPress={() => {
            saveProjects();
            setCurrentProject(null);
            router.back();
          }}
        >
          <MaterialIcons name="undo" size={22} color="#000000" />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            Alert.alert(
              "Quitter la capture ?",
              "Votre progression sera sauvegardée.",
              [
                { text: "Continuer", style: "cancel" },
                {
                  text: "Quitter",
                  style: "destructive",
                  onPress: () => {
                    saveProjects();
                    setCurrentProject(null);
                    router.back();
                  },
                },
              ],
            );
          }}
        >
          <MaterialIcons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* ── CAPTURE BUTTON ──
          Teleport has NO visible shutter button — capture is auto-triggered.
          We keep a minimal button below the frame for manual fallback. */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          onPress={handleCapture}
          disabled={isTakingPhoto}
          activeOpacity={0.7}
        >
          <Animated.View style={captureButtonAnimStyle}>
            <Animated.View
              style={[
                styles.captureButtonOuter,
                aligned && styles.captureButtonAligned,
                captureRingAnimStyle,
              ]}
            >
              <View
                style={[
                  styles.captureButtonInner,
                  aligned && styles.captureButtonInnerAligned,
                  isTakingPhoto && styles.captureButtonInnerDisabled,
                ]}
              >
                {isTakingPhoto && (
                  <MaterialIcons
                    name="hourglass-top"
                    size={24}
                    color="rgba(255,255,255,0.5)"
                  />
                )}
              </View>
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>
      </View>


      {/* Name Modal */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={FadeInDown.duration(600)}
            style={styles.modalContent}
          >
            <LinearGradient
              colors={["#1A1A2E", "#16213E"]}
              style={styles.modalGradient}
            >
              <View style={styles.modalIcon}>
                <MaterialIcons name="panorama" size={44} color="#6C63FF" />
              </View>
              <Text style={styles.modalTitle}>Nouveau Panorama 360°</Text>
              <Text style={styles.modalSubtitle}>
                Nommez votre panorama pour commencer
              </Text>

              <TextInput
                style={styles.modalInput}
                value={projectName}
                onChangeText={setProjectName}
                placeholder="Ex: Salon, Chambre, Bureau..."
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateProject}
              />

              {/* Quick info about the process */}
              <View style={styles.modalSteps}>
                <View style={styles.modalStep}>
                  <View
                    style={[styles.stepDot, { backgroundColor: "#6C63FF" }]}
                  >
                    <Text style={styles.stepNum}>1</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Tournez sur vous-même ({CAPTURE_CONFIG.COLS_PER_ROW[0]}{" "}
                    photos)
                  </Text>
                </View>
                <View style={styles.modalStep}>
                  <View
                    style={[styles.stepDot, { backgroundColor: "#FF6B35" }]}
                  >
                    <Text style={styles.stepNum}>2</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Inclinez vers le haut ({CAPTURE_CONFIG.COLS_PER_ROW[1]}{" "}
                    photos)
                  </Text>
                </View>
                <View style={styles.modalStep}>
                  <View
                    style={[styles.stepDot, { backgroundColor: "#10B981" }]}
                  >
                    <Text style={styles.stepNum}>3</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Inclinez vers le bas ({CAPTURE_CONFIG.COLS_PER_ROW[2]}{" "}
                    photos)
                  </Text>
                </View>
                <View style={styles.modalStep}>
                  <View
                    style={[styles.stepDot, { backgroundColor: "#F59E0B" }]}
                  >
                    <Text style={styles.stepNum}>4</Text>
                  </View>
                  <Text style={styles.stepText}>
                    Pointez vers le plafond (1 photo)
                  </Text>
                </View>
              </View>

              <View style={styles.modalTotalInfo}>
                <MaterialIcons
                  name="timer"
                  size={14}
                  color="rgba(255,255,255,0.4)"
                />
                <Text style={styles.modalTotalText}>
                  {CAPTURE_CONFIG.TOTAL_PHOTOS} photos · ~1 minute
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCreateProject}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={["#6C63FF", "#4338CA"]}
                  style={styles.modalButton}
                >
                  <MaterialIcons name="camera" size={22} color="#FFFFFF" />
                  <Text style={styles.modalButtonText}>Commencer</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.modalCancel}
              >
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000", // Pure black void — Teleport style
  },

  // Caméra fullscreen — le viewfinder est affiché par CaptureGuideOverlay
  cameraWindow: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    zIndex: 20,
  },
  successIndicator: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 21,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 10,
  },

  // ── Row Transition ──
  rowTransition: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  rowTransitionInner: {
    backgroundColor: "rgba(0, 0, 0, 0.88)",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.4)",
    minWidth: 240,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 20,
  },
  rowTransitionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  rowTransitionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#22C55E",
    letterSpacing: 0.5,
  },
  rowTransitionSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.65)",
    textAlign: "center",
    fontWeight: "500",
  },

  // ── Top Controls ──
  topControls: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 58 : 38,
    paddingHorizontal: 20,
    zIndex: 50,
  },
  // Teleport undo button: white filled circle, black icon
  undoButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  // Teleport close button: red filled circle, white X
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },

  // ── Bottom section ──
  bottomSection: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    zIndex: 50,
  },

  // ── Capture Button ──
  captureButtonOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  captureButtonAligned: {
    borderColor: "#22C55E",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 10,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInnerAligned: {
    backgroundColor: "#22C55E",
  },
  captureButtonInnerDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },

  // ── Permission Screen ──
  permissionContainer: {
    flex: 1,
  },
  permIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "rgba(108, 99, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
  },
  permissionButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  permissionButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 15,
    fontWeight: "500",
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    overflow: "hidden",
  },
  modalGradient: {
    padding: 28,
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  modalIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "rgba(108, 99, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    marginBottom: 20,
  },
  modalInput: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 18,
  },

  // ── Modal Steps ──
  modalSteps: {
    width: "100%",
    gap: 10,
    marginBottom: 14,
  },
  modalStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNum: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  stepText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    flex: 1,
  },
  modalTotalInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  modalTotalText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 12,
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
    width: "100%",
    justifyContent: "center",
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  modalCancel: {
    marginTop: 14,
  },
});
