import Sphere360Viewer from '@/components/Sphere360Viewer';
import StitchProcessor from '@/components/StitchProcessor';
import { CAPTURE_CONFIG } from '@/constants/CaptureConfig';
import { usePanorama } from '@/context/PanoramaContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, {
    FadeIn,
    FadeInDown
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const THUMB_SIZE = 72;

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
    const thumbnailListRef = useRef<FlatList>(null);

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
        if (project) {
            savePanoramaToContext(project.id, uri);
            await saveProjects();
        }
    }, [project, savePanoramaToContext, saveProjects]);

    const handleStitchError = useCallback((error: string) => {
        Alert.alert('Erreur d\'assemblage', error);
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

    // Navigate between photos
    const navigatePhoto = useCallback((direction: 'prev' | 'next') => {
        if (!project) return;
        const capturedImages = project.positions.filter(p => p.captured && p.uri);
        const currentIdx = capturedImages.findIndex(p => p.id === selectedIndex);
        let newIdx: number;
        if (direction === 'next') {
            newIdx = (currentIdx + 1) % capturedImages.length;
        } else {
            newIdx = (currentIdx - 1 + capturedImages.length) % capturedImages.length;
        }
        const newPhoto = capturedImages[newIdx];
        if (newPhoto?.uri) {
            setSelectedImage(newPhoto.uri);
            setSelectedIndex(newPhoto.id);
            // Scroll thumbnail list
            thumbnailListRef.current?.scrollToIndex({ index: newIdx, animated: true, viewPosition: 0.5 });
        }
    }, [project, selectedIndex]);

    if (!project) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#0F0F1A', '#1A1A2E', '#16213E']}
                    style={[styles.gradient, { justifyContent: 'center', alignItems: 'center' }]}
                >
                    <View style={styles.errorIconWrap}>
                        <MaterialIcons name="error-outline" size={48} color="rgba(255,255,255,0.3)" />
                    </View>
                    <Text style={styles.errorText}>Aucun projet sélectionné</Text>
                    <TouchableOpacity onPress={() => router.back()} style={styles.errorButton}>
                        <MaterialIcons name="arrow-back" size={18} color="#6C63FF" />
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
                            {/* Animated icon */}
                            <View style={styles.stitchIconWrap}>
                                <MaterialIcons name="auto-awesome" size={40} color="#6C63FF" />
                            </View>
                            <Text style={styles.stitchingTitle}>Assemblage du panorama</Text>
                            <Text style={styles.stitchingSubtitle}>
                                {stitchProgress || 'Préparation...'}
                            </Text>

                            {/* Mini photo grid preview */}
                            <View style={styles.stitchPreviewRow}>
                                {project.positions.filter(p => p.captured && p.uri).slice(0, 6).map((pos) => (
                                    <View key={pos.id} style={styles.stitchPreviewThumb}>
                                        <Image
                                            source={{ uri: pos.uri }}
                                            style={styles.stitchPreviewImage}
                                            resizeMode="cover"
                                        />
                                    </View>
                                ))}
                                {project.positions.filter(p => p.captured).length > 6 && (
                                    <View style={styles.stitchPreviewMore}>
                                        <Text style={styles.stitchPreviewMoreText}>
                                            +{project.positions.filter(p => p.captured).length - 6}
                                        </Text>
                                    </View>
                                )}
                            </View>

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

    // Group positions by row
    const rowGroups: { [key: number]: typeof project.positions } = {};
    project.positions.forEach((pos) => {
        if (!rowGroups[pos.row]) rowGroups[pos.row] = [];
        rowGroups[pos.row].push(pos);
    });

    // Current selected position info
    const selectedPos = project.positions.find(p => p.id === selectedIndex);

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
                        <MaterialIcons name="arrow-back" size={22} color="#FFFFFF" />
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
                        <MaterialIcons name="share" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>

                {/* Main Image Viewer with navigation */}
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

                            {/* Left/Right navigation arrows */}
                            {capturedImages.length > 1 && (
                                <>
                                    <TouchableOpacity
                                        style={[styles.navArrow, styles.navArrowLeft]}
                                        onPress={() => navigatePhoto('prev')}
                                    >
                                        <MaterialIcons name="chevron-left" size={28} color="#FFFFFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.navArrow, styles.navArrowRight]}
                                        onPress={() => navigatePhoto('next')}
                                    >
                                        <MaterialIcons name="chevron-right" size={28} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    ) : (
                        <View style={styles.noImageContainer}>
                            <MaterialIcons name="image" size={48} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.noImageText}>Aucune image sélectionnée</Text>
                        </View>
                    )}

                    {/* Image info overlay */}
                    {selectedPos && (
                        <View style={styles.imageInfo}>
                            <View style={styles.imageInfoTag}>
                                <MaterialIcons
                                    name={CAPTURE_CONFIG.ROW_ICONS[selectedPos.row] as keyof typeof MaterialIcons.glyphMap}
                                    size={12}
                                    color={CAPTURE_CONFIG.ROW_COLORS[selectedPos.row]}
                                />
                                <Text style={styles.imageInfoText}>
                                    {selectedPos.label || `Photo ${selectedPos.id + 1}`}
                                </Text>
                            </View>
                        </View>
                    )}
                </Animated.View>

                {/* Action buttons */}
                <Animated.View
                    entering={FadeInDown.delay(200).duration(400)}
                    style={styles.actionRow}
                >
                    {/* View 360° button */}
                    {panoramaUri ? (
                        <TouchableOpacity
                            style={[styles.actionButton, { flex: 1 }]}
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
                            style={[styles.actionButton, { flex: 1 }]}
                            onPress={startStitching}
                        >
                            <LinearGradient
                                colors={capturedCount >= 3 ? ['#6C63FF', '#4338CA'] : ['#333', '#444']}
                                style={styles.actionButtonGradient}
                            >
                                <MaterialIcons name="auto-awesome" size={20} color="#FFFFFF" />
                                <Text style={styles.actionButtonText}>
                                    Assembler ({capturedCount} photos)
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    {/* Resume capture button (if not complete) */}
                    {!project.isComplete && (
                        <TouchableOpacity
                            style={styles.resumeButton}
                            onPress={() => router.push('/capture')}
                        >
                            <MaterialIcons name="camera-alt" size={20} color="#F59E0B" />
                        </TouchableOpacity>
                    )}
                </Animated.View>

                {/* Capture Grid */}
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
                                const rowColor = CAPTURE_CONFIG.ROW_COLORS[rowIndex];
                                const rowCaptured = rowPositions.filter(p => p.captured).length;

                                return (
                                    <View key={rowIndex}>
                                        <View style={styles.rowLabelContainer}>
                                            <View style={[styles.rowLabelDot, { backgroundColor: rowColor }]} />
                                            <Text style={[styles.rowLabel, { color: rowColor }]}>{rowLabel}</Text>
                                            <Text style={styles.rowCount}>{rowCaptured}/{rowPositions.length}</Text>
                                        </View>
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
                                                            isCaptured && [styles.gridCellCaptured, { borderColor: rowColor + '50' }],
                                                            isSelected && [styles.gridCellSelected, { borderColor: rowColor }],
                                                        ]}
                                                        onPress={() => {
                                                            if (position.captured && position.uri) {
                                                                setSelectedImage(position.uri);
                                                                setSelectedIndex(position.id);
                                                            }
                                                        }}
                                                    >
                                                        {isCaptured && position.uri ? (
                                                            <Image
                                                                source={{ uri: position.uri }}
                                                                style={styles.gridCellImage}
                                                                resizeMode="cover"
                                                            />
                                                        ) : (
                                                            <View style={styles.gridCellEmpty} />
                                                        )}
                                                        {isSelected && (
                                                            <View style={[styles.gridCellSelectedBorder, { borderColor: rowColor }]} />
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
                    <FlatList
                        ref={thumbnailListRef}
                        data={capturedImages}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.thumbnailContent}
                        keyExtractor={(item) => String(item.id)}
                        getItemLayout={(_, index) => ({
                            length: THUMB_SIZE + 8,
                            offset: (THUMB_SIZE + 8) * index,
                            index,
                        })}
                        renderItem={({ item: position }) => (
                            <TouchableOpacity
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
                                <View style={styles.thumbnailLabelWrap}>
                                    <Text style={styles.thumbnailLabel}>
                                        {position.label || `P${position.id + 1}`}
                                    </Text>
                                </View>
                                {selectedIndex === position.id && (
                                    <View style={styles.thumbnailSelectedOverlay}>
                                        <View style={styles.thumbnailSelectedDot} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}
                    />
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
        paddingBottom: 10,
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
    navArrow: {
        position: 'absolute',
        width: 40,
        height: 60,
        borderRadius: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
    },
    navArrowLeft: {
        left: 8,
        top: '50%',
        marginTop: -30,
    },
    navArrowRight: {
        right: 8,
        top: '50%',
        marginTop: -30,
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
    },
    imageInfoText: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 12,
        fontWeight: '600',
    },

    // Action row
    actionRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 10,
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
    resumeButton: {
        width: 50,
        height: 50,
        borderRadius: 14,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },

    // Grid
    gridSection: {
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    gridTitle: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        letterSpacing: 0.3,
    },
    gridContainer: {
        gap: 8,
    },
    rowLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
        paddingLeft: 2,
    },
    rowLabelDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    rowLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    rowCount: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.25)',
        fontWeight: '600',
    },
    gridRow: {
        flexDirection: 'row',
        gap: 3,
    },
    gridCell: {
        flex: 1,
        maxWidth: 38,
        aspectRatio: 1,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
    },
    gridCellCaptured: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    gridCellSelected: {
        borderWidth: 2,
    },
    gridCellSelectedBorder: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 6,
        borderWidth: 2,
    },
    gridCellImage: {
        width: '100%',
        height: '100%',
        borderRadius: 6,
    },
    gridCellEmpty: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },

    // Thumbnails
    thumbnailSection: {
        paddingVertical: 6,
        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    },
    thumbnailContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    thumbnail: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    thumbnailSelected: {
        borderColor: '#6C63FF',
        shadowColor: '#6C63FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 5,
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    thumbnailLabelWrap: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 2,
        paddingHorizontal: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    thumbnailLabel: {
        textAlign: 'center',
        color: '#FFFFFF',
        fontSize: 8,
        fontWeight: '700',
    },
    thumbnailSelectedOverlay: {
        position: 'absolute',
        top: 4,
        right: 4,
    },
    thumbnailSelectedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#6C63FF',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },

    // Stitching
    stitchingContainer: {
        alignItems: 'center',
        gap: 16,
        padding: 30,
    },
    stitchIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: 'rgba(108, 99, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(108, 99, 255, 0.2)',
    },
    stitchingTitle: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '700',
    },
    stitchingSubtitle: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
    },
    stitchPreviewRow: {
        flexDirection: 'row',
        gap: 6,
        marginVertical: 12,
    },
    stitchPreviewThumb: {
        width: 44,
        height: 44,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    stitchPreviewImage: {
        width: '100%',
        height: '100%',
    },
    stitchPreviewMore: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    stitchPreviewMoreText: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 12,
        fontWeight: '700',
    },
    cancelButton: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    cancelText: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 14,
        fontWeight: '500',
    },

    // Error
    errorIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    errorText: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 16,
        fontWeight: '500',
    },
    errorButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 20,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(108, 99, 255, 0.1)',
    },
    backLink: {
        color: '#6C63FF',
        fontSize: 15,
        fontWeight: '600',
    },
});
