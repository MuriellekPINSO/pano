import { CAPTURE_CONFIG } from '@/constants/CaptureConfig';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function SettingsScreen() {
    const [autoCapture, setAutoCapture] = useState(true);
    const [hapticFeedback, setHapticFeedback] = useState(true);
    const [highQuality, setHighQuality] = useState(true);
    const [soundEffects, setSoundEffects] = useState(true);
    const [gyroGuide, setGyroGuide] = useState(true);

    const settingSections = [
        {
            title: 'Capture Settings',
            icon: 'camera' as const,
            items: [
                {
                    title: 'Auto-Capture',
                    subtitle: 'Automatically take photo when aligned',
                    icon: 'auto-awesome' as const,
                    value: autoCapture,
                    onToggle: setAutoCapture,
                },
                {
                    title: 'High Quality',
                    subtitle: 'Capture at maximum resolution',
                    icon: 'high-quality' as const,
                    value: highQuality,
                    onToggle: setHighQuality,
                },
                {
                    title: 'Gyroscope Guide',
                    subtitle: 'Use device motion for positioning',
                    icon: 'screen-rotation' as const,
                    value: gyroGuide,
                    onToggle: setGyroGuide,
                },
            ],
        },
        {
            title: 'Experience',
            icon: 'tune' as const,
            items: [
                {
                    title: 'Haptic Feedback',
                    subtitle: 'Vibrate on capture and alignment',
                    icon: 'vibration' as const,
                    value: hapticFeedback,
                    onToggle: setHapticFeedback,
                },
                {
                    title: 'Sound Effects',
                    subtitle: 'Play sounds during capture',
                    icon: 'volume-up' as const,
                    value: soundEffects,
                    onToggle: setSoundEffects,
                },
            ],
        },
    ];

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
                    {/* Header */}
                    <View style={styles.header}>
                        <Animated.Text
                            entering={FadeInDown.duration(600)}
                            style={styles.title}
                        >
                            Settings
                        </Animated.Text>
                        <Animated.Text
                            entering={FadeInDown.delay(200).duration(600)}
                            style={styles.subtitle}
                        >
                            Configure your capture experience
                        </Animated.Text>
                    </View>

                    {/* Capture Info Card */}
                    <Animated.View
                        entering={FadeInDown.delay(300).duration(600)}
                    >
                        <LinearGradient
                            colors={['rgba(108, 99, 255, 0.15)', 'rgba(108, 99, 255, 0.05)']}
                            style={styles.infoCard}
                        >
                            <View style={styles.infoRow}>
                                <View style={styles.infoItem}>
                                    <MaterialIcons name="grid-on" size={20} color="#6C63FF" />
                                    <Text style={styles.infoValue}>
                                        {CAPTURE_CONFIG.HORIZONTAL_STEP}°
                                    </Text>
                                    <Text style={styles.infoLabel}>Step Angle</Text>
                                </View>
                                <View style={styles.infoDivider} />
                                <View style={styles.infoItem}>
                                    <MaterialIcons name="photo-camera" size={20} color="#6C63FF" />
                                    <Text style={styles.infoValue}>{CAPTURE_CONFIG.TOTAL_PHOTOS}</Text>
                                    <Text style={styles.infoLabel}>Total Photos</Text>
                                </View>
                                <View style={styles.infoDivider} />
                                <View style={styles.infoItem}>
                                    <MaterialIcons name="rotate-left" size={20} color="#6C63FF" />
                                    <Text style={styles.infoValue}>{CAPTURE_CONFIG.POSITION_TOLERANCE}°</Text>
                                    <Text style={styles.infoLabel}>Tolerance</Text>
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* Setting Sections */}
                    {settingSections.map((section, sIndex) => (
                        <Animated.View
                            key={section.title}
                            entering={FadeInDown.delay(400 + sIndex * 100).duration(600)}
                            style={styles.section}
                        >
                            <View style={styles.sectionHeader}>
                                <MaterialIcons name={section.icon} size={20} color="#6C63FF" />
                                <Text style={styles.sectionTitle}>{section.title}</Text>
                            </View>
                            <View style={styles.sectionContent}>
                                {section.items.map((item, iIndex) => (
                                    <View
                                        key={item.title}
                                        style={[
                                            styles.settingItem,
                                            iIndex < section.items.length - 1 && styles.settingItemBorder,
                                        ]}
                                    >
                                        <View style={styles.settingIconContainer}>
                                            <MaterialIcons name={item.icon} size={22} color="#6C63FF" />
                                        </View>
                                        <View style={styles.settingInfo}>
                                            <Text style={styles.settingTitle}>{item.title}</Text>
                                            <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
                                        </View>
                                        <Switch
                                            value={item.value}
                                            onValueChange={item.onToggle}
                                            trackColor={{
                                                false: 'rgba(255, 255, 255, 0.1)',
                                                true: 'rgba(108, 99, 255, 0.5)',
                                            }}
                                            thumbColor={item.value ? '#6C63FF' : '#9CA3AF'}
                                            ios_backgroundColor="rgba(255, 255, 255, 0.1)"
                                        />
                                    </View>
                                ))}
                            </View>
                        </Animated.View>
                    ))}

                    {/* Danger Zone */}
                    <Animated.View
                        entering={FadeInDown.delay(700).duration(600)}
                        style={styles.section}
                    >
                        <View style={styles.sectionHeader}>
                            <MaterialIcons name="warning" size={20} color="#FF6B6B" />
                            <Text style={[styles.sectionTitle, { color: '#FF6B6B' }]}>Data</Text>
                        </View>
                        <View style={styles.sectionContent}>
                            <TouchableOpacity
                                style={styles.dangerButton}
                                onPress={() => {
                                    Alert.alert(
                                        'Clear All Data',
                                        'This will delete all captured panoramas. This action cannot be undone.',
                                        [
                                            { text: 'Cancel', style: 'cancel' },
                                            { text: 'Clear', style: 'destructive', onPress: () => { } },
                                        ]
                                    );
                                }}
                            >
                                <MaterialIcons name="delete-forever" size={22} color="#FF6B6B" />
                                <Text style={styles.dangerButtonText}>Clear All Panoramas</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>

                    {/* About */}
                    <Animated.View
                        entering={FadeInDown.delay(800).duration(600)}
                        style={styles.aboutSection}
                    >
                        <Text style={styles.aboutAppName}>Teleport 360°</Text>
                        <Text style={styles.aboutVersion}>Version 1.0.0</Text>
                        <Text style={styles.aboutDescription}>
                            Capture the world in stunning 360° panoramas
                        </Text>
                    </Animated.View>

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
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 70 : 50,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 4,
        fontWeight: '500',
    },
    infoCard: {
        borderRadius: 18,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    infoItem: {
        alignItems: 'center',
        gap: 6,
    },
    infoValue: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    infoLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        fontWeight: '500',
    },
    infoDivider: {
        width: 1,
        height: 50,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
    sectionContent: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    settingItemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    settingIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(108, 99, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    settingInfo: {
        flex: 1,
    },
    settingTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 2,
    },
    settingSubtitle: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
    },
    dangerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    dangerButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FF6B6B',
    },
    aboutSection: {
        alignItems: 'center',
        paddingVertical: 30,
        gap: 6,
    },
    aboutAppName: {
        fontSize: 18,
        fontWeight: '800',
        color: '#6C63FF',
        letterSpacing: 0.5,
    },
    aboutVersion: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.3)',
    },
    aboutDescription: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.4)',
        fontWeight: '500',
    },
});
