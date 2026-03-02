// Beautiful animated onboarding screen — shown only on first launch
// 3 slides with smooth animations like Teleport's first-launch experience

import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewToken,
} from 'react-native';
import Animated, {
    FadeIn,
    FadeInUp,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingProps {
    onComplete: () => void;
}

interface SlideData {
    id: string;
    icon: string;
    iconColor: string;
    title: string;
    subtitle: string;
    description: string;
    gradient: string[];
    animationType: 'rotate' | 'pulse' | 'float';
}

const slides: SlideData[] = [
    {
        id: '1',
        icon: 'camera',
        iconColor: '#6C63FF',
        title: 'Capturez en 360°',
        subtitle: 'Comme un professionnel',
        description:
            'Prenez des photos panoramiques immersives avec juste votre téléphone. Aucun équipement spécial nécessaire.',
        gradient: ['#0F0F1A', '#1A1A3E', '#16213E'],
        animationType: 'rotate',
    },
    {
        id: '2',
        icon: 'screen-rotation',
        iconColor: '#10B981',
        title: 'Guidage intelligent',
        subtitle: 'Suivez le point',
        description:
            'Un point lumineux vous guide exactement où pointer. Pivotez lentement sur vous-même — la capture est automatique.',
        gradient: ['#0F0F1A', '#0F2A1A', '#16213E'],
        animationType: 'pulse',
    },
    {
        id: '3',
        icon: '360',
        iconColor: '#F59E0B',
        title: 'Explorez le résultat',
        subtitle: 'Immersion totale',
        description:
            'Vos photos sont assemblées automatiquement. Explorez votre panorama en bougeant votre téléphone ou en glissant.',
        gradient: ['#0F0F1A', '#2A1A0F', '#16213E'],
        animationType: 'float',
    },
];

function AnimatedIcon({ icon, color, type }: { icon: string; color: string; type: string }) {
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);

    React.useEffect(() => {
        if (type === 'rotate') {
            rotation.value = withRepeat(
                withSequence(
                    withTiming(15, { duration: 1500 }),
                    withTiming(-15, { duration: 3000 }),
                    withTiming(0, { duration: 1500 })
                ),
                -1,
                false
            );
        } else if (type === 'pulse') {
            scale.value = withRepeat(
                withSequence(
                    withTiming(1.15, { duration: 1000 }),
                    withTiming(0.95, { duration: 1000 })
                ),
                -1,
                true
            );
        } else if (type === 'float') {
            translateY.value = withRepeat(
                withSequence(
                    withTiming(-12, { duration: 1500 }),
                    withTiming(12, { duration: 1500 })
                ),
                -1,
                true
            );
        }
    }, [type]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [
            { rotate: `${rotation.value}deg` },
            { scale: scale.value },
            { translateY: translateY.value },
        ],
    }));

    return (
        <Animated.View style={[styles.iconContainer, animStyle]}>
            <View style={[styles.iconCircle, { borderColor: color + '40' }]}>
                <View style={[styles.iconInner, { backgroundColor: color + '15' }]}>
                    <MaterialIcons name={icon as any} size={64} color={color} />
                </View>
            </View>
            {/* Decorative rings */}
            <View style={[styles.ring1, { borderColor: color + '15' }]} />
            <View style={[styles.ring2, { borderColor: color + '08' }]} />
        </Animated.View>
    );
}

function Slide({ item, index }: { item: SlideData; index: number }) {
    return (
        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <LinearGradient colors={item.gradient as any} style={styles.slideGradient}>
                {/* Icon with animation */}
                <View style={styles.iconSection}>
                    <AnimatedIcon icon={item.icon} color={item.iconColor} type={item.animationType} />
                </View>

                {/* Text content */}
                <Animated.View
                    entering={FadeInUp.delay(200).duration(600)}
                    style={styles.textSection}
                >
                    <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
                    <Text style={styles.slideTitle}>{item.title}</Text>
                    <Text style={styles.slideDescription}>{item.description}</Text>
                </Animated.View>
            </LinearGradient>
        </View>
    );
}

export default function OnboardingScreen({ onComplete }: OnboardingProps) {
    const flatListRef = useRef<FlatList>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const buttonScale = useSharedValue(1);

    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems.length > 0 && viewableItems[0].index !== null) {
                setCurrentIndex(viewableItems[0].index);
            }
        },
        []
    );

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const handleNext = () => {
        if (currentIndex < slides.length - 1) {
            flatListRef.current?.scrollToIndex({
                index: currentIndex + 1,
                animated: true,
            });
        } else {
            onComplete();
        }
    };

    const handleSkip = () => {
        onComplete();
    };

    const buttonAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: buttonScale.value }],
    }));

    const isLastSlide = currentIndex === slides.length - 1;

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Slides */}
            <FlatList
                ref={flatListRef}
                data={slides}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                renderItem={({ item, index }) => <Slide item={item} index={index} />}
                keyExtractor={(item) => item.id}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
            />

            {/* Bottom controls */}
            <Animated.View
                entering={FadeIn.delay(500).duration(400)}
                style={styles.bottomSection}
            >
                {/* Page indicators */}
                <View style={styles.indicators}>
                    {slides.map((_, index) => (
                        <Animated.View
                            key={index}
                            style={[
                                styles.dot,
                                currentIndex === index && styles.dotActive,
                                {
                                    backgroundColor:
                                        currentIndex === index
                                            ? slides[currentIndex].iconColor
                                            : 'rgba(255,255,255,0.2)',
                                },
                            ]}
                        />
                    ))}
                </View>

                {/* Action buttons */}
                <View style={styles.buttonRow}>
                    {!isLastSlide && (
                        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                            <Text style={styles.skipText}>Passer</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        onPress={handleNext}
                        activeOpacity={0.8}
                        style={styles.nextButtonWrapper}
                    >
                        <Animated.View style={buttonAnimStyle}>
                            <LinearGradient
                                colors={
                                    isLastSlide
                                        ? ['#6C63FF', '#4338CA']
                                        : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.08)']
                                }
                                style={styles.nextButton}
                            >
                                {isLastSlide ? (
                                    <>
                                        <Text style={styles.nextButtonTextFinal}>Commencer</Text>
                                        <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.nextButtonText}>Suivant</Text>
                                        <MaterialIcons
                                            name="arrow-forward"
                                            size={18}
                                            color="rgba(255,255,255,0.7)"
                                        />
                                    </>
                                )}
                            </LinearGradient>
                        </Animated.View>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
    },
    slide: {
        flex: 1,
    },
    slideGradient: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 32,
    },

    // Icon section
    iconSection: {
        alignItems: 'center',
        justifyContent: 'center',
        height: SCREEN_HEIGHT * 0.4,
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 140,
        height: 140,
        borderRadius: 70,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconInner: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ring1: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        borderWidth: 1,
    },
    ring2: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        borderWidth: 1,
    },

    // Text section
    textSection: {
        alignItems: 'center',
        paddingTop: 16,
    },
    slideSubtitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    slideTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 16,
    },
    slideDescription: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.55)',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 300,
    },

    // Bottom section
    bottomSection: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Platform.OS === 'ios' ? 50 : 32,
        paddingHorizontal: 24,
    },
    indicators: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 28,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    dotActive: {
        width: 24,
        borderRadius: 4,
    },

    // Buttons
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    skipButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    skipText: {
        color: 'rgba(255, 255, 255, 0.35)',
        fontSize: 15,
        fontWeight: '500',
    },
    nextButtonWrapper: {
        marginLeft: 'auto',
    },
    nextButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    nextButtonText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 15,
        fontWeight: '600',
    },
    nextButtonTextFinal: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
