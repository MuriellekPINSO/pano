import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F0F1A', '#1A1A2E', '#16213E']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={['#6C63FF', '#4338CA']}
              style={styles.iconGradient}
            >
              <MaterialIcons name="360" size={48} color="#FFFFFF" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Teleport 360°</Text>
          <Text style={styles.version}>Version 1.0.0</Text>

          <Text style={styles.description}>
            Capture stunning 360° panoramic photos with just your phone.
            Simply point your camera, follow the guided positions, and
            Teleport will help you create a seamless spherical panorama.
          </Text>

          {/* Features */}
          <View style={styles.features}>
            {[
              { icon: 'camera', text: 'Guided 360° capture' },
              { icon: 'screen-rotation', text: 'Gyroscope-assisted positioning' },
              { icon: 'grid-on', text: '24-position capture grid' },
              { icon: 'photo-library', text: 'Panorama gallery' },
              { icon: 'share', text: 'Easy sharing' },
            ].map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <View style={styles.featureDot}>
                  <MaterialIcons name={feature.icon as any} size={18} color="#6C63FF" />
                </View>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
            ))}
          </View>

          {/* Inspired by */}
          <View style={styles.inspiredSection}>
            <Text style={styles.inspiredLabel}>Inspired by</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL('https://www.teleport360.app')}
            >
              <Text style={styles.inspiredLink}>Teleport: 360° Camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
      <StatusBar style="light" />
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
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 40,
  },
  iconContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 10,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  iconGradient: {
    width: 90,
    height: 90,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  version: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 4,
    marginBottom: 20,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  features: {
    width: '100%',
    gap: 12,
    marginBottom: 30,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  featureDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  inspiredSection: {
    alignItems: 'center',
    gap: 6,
  },
  inspiredLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  inspiredLink: {
    fontSize: 14,
    color: '#6C63FF',
    fontWeight: '600',
  },
});
