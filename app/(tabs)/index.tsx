import { usePanorama } from '@/context/PanoramaContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { state, loadProjects, setCurrentProject } = usePanorama();
  const floatAnim = useSharedValue(0);
  const pulseAnim = useSharedValue(1);
  const rotateAnim = useSharedValue(0);

  useEffect(() => {
    loadProjects();

    floatAnim.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 2000 }),
        withTiming(-10, { duration: 2000 })
      ),
      -1,
      true
    );

    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500 }),
        withTiming(0.95, { duration: 1500 })
      ),
      -1,
      true
    );

    rotateAnim.value = withRepeat(
      withTiming(360, { duration: 20000 }),
      -1,
      false
    );
  }, []);

  const floatingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatAnim.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateAnim.value}deg` }],
  }));

  const handleNewCapture = useCallback(() => {
    router.push('/capture');
  }, [router]);

  const recentProjects = state.projects.slice(0, 3);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0F0F1A', '#1A1A2E', '#16213E']}
        style={styles.gradient}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Animated.View entering={FadeInDown.delay(200).duration(800)}>
              <Text style={styles.appName}>Teleport 360°</Text>
              <Text style={styles.tagline}>Capturez le monde autour de vous</Text>
            </Animated.View>

            {/* 3D-like sphere animation */}
            <Animated.View style={[styles.sphereContainer, floatingStyle]}>
              <Animated.View style={[styles.sphere, rotateStyle]}>
                <LinearGradient
                  colors={['#6C63FF', '#8B83FF', '#A78BFA']}
                  style={styles.sphereGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.sphereHighlight} />
                  <View style={styles.sphereLine1} />
                  <View style={styles.sphereLine2} />
                  <View style={styles.sphereLine3} />
                  <MaterialIcons name="360" size={40} color="rgba(255,255,255,0.9)" />
                </LinearGradient>
              </Animated.View>
              {/* Shadow */}
              <View style={styles.sphereShadow} />
            </Animated.View>
          </View>

          {/* Capture Button */}
          <Animated.View
            entering={FadeInUp.delay(600).duration(800)}
            style={styles.captureButtonContainer}
          >
            <TouchableOpacity
              onPress={handleNewCapture}
              activeOpacity={0.8}
            >
              <Animated.View style={pulseStyle}>
                <LinearGradient
                  colors={['#6C63FF', '#4338CA']}
                  style={styles.captureButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <MaterialIcons name="camera" size={32} color="#FFFFFF" />
                  <Text style={styles.captureButtonText}>Nouvelle Capture 360°</Text>
                  <Text style={styles.captureButtonSubtext}>
                    Capturer un panorama sphérique
                  </Text>
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          {/* Stats Section */}
          <Animated.View
            entering={FadeInUp.delay(800).duration(800)}
            style={styles.statsSection}
          >
            <View style={styles.statCard}>
              <LinearGradient
                colors={['rgba(108, 99, 255, 0.15)', 'rgba(108, 99, 255, 0.05)']}
                style={styles.statGradient}
              >
                <MaterialIcons name="photo-library" size={28} color="#6C63FF" />
                <Text style={styles.statNumber}>{state.projects.length}</Text>
                <Text style={styles.statLabel}>Panoramas</Text>
              </LinearGradient>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']}
                style={styles.statGradient}
              >
                <MaterialIcons name="check-circle" size={28} color="#10B981" />
                <Text style={[styles.statNumber, { color: '#10B981' }]}>
                  {state.projects.filter((p) => p.isComplete).length}
                </Text>
                <Text style={styles.statLabel}>Terminés</Text>
              </LinearGradient>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={['rgba(245, 158, 11, 0.15)', 'rgba(245, 158, 11, 0.05)']}
                style={styles.statGradient}
              >
                <MaterialIcons name="pending" size={28} color="#F59E0B" />
                <Text style={[styles.statNumber, { color: '#F59E0B' }]}>
                  {state.projects.filter((p) => !p.isComplete).length}
                </Text>
                <Text style={styles.statLabel}>En cours</Text>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Quick Actions */}
          <Animated.View
            entering={FadeInUp.delay(1000).duration(800)}
            style={styles.quickActions}
          >
            <Text style={styles.sectionTitle}>Actions rapides</Text>
            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={handleNewCapture}
              >
                <LinearGradient
                  colors={['rgba(108, 99, 255, 0.1)', 'rgba(108, 99, 255, 0.05)']}
                  style={styles.actionGradient}
                >
                  <View style={styles.actionIconContainer}>
                    <MaterialIcons name="add-a-photo" size={24} color="#6C63FF" />
                  </View>
                  <Text style={styles.actionTitle}>Capture</Text>
                  <Text style={styles.actionSubtitle}>Nouveau panorama</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push('/(tabs)/gallery')}
              >
                <LinearGradient
                  colors={['rgba(255, 107, 107, 0.1)', 'rgba(255, 107, 107, 0.05)']}
                  style={styles.actionGradient}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(255, 107, 107, 0.15)' }]}>
                    <MaterialIcons name="collections" size={24} color="#FF6B6B" />
                  </View>
                  <Text style={styles.actionTitle}>Galerie</Text>
                  <Text style={styles.actionSubtitle}>Tout voir</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push('/(tabs)/settings')}
              >
                <LinearGradient
                  colors={['rgba(16, 185, 129, 0.1)', 'rgba(16, 185, 129, 0.05)']}
                  style={styles.actionGradient}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <MaterialIcons name="tune" size={24} color="#10B981" />
                  </View>
                  <Text style={styles.actionTitle}>Réglages</Text>
                  <Text style={styles.actionSubtitle}>Configurer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <Animated.View
              entering={FadeInUp.delay(1200).duration(800)}
              style={styles.recentSection}
            >
              <Text style={styles.sectionTitle}>Captures récentes</Text>
              {recentProjects.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={styles.recentCard}
                  onPress={() => {
                    setCurrentProject(project);
                    if (project.isComplete) {
                      router.push('/viewer');
                    } else {
                      router.push('/capture');
                    }
                  }}
                >
                  <View style={styles.recentThumbnail}>
                    {(project.panoramaUri || project.positions.find(p => p.captured && p.uri)?.uri) ? (
                      <Image
                        source={{ uri: project.panoramaUri || project.positions.find(p => p.captured && p.uri)?.uri }}
                        style={{ width: '100%', height: '100%', borderRadius: 12 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <MaterialIcons name="panorama" size={32} color="#6C63FF" />
                    )}
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentName}>{project.name}</Text>
                    <Text style={styles.recentDate}>
                      {new Date(project.createdAt).toLocaleDateString()}
                    </Text>
                    <View style={styles.recentProgress}>
                      <View
                        style={[
                          styles.recentProgressBar,
                          {
                            width: `${(project.capturedPhotos / project.totalPhotos) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.recentProgressText}>
                      {project.capturedPhotos}/{project.totalPhotos} photos
                    </Text>
                  </View>
                  <MaterialIcons
                    name={project.isComplete ? 'check-circle' : 'chevron-right'}
                    size={24}
                    color={project.isComplete ? '#10B981' : '#6B7280'}
                  />
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Bottom spacing */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  sphereContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  sphere: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  sphereGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sphereHighlight: {
    position: 'absolute',
    top: 12,
    left: 18,
    width: 30,
    height: 20,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    transform: [{ rotate: '-30deg' }],
  },
  sphereLine1: {
    position: 'absolute',
    width: 120,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    top: 40,
  },
  sphereLine2: {
    position: 'absolute',
    width: 120,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    top: 80,
  },
  sphereLine3: {
    position: 'absolute',
    width: 1,
    height: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    left: 60,
  },
  sphereShadow: {
    width: 80,
    height: 12,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    marginTop: 15,
  },
  captureButtonContainer: {
    marginBottom: 30,
  },
  captureButton: {
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 30,
    alignItems: 'center',
    gap: 8,
    elevation: 10,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  captureButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '400',
  },
  statsSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 30,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  statGradient: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#6C63FF',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  quickActions: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionGradient: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '500',
  },
  recentSection: {
    marginBottom: 20,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  recentThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  recentDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 8,
  },
  recentProgress: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  recentProgressBar: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 2,
  },
  recentProgressText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '500',
  },
});
