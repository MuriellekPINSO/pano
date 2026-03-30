import { PanoramaProject } from '@/constants/CaptureConfig';
import { usePanorama } from '@/context/PanoramaContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    FadeInDown,
    Layout
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 52) / 2;

type FilterType = 'all' | 'complete' | 'inProgress';

export default function GalleryScreen() {
    const { state, loadProjects, deleteProject, setCurrentProject } = usePanorama();
    const router = useRouter();
    const [filter, setFilter] = useState<FilterType>('all');

    useEffect(() => {
        loadProjects();
    }, []);

    const filteredProjects = state.projects.filter((project) => {
        if (filter === 'complete') return project.isComplete;
        if (filter === 'inProgress') return !project.isComplete;
        return true;
    });

    const handleDelete = useCallback(
        (project: PanoramaProject) => {
            Alert.alert(
                'Supprimer le panorama',
                `Êtes-vous sûr de vouloir supprimer "${project.name}" ?`,
                [
                    { text: 'Annuler', style: 'cancel' },
                    {
                        text: 'Supprimer',
                        style: 'destructive',
                        onPress: () => deleteProject(project.id),
                    },
                ]
            );
        },
        [deleteProject]
    );

    const handleResume = useCallback(
        (project: PanoramaProject) => {
            setCurrentProject(project);
            router.push('/capture');
        },
        [setCurrentProject, router]
    );

    // Get the first captured photo URI as thumbnail
    const getThumbnailUri = (project: PanoramaProject): string | null => {
        if (project.panoramaUri) return project.panoramaUri;
        if (project.thumbnailUri) return project.thumbnailUri;
        const firstCaptured = project.positions.find(p => p.captured && p.uri);
        return firstCaptured?.uri || null;
    };

    const renderProjectCard = useCallback(
        ({ item, index }: { item: PanoramaProject; index: number }) => {
            const progress = item.capturedPhotos / item.totalPhotos;
            const thumbnailUri = getThumbnailUri(item);
            const timeSince = getTimeSince(item.updatedAt || item.createdAt);

            return (
                <Animated.View
                    entering={FadeInDown.delay(index * 100).duration(600)}
                    layout={Layout.springify()}
                    style={styles.cardContainer}
                >
                    <TouchableOpacity
                        style={styles.card}
                        onPress={() => {
                            if (item.isComplete) {
                                setCurrentProject(item);
                                router.push('/viewer');
                            } else {
                                handleResume(item);
                            }
                        }}
                        onLongPress={() => handleDelete(item)}
                        activeOpacity={0.7}
                    >
                        <LinearGradient
                            colors={
                                item.isComplete
                                    ? ['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']
                                    : ['rgba(108, 99, 255, 0.15)', 'rgba(108, 99, 255, 0.05)']
                            }
                            style={styles.cardGradient}
                        >
                            {/* Thumbnail */}
                            <View style={styles.thumbnailContainer}>
                                {thumbnailUri ? (
                                    <Image
                                        source={{ uri: thumbnailUri }}
                                        style={styles.thumbnailImage}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <MaterialIcons
                                        name={item.isComplete ? 'panorama' : 'panorama-horizontal-select'}
                                        size={48}
                                        color={item.isComplete ? '#10B981' : '#6C63FF'}
                                    />
                                )}
                                {item.isComplete && (
                                    <View style={styles.completeBadge}>
                                        <MaterialIcons name="check" size={12} color="#FFFFFF" />
                                    </View>
                                )}
                                {!item.isComplete && item.capturedPhotos > 0 && (
                                    <View style={styles.inProgressBadge}>
                                        <MaterialIcons name="pause" size={10} color="#FFFFFF" />
                                    </View>
                                )}
                            </View>

                            {/* Info */}
                            <Text style={styles.cardName} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={styles.cardDate}>
                                {timeSince}
                            </Text>

                            {/* Progress */}
                            <View style={styles.progressContainer}>
                                <View style={styles.progressTrack}>
                                    <View
                                        style={[
                                            styles.progressFill,
                                            {
                                                width: `${progress * 100}%`,
                                                backgroundColor: item.isComplete ? '#10B981' : '#6C63FF',
                                            },
                                        ]}
                                    />
                                </View>
                                <Text style={styles.progressText}>
                                    {item.capturedPhotos}/{item.totalPhotos}
                                </Text>
                            </View>

                            {/* Action */}
                            <View style={[
                                styles.cardAction,
                                item.isComplete && styles.cardActionComplete,
                            ]}>
                                <MaterialIcons
                                    name={item.isComplete ? '360' : 'play-arrow'}
                                    size={16}
                                    color={item.isComplete ? '#10B981' : '#6C63FF'}
                                />
                                <Text style={[
                                    styles.cardActionText,
                                    item.isComplete && { color: '#10B981' },
                                ]}>
                                    {item.isComplete ? 'Voir en 360°' : 'Reprendre'}
                                </Text>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            );
        },
        [handleDelete, handleResume, setCurrentProject, router]
    );

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <LinearGradient
                colors={['#0F0F1A', '#1A1A2E', '#16213E']}
                style={styles.gradient}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Animated.Text
                        entering={FadeInDown.duration(600)}
                        style={styles.title}
                    >
                        Mes Panoramas
                    </Animated.Text>
                    <Animated.Text
                        entering={FadeInDown.delay(200).duration(600)}
                        style={styles.subtitle}
                    >
                        {state.projects.length} panorama{state.projects.length !== 1 ? 's' : ''} · {state.projects.filter(p => p.isComplete).length} terminé{state.projects.filter(p => p.isComplete).length !== 1 ? 's' : ''}
                    </Animated.Text>
                </View>

                {/* Filters */}
                <Animated.View
                    entering={FadeInDown.delay(300).duration(600)}
                    style={styles.filterContainer}
                >
                    {(['all', 'complete', 'inProgress'] as FilterType[]).map((f) => (
                        <TouchableOpacity
                            key={f}
                            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
                            onPress={() => setFilter(f)}
                        >
                            <MaterialIcons
                                name={f === 'all' ? 'grid-view' : f === 'complete' ? 'check-circle' : 'pending'}
                                size={14}
                                color={filter === f ? (f === 'complete' ? '#10B981' : f === 'inProgress' ? '#F59E0B' : '#6C63FF') : 'rgba(255,255,255,0.4)'}
                            />
                            <Text
                                style={[
                                    styles.filterText,
                                    filter === f && styles.filterTextActive,
                                    filter === f && f === 'complete' && { color: '#10B981' },
                                    filter === f && f === 'inProgress' && { color: '#F59E0B' },
                                ]}
                            >
                                {f === 'all' ? 'Tous' : f === 'complete' ? 'Terminés' : 'En cours'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </Animated.View>

                {/* Gallery Grid */}
                {filteredProjects.length > 0 ? (
                    <FlatList
                        data={filteredProjects}
                        renderItem={renderProjectCard}
                        keyExtractor={(item) => item.id}
                        numColumns={2}
                        contentContainerStyle={styles.listContent}
                        columnWrapperStyle={styles.columnWrapper}
                        showsVerticalScrollIndicator={false}
                    />
                ) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <MaterialIcons name="photo-library" size={56} color="rgba(108, 99, 255, 0.3)" />
                        </View>
                        <Text style={styles.emptyTitle}>
                            {filter === 'all' ? 'Aucun panorama' : filter === 'complete' ? 'Aucun panorama terminé' : 'Aucun panorama en cours'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            {filter === 'all'
                                ? 'Commencez à capturer des panoramas 360° pour les voir ici'
                                : filter === 'complete'
                                    ? 'Terminez vos captures en cours pour voir vos panoramas ici'
                                    : 'Lancez une nouvelle capture pour commencer'
                            }
                        </Text>
                        <TouchableOpacity
                            style={styles.emptyButton}
                            onPress={() => router.push('/capture')}
                        >
                            <LinearGradient
                                colors={['#6C63FF', '#4338CA']}
                                style={styles.emptyButtonGradient}
                            >
                                <MaterialIcons name="camera" size={20} color="#FFFFFF" />
                                <Text style={styles.emptyButtonText}>Nouvelle capture</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </LinearGradient>
        </View>
    );
}

/**
 * Format a date string to a human-readable "time since" string in French
 */
function getTimeSince(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;

    return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    gradient: {
        flex: 1,
    },
    header: {
        paddingTop: Platform.OS === 'ios' ? 70 : 50,
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 4,
        fontWeight: '500',
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 8,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    filterButtonActive: {
        backgroundColor: 'rgba(108, 99, 255, 0.15)',
        borderColor: 'rgba(108, 99, 255, 0.4)',
    },
    filterText: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 13,
        fontWeight: '600',
    },
    filterTextActive: {
        color: '#6C63FF',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    columnWrapper: {
        gap: 12,
        marginBottom: 12,
    },
    cardContainer: {
        flex: 1,
        maxWidth: CARD_WIDTH,
    },
    card: {
        borderRadius: 18,
        overflow: 'hidden',
    },
    cardGradient: {
        padding: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    thumbnailContainer: {
        width: '100%',
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        overflow: 'hidden',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
        borderRadius: 14,
    },
    completeBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#10B981',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5,
    },
    inProgressBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 3,
    },
    cardDate: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.35)',
        marginBottom: 10,
        fontWeight: '500',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    progressTrack: {
        flex: 1,
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressText: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.4)',
        fontWeight: '600',
    },
    cardAction: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: 'rgba(108, 99, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(108, 99, 255, 0.15)',
    },
    cardActionComplete: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.15)',
    },
    cardActionText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6C63FF',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyIconWrap: {
        width: 100,
        height: 100,
        borderRadius: 30,
        backgroundColor: 'rgba(108, 99, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(108, 99, 255, 0.1)',
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 30,
    },
    emptyButton: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    emptyButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 14,
    },
    emptyButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
