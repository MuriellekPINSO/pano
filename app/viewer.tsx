import Sphere360Viewer from '@/components/Sphere360Viewer';
import StitchProcessor from '@/components/StitchProcessor';
import { CAPTURE_CONFIG } from '@/constants/CaptureConfig';
import { usePanorama } from '@/context/PanoramaContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
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
    FadeIn,
    FadeInDown,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_WIDTH - 52) / 4;

type ViewMode = 'grid' | '360' | 'stitching';

export default function ViewerScreen() {
    const router = useRouter();
    const { state, setCurrentProject, setPanoramaUri: savePanoramaToContext, saveProjects } = usePanorama();
    const project = state.currentProject;
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [panoramaUri, setPanoramaUri] = useState<string | null>(project?.panoramaUri || null);
    const [stitchProgress, setStitchProgress] = useState('');

    useEffect(() => {
        if (project) {
            const firstCaptured = project.positions.find((p) => p.captured && p.uri);
            if (firstCaptured?.uri) {
                setSelectedImage(firstCaptured.uri);
                setSelectedIndex(firstCaptured.id);
            }
            if (project.panoramaUri) {
                setPanoramaUri(project.panoramaUri);
            }

            // AUTO-STITCH: If project is complete but no panorama exists, auto-start stitching
            // This enables the seamless capture → stitch → view flow
            if (project.isComplete && !project.panoramaUri && viewMode === 'grid') {
                setViewMode('stitching');
            }
        }
    }, [project]);

    const handleShare = useCallback(async () => {
        const uriToShare = panoramaUri || selectedImage;
        if (uriToShare) {
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uriToShare);
            } else {
                Alert.alert('Partage', 'Le partage n\'est pas disponible sur cet appareil.');
            }
        }
    }, [panoramaUri, selectedImage]);

    const handleStitchComplete = useCallback(async (uri: string) => {
        setPanoramaUri(uri);
        setViewMode('360');
        // Persist the panorama URI in the project context
        if (project) {
            savePanoramaToContext(project.id, uri);
            await saveProjects();
        }
    }, [project, savePanoramaToContext, saveProjects]);

    const handleStitchError = useCallback((error: string) => {
        Alert.alert('Erreur de stitching', error);
        setViewMode('grid');
    }, []);

    const startStitching = useCallback(() => {
        if (!project) return;
        const capturedCount = project.positions.filter(p => p.captured).length;
        if (capturedCount < 3) {
            Alert.alert(
                'Photos insuffisantes',
                `Il faut au moins 3 photos pour créer un panorama. Vous en avez ${capturedCount}.`
            );
            return;
        }
        setViewMode('stitching');
    }, [project]);

    if (!project) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#0F0F1A', '#1A1A2E', '#16213E']}
                    style={[styles.gradient, { justifyContent: 'center', alignItems: 'center' }]}
                >
                    <MaterialIcons name="error-outline" size={64} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.errorText}>Aucun projet sélectionné</Text>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.backLink}>Retour</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </View>
        );
    }

    // 360° Viewer mode
    if (viewMode === '360' && panoramaUri) {
        return (
            <View style={styles.container}>
                <StatusBar style="light" />
                <Sphere360Viewer
                    imageUri={panoramaUri}
                    onClose={() => setViewMode('grid')}
                    onShare={handleShare}
                />
            </View>
        );
    }

    // Stitching mode
    if (viewMode === 'stitching') {
        return (
            <View style={styles.container}>
                <StatusBar style="light" />
                <LinearGradient
                    colors={['#0F0F1A', '#1A1A2E', '#16213E']}
                    style={[styles.gradient, { justifyContent: 'center', alignItems: 'center' }]}
                >
                    <Animated.View entering={FadeIn.duration(400)}>
                        <View style={styles.stitchingContainer}>
                            <MaterialIcons name="auto-awesome" size={48} color="#6C63FF" />
                            <Text style={styles.stitchingTitle}>Assemblage du panorama</Text>
                            <Text style={styles.stitchingSubtitle}>
                                {stitchProgress || 'Préparation...'}
                            </Text>
                            <StitchProcessor
                                positions={project.positions}
                                projectId={project.id}
                                onComplete={handleStitchComplete}
                                onError={handleStitchError}
                                onProgress={setStitchProgress}
                            />
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => setViewMode('grid')}
                            >
                                <Text style={styles.cancelText}>Annuler</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </LinearGradient>
            </View>
        );
    }

    // Grid view mode (default)
    const capturedImages = project.positions.filter((p) => p.captured && p.uri);
    const capturedCount = capturedImages.length;

    // Group positions by row for the new 5-row grid  
    const rowGroups: { [key: number]: typeof project.positions } = {};
    project.positions.forEach((pos) => {
        if (!rowGroups[pos.row]) rowGroups[pos.row] = [];
        rowGroups[pos.row].push(pos);
    });

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <LinearGradient
                colors={['#0F0F1A', '#1A1A2E', '#16213E']}
                style={styles.gradient}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={() => {
                            setCurrentProject(null);
                            router.back();
                        }}
                    >
                        <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {project.name}
                        </Text>
                        <Text style={styles.headerSubtitle}>
                            {capturedCount}/{project.totalPhotos} photos
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
                        <MaterialIcons name="share" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>

                {/* Main Image Viewer */}
                <Animated.View
                    entering={FadeIn.duration(600)}
                    style={styles.viewerContainer}
                >
                    {selectedImage ? (
                        <View style={styles.imageContainer}>
                            <Image
                                source={{ uri: selectedImage }}
                                style={styles.mainImage}
                                resizeMode="contain"
                            />
                        </View>
                    ) : (
                        <View style={styles.noImageContainer}>
                            <MaterialIcons name="image" size={48} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.noImageText}>Aucune image sélectionnée</Text>
                        </View>
                    )}

                    {/* Image info */}
                    <View style={styles.imageInfo}>
                        <View style={styles.imageInfoTag}>
                            <Text style={styles.imageInfoText}>
                                Photo {selectedIndex + 1} / {project.totalPhotos}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Action buttons */}
                <Animated.View
                    entering={FadeInDown.delay(200).duration(400)}
                    style={styles.actionRow}
                >
                    {/* View 360° button */}
                    {panoramaUri ? (
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => setViewMode('360')}
                        >
                            <LinearGradient
                                colors={['#6C63FF', '#4338CA']}
                                style={styles.actionButtonGradient}
                            >
                                <MaterialIcons name="360" size={22} color="#FFFFFF" />
                                <Text style={styles.actionButtonText}>Voir en 360°</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={startStitching}
                        >
                            <LinearGradient
                                colors={capturedCount >= 3 ? ['#6C63FF', '#4338CA'] : ['#333', '#444']}
                                style={styles.actionButtonGradient}
                            >
                                <MaterialIcons name="auto-awesome" size={22} color="#FFFFFF" />
                                <Text style={styles.actionButtonText}>
                                    Assembler le panorama
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </Animated.View>

                {/* Capture Grid — adapted for 5 rows */}
                <Animated.View
                    entering={FadeInDown.delay(300).duration(600)}
                    style={styles.gridSection}
                >
                    <Text style={styles.gridTitle}>Grille de capture</Text>
                    <View style={styles.gridContainer}>
                        {Object.keys(rowGroups)
                            .sort((a, b) => Number(a) - Number(b))
                            .map((rowKey) => {
                                const rowIndex = Number(rowKey);
                                const rowPositions = rowGroups[rowIndex];
                                const rowLabel = CAPTURE_CONFIG.ROW_LABELS[rowIndex] || `Row ${rowIndex}`;

                                return (
                                    <View key={rowIndex}>
                                        <Text style={styles.rowLabel}>{rowLabel}</Text>
                                        <View style={[
                                            styles.gridRow,
                                            rowPositions.length === 1 && { justifyContent: 'center' },
                                        ]}>
                                            {rowPositions.map((position) => {
                                                const isSelected = position.id === selectedIndex;
                                                const isCaptured = position.captured;

                                                return (
                                                    <TouchableOpacity
                                                        key={`${position.row}-${position.col}`}
                                                        style={[
                                                            styles.gridCell,
                                                            isCaptured && styles.gridCellCaptured,
                                                            isSelected && styles.gridCellSelected,
                                                        ]}
                                                        onPress={() => {
                                                            if (position.captured && position.uri) {
                                                                setSelectedImage(position.uri);
                                                                setSelectedIndex(position.id);
                                                            }
                                                        }}
                                                    >
                                                        {isCaptured ? (
                                                            <MaterialIcons name="check" size={12} color="#FFFFFF" />
                                                        ) : (
                                                            <View style={styles.gridCellEmpty} />
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                );
                            })}
                    </View>
                </Animated.View>

                {/* Thumbnail strip */}
                <Animated.View
                    entering={FadeInDown.delay(500).duration(600)}
                    style={styles.thumbnailSection}
                >
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.thumbnailContent}
                    >
                        {capturedImages.map((position) => (
                            <TouchableOpacity
                                key={position.id}
                                style={[
                                    styles.thumbnail,
                                    selectedIndex === position.id && styles.thumbnailSelected,
                                ]}
                                onPress={() => {
                                    setSelectedImage(position.uri!);
                                    setSelectedIndex(position.id);
                                }}
                            >
                                <Image
                                    source={{ uri: position.uri }}
                                    style={styles.thumbnailImage}
                                    resizeMode="cover"
                                />
                                <Text style={styles.thumbnailLabel}>
                                    {position.label || `P${position.id + 1}`}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </Animated.View>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    headerButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: 12,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    headerSubtitle: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 2,
    },
    viewerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 16,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    imageContainer: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainImage: {
        width: '100%',
        height: '100%',
    },
    noImageContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    noImageText: {
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 15,
        fontWeight: '500',
    },
    imageInfo: {
        position: 'absolute',
        bottom: 12,
        left: 12,
    },
    imageInfoTag: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    imageInfoText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 12,
        fontWeight: '600',
    },

    // Action row
    actionRow: {
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    actionButton: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    actionButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 14,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },

    // Grid
    gridSection: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    gridTitle: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        letterSpacing: 0.3,
    },
    gridContainer: {
        gap: 6,
    },
    rowLabel: {
        color: 'rgba(255, 255, 255, 0.35)',
        fontSize: 10,
        fontWeight: '600',
        marginBottom: 3,
        paddingLeft: 2,
    },
    gridRow: {
        flexDirection: 'row',
        gap: 3,
    },
    gridCell: {
        flex: 1,
        maxWidth: 36,
        aspectRatio: 1,
        borderRadius: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    gridCellCaptured: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    gridCellSelected: {
        backgroundColor: 'rgba(108, 99, 255, 0.3)',
        borderColor: '#6C63FF',
        borderWidth: 2,
    },
    gridCellEmpty: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },

    // Thumbnails
    thumbnailSection: {
        paddingVertical: 8,
        paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    },
    thumbnailContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    thumbnail: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    thumbnailSelected: {
        borderColor: '#6C63FF',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    thumbnailLabel: {
        position: 'absolute',
        bottom: 2,
        left: 2,
        right: 2,
        textAlign: 'center',
        color: '#FFFFFF',
        fontSize: 8,
        fontWeight: '700',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 4,
        paddingVertical: 1,
    },

    // Stitching
    stitchingContainer: {
        alignItems: 'center',
        gap: 16,
        padding: 30,
    },
    stitchingTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
    },
    stitchingSubtitle: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
    },
    cancelButton: {
        marginTop: 20,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    cancelText: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 14,
        fontWeight: '500',
    },

    // Error
    errorText: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 16,
        fontWeight: '500',
        marginTop: 16,
    },
    backLink: {
        color: '#6C63FF',
        fontSize: 15,
        fontWeight: '600',
        marginTop: 16,
    },
});
