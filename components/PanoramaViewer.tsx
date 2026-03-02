import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PanoramaViewerProps {
    imageUri: string;
    onClose?: () => void;
    onShare?: () => void;
}

export default function PanoramaViewer({ imageUri, onClose, onShare }: PanoramaViewerProps) {
    const panX = useSharedValue(0);
    const panY = useSharedValue(0);
    const scale = useSharedValue(1);

    const imageStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: panX.value },
            { translateY: panY.value },
            { scale: scale.value },
        ],
    }));

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                {onClose && (
                    <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                        <MaterialIcons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                )}
                <Text style={styles.headerTitle}>360° Panorama</Text>
                {onShare && (
                    <TouchableOpacity onPress={onShare} style={styles.headerButton}>
                        <MaterialIcons name="share" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Panorama Image */}
            <View style={styles.viewerContainer}>
                <Animated.Image
                    source={{ uri: imageUri }}
                    style={[styles.panoramaImage, imageStyle]}
                    resizeMode="cover"
                />

                {/* Gyroscope hint */}
                <View style={styles.hintContainer}>
                    <MaterialIcons name="screen-rotation" size={20} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.hintText}>Move your device to look around</Text>
                </View>
            </View>

            {/* Controls */}
            <View style={styles.controls}>
                <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => {
                        scale.value = withSpring(Math.min(3, scale.value + 0.5));
                    }}
                >
                    <MaterialIcons name="zoom-in" size={28} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => {
                        scale.value = withSpring(Math.max(0.5, scale.value - 0.5));
                    }}
                >
                    <MaterialIcons name="zoom-out" size={28} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => {
                        panX.value = withSpring(0);
                        panY.value = withSpring(0);
                        scale.value = withSpring(1);
                    }}
                >
                    <MaterialIcons name="center-focus-strong" size={28} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    viewerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    panoramaImage: {
        width: SCREEN_WIDTH * 2,
        height: SCREEN_HEIGHT * 0.7,
    },
    hintContainer: {
        position: 'absolute',
        bottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 8,
    },
    hintText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 13,
        fontWeight: '500',
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        paddingVertical: 20,
        paddingBottom: 40,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    controlButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
});
