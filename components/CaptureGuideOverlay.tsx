/**
 * CaptureGuideOverlay
 * ─────────────────────────────────────────────────────────────────────────────
 * Reproduction EXACTE de l'UI des screenshots HDREye / Teleport 360.
 * 
 * - Masques noirs complets (Top, Bottom, Left, Right) : seule la caméra 
 *   à l'intérieur du rectangle blanc central est visible.
 * - Le Viewfinder : rectangle blanc fin.
 * - Anneau central (Réticule) : Grand anneau blanc vide, fixe au centre.
 * - Cibles (Dots) : Ronds pleins verts néon flottant en 3D dans le vide noir.
 * - UI HUD : En haut (Texte blanc), En bas (Barre de progression "X of 51").
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { CAPTURE_CONFIG, CapturePosition, VF_W as GVF_W, VF_H as GVF_H, VF_LEFT as GVF_LEFT, VF_TOP as GVF_TOP } from '@/constants/CaptureConfig';
import { worldToViewfinder } from '@/utils/Geometry';
import React, { useMemo } from 'react';
import {
    Dimensions,
    Platform,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    withSequence,
    withRepeat
} from 'react-native-reanimated';

const { width: SW0, height: SH0 } = Dimensions.get('window');

// ── Géométrie du Viewfinder ── (partagée avec CaptureConfig / la caméra)
const VF_W = GVF_W;
const VF_H = GVF_H;
const VF_LEFT = GVF_LEFT;
const VF_TOP = GVF_TOP;

const ORANGE = '#FF8C00'; // Orange Google Street View
const BLUE = '#4285F4'; // Bleu Google


interface Props {
    positions: CapturePosition[];
    currentYaw: number;
    currentPitch: number;
    currentRoll: number;
    isLevel: boolean;
    targetPosition: CapturePosition | null;
    isAligned: boolean;
}

// ── Calcul 3D -> 2D ──────────────────────────────────────────────────────────
// Projette une direction monde dans le rectangle viewfinder (= image caméra).
// Exactement la même géométrie que CaptureConfig et StitchEngine.
function projectTarget(
    yaw: number, pitch: number, curYaw: number, curPitch: number,
) {
    const r = worldToViewfinder(
        yaw, pitch, curYaw, curPitch,
        CAPTURE_CONFIG.CAMERA_HFOV, CAPTURE_CONFIG.CAMERA_VFOV,
        { left: VF_LEFT, top: VF_TOP, width: VF_W, height: VF_H },
    );
    if (!r) return { x: 0, y: 0, visible: false };
    return r;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ANNEAU BLANC FIXE (Le centre du Viewfinder)
//    C'est l'anneau de ciblage. Il devient bleu et grandit quand on est aligné.
// ═══════════════════════════════════════════════════════════════════════════
function CenterRing({ isAligned }: { isAligned: boolean }) {
    const animStyle = useAnimatedStyle(() => {
        return {
            borderColor: withTiming(isAligned ? BLUE : '#FFFFFF', { duration: 200 }),
            borderWidth: withTiming(isAligned ? 6 : 4, { duration: 200 }),
            transform: [{ scale: withTiming(isAligned ? 1.2 : 1, { duration: 200 }) }],
        };
    });

    return (
        <Animated.View style={[styles.centerRing, animStyle]} pointerEvents="none" />
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. POINT ORANGE (La Cible Unique Google Street View)
// ═══════════════════════════════════════════════════════════════════════════
function OrangeDot({ x, y }: { x: number; y: number }) {
    return (
        <View style={[styles.orangeDot, { left: x - 18, top: y - 18 }]} pointerEvents="none" />
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// INDICATEUR DE NIVEAU (roll) — style appareil photo
// Une barre qui s'incline avec le téléphone. Verte quand droite, orange sinon.
// L'assemblage suppose roll = 0 → c'est ce qui évite l'image penchée.
// ═══════════════════════════════════════════════════════════════════════════
function LevelIndicator({ roll, isLevel }: { roll: number; isLevel: boolean }) {
    const cx = VF_LEFT + VF_W / 2;
    const cy = VF_TOP + VF_H / 2;
    const barW = VF_W * 0.55;
    const color = isLevel ? '#22C55E' : ORANGE;
    return (
        <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 24 }} pointerEvents="none">
            {/* Repère fixe (référence horizontale) */}
            <View style={{
                position: 'absolute',
                left: cx - barW / 2, top: cy,
                width: barW, height: 2,
                backgroundColor: 'rgba(255,255,255,0.35)',
            }} />
            {/* Barre qui suit l'inclinaison du téléphone */}
            <View style={{
                position: 'absolute',
                left: cx - barW / 2, top: cy - 1.5,
                width: barW, height: 3,
                backgroundColor: color,
                transform: [{ rotate: `${-roll}deg` }],
            }} />
        </View>
    );
}

