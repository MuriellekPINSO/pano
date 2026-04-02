// Interactive 360° Sphere Viewer with Gyroscope + Touch + Inertia + Pinch-to-Zoom
// Like Teleport & Google Street View: move your phone to look around

import { MaterialIcons } from "@expo/vector-icons";
import { DeviceMotion } from "expo-sensors";
import { useEffect, useRef, useState } from "react";
import {
    Dimensions,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { WebView } from "react-native-webview";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Sphere360ViewerProps {
  imageUri: string;
  onClose?: () => void;
  onShare?: () => void;
}

function generate360ViewerHTML(imageDataUri: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: #000; 
            overflow: hidden; 
            touch-action: none;
            -webkit-user-select: none;
            user-select: none;
        }
        canvas { display: block; width: 100vw; height: 100vh; }
        #loading {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            color: white; font-family: -apple-system, sans-serif;
            font-size: 16px; text-align: center;
        }
        .spinner {
            width: 40px; height: 40px;
            border: 3px solid rgba(255,255,255,0.2);
            border-top-color: #6C63FF;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 12px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id="loading"><div class="spinner"></div>Chargement...</div>
    <canvas id="canvas"></canvas>
    <script>
        const canvas = document.getElementById('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        const loading = document.getElementById('loading');

        if (!gl) {
            loading.textContent = 'WebGL non supporté';
            throw new Error('WebGL not supported');
        }

        function resize() {
            canvas.width = window.innerWidth * window.devicePixelRatio;
            canvas.height = window.innerHeight * window.devicePixelRatio;
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        resize();
        window.addEventListener('resize', resize);

        // ── Shaders ──
        const vsSource = \`
            attribute vec4 aPosition;
            attribute vec2 aTexCoord;
            uniform mat4 uProjection;
            uniform mat4 uView;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = uProjection * uView * aPosition;
                vTexCoord = aTexCoord;
            }
        \`;
        const fsSource = \`
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            void main() {
                gl_FragColor = texture2D(uTexture, vTexCoord);
            }
        \`;

        function compileShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        const vs = compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.useProgram(program);

        const aPosition = gl.getAttribLocation(program, 'aPosition');
        const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
        const uProjection = gl.getUniformLocation(program, 'uProjection');
        const uView = gl.getUniformLocation(program, 'uView');

        // ── Sphere geometry ──
        function createSphere(radius, segments, rings) {
            const vertices = [], texCoords = [], indices = [];
            for (let y = 0; y <= rings; y++) {
                for (let x = 0; x <= segments; x++) {
                    const u = x / segments;
                    const v = y / rings;
                    const theta = u * 2 * Math.PI;
                    const phi = v * Math.PI;
                    vertices.push(
                        -radius * Math.sin(phi) * Math.cos(theta),
                        radius * Math.cos(phi),
                        radius * Math.sin(phi) * Math.sin(theta)
                    );
                    texCoords.push(u, v);
                }
            }
            for (let y = 0; y < rings; y++) {
                for (let x = 0; x < segments; x++) {
                    const a = y * (segments + 1) + x;
                    const b = a + segments + 1;
                    indices.push(a, a + 1, b, b, a + 1, b + 1);
                }
            }
            return { vertices, texCoords, indices };
        }

        const sphere = createSphere(50, 64, 64);

        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphere.vertices), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphere.texCoords), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aTexCoord);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sphere.indices), gl.STATIC_DRAW);

        // ── Camera state ──
        let yaw = 0;
        let pitch = 0;
        let fov = 75 * Math.PI / 180;
        
        // Inertia
        let velocityYaw = 0;
        let velocityPitch = 0;
        const FRICTION = 0.95;
        const MIN_VELOCITY = 0.0001;

        // Gyroscope (receives data from React Native)
        let gyroEnabled = false;
        let gyroYaw = 0;
        let gyroPitch = 0;
        let gyroBaseYaw = null;
        let gyroBasePitch = null;

        // Listen for gyroscope data from React Native
        window.addEventListener('message', function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'GYRO_UPDATE') {
                    if (gyroBaseYaw === null) {
                        gyroBaseYaw = data.yaw;
                        gyroBasePitch = data.pitch;
                    }
                    gyroYaw = data.yaw - gyroBaseYaw;
                    gyroPitch = data.pitch - gyroBasePitch;
                    gyroEnabled = true;
                } else if (data.type === 'GYRO_TOGGLE') {
                    gyroEnabled = data.enabled;
                    if (data.enabled) {
                        gyroBaseYaw = null;
                        gyroBasePitch = null;
                    }
                }
            } catch(e) {}
        });
        // Also handle postMessage (iOS uses different event)
        document.addEventListener('message', function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'GYRO_UPDATE') {
                    if (gyroBaseYaw === null) {
                        gyroBaseYaw = data.yaw;
                        gyroBasePitch = data.pitch;
                    }
                    gyroYaw = data.yaw - gyroBaseYaw;
                    gyroPitch = data.pitch - gyroBasePitch;
                    gyroEnabled = true;
                } else if (data.type === 'GYRO_TOGGLE') {
                    gyroEnabled = data.enabled;
                    if (data.enabled) {
                        gyroBaseYaw = null;
                        gyroBasePitch = null;
                    }
                }
            } catch(e) {}
        });

        // ── Matrix math ──
        function perspective(fov, aspect, near, far) {
            const f = 1 / Math.tan(fov / 2);
            const nf = 1 / (near - far);
            return [
                f / aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (far + near) * nf, -1,
                0, 0, 2 * far * near * nf, 0
            ];
        }

        function lookAt(yaw, pitch) {
            const cy = Math.cos(yaw), sy = Math.sin(yaw);
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            const fx = sy * cp, fy = sp, fz = -cy * cp;
            const rx = fy * 0 - fz * 1;
            const ry = fz * 0 - fx * 0;
            const rz = fx * 1 - fy * 0;
            const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
            const nrx = rx / len, nry = ry / len, nrz = rz / len;
            const uux = nry * fz - nrz * fy;
            const uuy = nrz * fx - nrx * fz;
            const uuz = nrx * fy - nry * fx;
            return [
                nrx, uux, -fx, 0,
                nry, uuy, -fy, 0,
                nrz, uuz, -fz, 0,
                0, 0, 0, 1
            ];
        }

        // ── Touch handling with inertia ──
        let isDragging = false;
        let lastX = 0, lastY = 0;
        let lastMoveTime = 0;

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isDragging = true;
            velocityYaw = 0;
            velocityPitch = 0;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            lastMoveTime = Date.now();
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isDragging) return;

            const now = Date.now();
            const dt = Math.max(1, now - lastMoveTime);
            
            if (e.touches.length === 1) {
                // Single touch: pan
                const dx = e.touches[0].clientX - lastX;
                const dy = e.touches[0].clientY - lastY;
                
                const sensitivity = 0.004;
                yaw -= dx * sensitivity;
                pitch += dy * sensitivity;
                pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));

                // Track velocity for inertia
                velocityYaw = -dx * sensitivity / (dt / 16);
                velocityPitch = dy * sensitivity / (dt / 16);

                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                // Pinch to zoom
                const dist = Math.sqrt(
                    Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) +
                    Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
                );
                if (window._lastPinchDist) {
                    const zoomDelta = (window._lastPinchDist - dist) * 0.002;
                    fov = Math.max(30 * Math.PI / 180, Math.min(120 * Math.PI / 180, fov + zoomDelta));
                }
                window._lastPinchDist = dist;
            }
            lastMoveTime = now;
        });

        canvas.addEventListener('touchend', (e) => {
            isDragging = false;
            window._lastPinchDist = null;
        });

        // Mouse support (web)
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            velocityYaw = 0;
            velocityPitch = 0;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            yaw -= dx * 0.004;
            pitch += dy * 0.004;
            pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
            velocityYaw = -dx * 0.004;
            velocityPitch = dy * 0.004;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        canvas.addEventListener('mouseup', () => { isDragging = false; });
        canvas.addEventListener('wheel', (e) => {
            fov += e.deltaY * 0.001;
            fov = Math.max(30 * Math.PI / 180, Math.min(120 * Math.PI / 180, fov));
        });

        // ── Load texture ──
        const texture = gl.createTexture();
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            loading.style.display = 'none';
            render();
        };
        img.onerror = () => { loading.textContent = 'Erreur de chargement'; };
        img.src = '${imageDataUri}';

        // ── Render loop ──
        function render() {
            // Apply inertia (momentum after touch release)
            if (!isDragging) {
                if (Math.abs(velocityYaw) > MIN_VELOCITY) {
                    yaw += velocityYaw;
                    velocityYaw *= FRICTION;
                } else {
                    velocityYaw = 0;
                }
                if (Math.abs(velocityPitch) > MIN_VELOCITY) {
                    pitch += velocityPitch;
                    velocityPitch *= FRICTION;
                    pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
                } else {
                    velocityPitch = 0;
                }
            }

            // Apply gyroscope (blended with touch)
            let finalYaw = yaw;
            let finalPitch = pitch;
            if (gyroEnabled && gyroBaseYaw !== null) {
                // Gyroscope overrides touch for rotation
                finalYaw = yaw + gyroYaw * 0.02;
                finalPitch = pitch - gyroPitch * 0.02;
                finalPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, finalPitch));
            }

            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);

            const aspect = canvas.width / canvas.height;
            const proj = perspective(fov, aspect, 0.1, 100);
            const view = lookAt(finalYaw, finalPitch);

            gl.uniformMatrix4fv(uProjection, false, proj);
            gl.uniformMatrix4fv(uView, false, view);

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.drawElements(gl.TRIANGLES, sphere.indices.length, gl.UNSIGNED_SHORT, 0);

            requestAnimationFrame(render);
        }
    </script>
</body>
</html>`;
}

export default function Sphere360Viewer({
  imageUri,
  onClose,
  onShare,
}: Sphere360ViewerProps) {
  const webViewRef = useRef<WebView>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gyroActive, setGyroActive] = useState(true);

  // Load image as base64 for WebView
  useEffect(() => {
    async function loadImage() {
      if (imageUri.startsWith("data:")) {
        setImageData(imageUri);
        setIsLoading(false);
      } else {
        try {
          const FileSystem = require("expo-file-system/legacy");
          const base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setImageData(`data:image/jpeg;base64,${base64}`);
          setIsLoading(false);
        } catch (err) {
          console.error("Failed to load panorama image:", err);
          setIsLoading(false);
        }
      }
    }
    loadImage();
  }, [imageUri]);

  // Setup gyroscope and send data to WebView
  useEffect(() => {
    if (Platform.OS === "web" || !gyroActive) return;

    let subscription: any;

    const setup = async () => {
      try {
        const isAvailable = await DeviceMotion.isAvailableAsync();
        if (!isAvailable) return;

        DeviceMotion.setUpdateInterval(33);
        subscription = DeviceMotion.addListener((data) => {
          if (data.rotation && webViewRef.current) {
            const yaw = ((data.rotation.alpha || 0) * 180) / Math.PI;
            const pitch = ((data.rotation.beta || 0) * 180) / Math.PI;

            webViewRef.current.injectJavaScript(`
                            try {
                                window.dispatchEvent(new MessageEvent('message', {
                                    data: JSON.stringify({
                                        type: 'GYRO_UPDATE',
                                        yaw: ${yaw},
                                        pitch: ${pitch}
                                    })
                                }));
                            } catch(e) {}
                            true;
                        `);
          }
        });
      } catch (err) {
        console.warn("Gyroscope not available for viewer:", err);
      }
    };

    setup();

    return () => {
      if (subscription) {
        try {
          subscription.remove();
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, [gyroActive]);

  const toggleGyro = () => {
    const newState = !gyroActive;
    setGyroActive(newState);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
                try {
                    window.dispatchEvent(new MessageEvent('message', {
                        data: JSON.stringify({ type: 'GYRO_TOGGLE', enabled: ${newState} })
                    }));
                } catch(e) {}
                true;
            `);
    }
  };

  if (isLoading || !imageData) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement du panorama...</Text>
        </View>
      </View>
    );
  }

  const html = generate360ViewerHTML(imageData);

  return (
    <View style={styles.container}>
      {/* WebGL 360 viewer */}
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />

      {/* Floating controls */}
      <View style={styles.controls}>
        {onClose && (
          <TouchableOpacity style={styles.controlButton} onPress={onClose}>
            <MaterialIcons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <View style={styles.controlSpacer} />
        <View style={styles.titlePill}>
          <MaterialIcons name="360" size={18} color="#6C63FF" />
          <Text style={styles.titleText}>Vue 360°</Text>
        </View>
        <View style={styles.controlSpacer} />
        {onShare && (
          <TouchableOpacity style={styles.controlButton} onPress={onShare}>
            <MaterialIcons name="share" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {/* Gyroscope toggle */}
        <TouchableOpacity
          style={[styles.bottomButton, gyroActive && styles.bottomButtonActive]}
          onPress={toggleGyro}
        >
          <MaterialIcons
            name="screen-rotation"
            size={20}
            color={gyroActive ? "#6C63FF" : "rgba(255,255,255,0.5)"}
          />
          <Text
            style={[
              styles.bottomButtonText,
              gyroActive && styles.bottomButtonTextActive,
            ]}
          >
            {gyroActive ? "Gyroscope ON" : "Gyroscope OFF"}
          </Text>
        </TouchableOpacity>

        {/* Hint */}
        <View style={styles.hintPill}>
          <MaterialIcons
            name="touch-app"
            size={14}
            color="rgba(255,255,255,0.5)"
          />
          <Text style={styles.hintText}>
            {gyroActive ? "Bougez le téléphone" : "Glissez pour explorer"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 16,
  },
  controls: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  controlSpacer: { flex: 1 },
  titlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  titleText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },

  // Bottom controls
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 12,
  },
  bottomButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  bottomButtonActive: {
    borderColor: "rgba(108, 99, 255, 0.4)",
    backgroundColor: "rgba(108, 99, 255, 0.15)",
  },
  bottomButtonText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "600",
  },
  bottomButtonTextActive: {
    color: "#6C63FF",
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  hintText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "500",
  },
});
