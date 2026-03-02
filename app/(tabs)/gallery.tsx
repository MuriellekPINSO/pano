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
                'Delete Panorama',
                `Are you sure you want to delete "${project.name}"?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
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

    const renderProjectCard = useCallback(
        ({ item, index }: { item: PanoramaProject; index: number }) => {
            const progress = item.capturedPhotos / item.totalPhotos;

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
                                // View panorama
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
                            {/* Thumbnail / Icon */}
                            <View style={styles.thumbnailContainer}>
                                <MaterialIcons
                                    name={item.isComplete ? 'panorama' : 'panorama-horizontal-select'}
                                    size={48}
                                    color={item.isComplete ? '#10B981' : '#6C63FF'}
                                />
                                {item.isComplete && (
                                    <View style={styles.completeBadge}>
                                        <MaterialIcons name="check" size={12} color="#FFFFFF" />
                                    </View>
                                )}
                            </View>

                            {/* Info */}
                            <Text style={styles.cardName} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={styles.cardDate}>
                                {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                })}
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
                            <View style={styles.cardAction}>
                                <Text style={styles.cardActionText}>
                                    {item.isComplete ? 'View' : 'Resume'}
                                </Text>
                                <MaterialIcons
                                    name={item.isComplete ? 'visibility' : 'play-arrow'}
                                    size={16}
                                    color={item.isComplete ? '#10B981' : '#6C63FF'}
                                />
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
                        Gallery
                    </Animated.Text>
                    <Animated.Text
                        entering={FadeInDown.delay(200).duration(600)}
                        style={styles.subtitle}
                    >
                        {state.projects.length} panorama{state.projects.length !== 1 ? 's' : ''}
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
                            <Text
                                style={[
                                    styles.filterText,
                                    filter === f && styles.filterTextActive,
                                ]}
                            >
                                {f === 'all' ? 'All' : f === 'complete' ? 'Complete' : 'In Progress'}
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
                        <MaterialIcons name="photo-library" size={64} color="rgba(255,255,255,0.15)" />
                        <Text style={styles.emptyTitle}>No Panoramas Yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Start capturing 360° panoramas to see them here
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
                                <Text style={styles.emptyButtonText}>Start Capture</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
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
        fontSize: 15,
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
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    filterButtonActive: {
        backgroundColor: 'rgba(108, 99, 255, 0.2)',
        borderColor: '#6C63FF',
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
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    thumbnailContainer: {
        width: '100%',
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    completeBadge: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#10B981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    cardDate: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        marginBottom: 12,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
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
        gap: 4,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    cardActionText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.6)',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
        marginTop: 20,
        marginBottom: 8,
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