export default function CaptureGuideOverlay({
    positions,
    currentYaw,
    currentPitch,
    currentRoll,
    isLevel,
    targetPosition,
    isAligned,
}: Props) {
    useWindowDimensions(); // re-render on rotation/resize

    const done = positions.filter(p => p.captured).length;
    const total = positions.length;

    // Calcul de la position 2D de la cible actuelle
    let targetX = 0;
    let targetY = 0;
    let showTarget = false;
    if (targetPosition) {
        const coords = projectTarget(targetPosition.yaw, targetPosition.pitch, currentYaw, currentPitch);
        targetX = coords.x;
        targetY = coords.y;
        showTarget = coords.visible;
    }

    return (
        <View style={styles.overlay} pointerEvents="none">

            {/* ── RECTANGLE BLANC (Viewfinder) ────────────── */}
            <View style={styles.viewfinderRect} pointerEvents="none" />

            {/* ── HUD HAUT (Titre) ────────────── */}
            <View style={styles.topTextContainer}>
                <Text style={styles.titleText}>Capture 360° degree{'\n'}panoramic photos</Text>
            </View>

            {/* ── CIBLE (POINT ORANGE UNIQUE) ──────────────
                Style Street View : On ne montre que LA prochaine cible pour guider pas à pas. */}
            <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 15 }} pointerEvents="none">
                {showTarget && <OrangeDot x={targetX} y={targetY} />}
            </View>

            {/* ── INDICATEUR DE NIVEAU (roll) ────────────── */}
            <LevelIndicator roll={currentRoll} isLevel={isLevel} />

            {/* ── AVERTISSEMENT « tenez droit » ────────────── */}
            {!isLevel && (
                <View style={styles.levelWarning} pointerEvents="none">
                    <Text style={styles.levelWarningText}>
                        Tenez le téléphone droit
                    </Text>
                </View>
            )}

            {/* ── RÉTICULE CENTRAL ──────────────
                Dessiné par-dessus la cible orange. S'anime s'il "avale" le point. */}
            <CenterRing isAligned={isAligned} />

            {/* ── BARRE DE PROGRESSION (Sous le rectangle) ────────────── */}
            <View style={styles.bottomBar}>
                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: total > 0 ? `${(done / total) * 100}%` : '0%' }]} />
                </View>
                <Text style={styles.counterText}>{done} of {total}</Text>
            </View>

            {/* Effet visuel lors du snapshot */}
            {isAligned && (
                <View style={styles.flashOverlay} />
            )}

        </View>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10,
    },

    // ── Rectangle central
    viewfinderRect: {
        position: 'absolute',
        top: VF_TOP,
        left: VF_LEFT,
        width: VF_W,
        height: VF_H,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        zIndex: 10,
    },

    // ── HUD Text Haut
    topTextContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 120 : 100,
        left: 0, right: 0,
        alignItems: 'center',
        zIndex: 20,
    },
    titleText: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '800', // Gras comme sur la capture
        textAlign: 'center',
        lineHeight: 26,
    },

    // ── Barres Bas (12 of 51)
    bottomBar: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 50 : 30, // Proche du bas
        left: 40, right: 40,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
        zIndex: 20,
    },
    progressTrack: {
        flex: 1,
        height: 10,
        backgroundColor: '#FFFFFF', // Fond blanc
        borderRadius: 5,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: BLUE, // Bleu Google pour la complétion
        borderRadius: 5,
    },
    counterText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '500',
        minWidth: 50,
    },

    // ── Eléments AR ──
    orangeDot: {
        position: 'absolute',
        width: 36,     // Dimensionné pour rentrer pile dans l'anneau
        height: 36,
        borderRadius: 18,
        backgroundColor: ORANGE,
        shadowColor: ORANGE,
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 8,
    },

    centerRing: {
        position: 'absolute',
        left: SW0 / 2 - 25,  // Un peu plus grand que le point vert
        top: SH0 / 2 - 25,
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 4,
        borderColor: '#FFFFFF', // Anneau blanc
        zIndex: 25, // Au-dessus des points verts
        shadowColor: '#000000',
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5,
    },

    flashOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.15)',
        zIndex: 30,
    },

    levelWarning: {
        position: 'absolute',
        top: VF_TOP - 44,
        left: 0, right: 0,
        alignItems: 'center',
        zIndex: 26,
    },
    levelWarningText: {
        color: '#FFFFFF',
        backgroundColor: 'rgba(255,140,0,0.92)',
        fontSize: 14,
        fontWeight: '700',
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 14,
        overflow: 'hidden',
    },
});
