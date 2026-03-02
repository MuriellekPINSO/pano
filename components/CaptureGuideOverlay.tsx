import { CAPTURE_CONFIG, CapturePosition } from '@/constants/CaptureConfig';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo } from 'react';
import { Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

const { width: SW, height: SH } = Dimensions.get('window');
const PX_H = SW / CAPTURE_CONFIG.CAMERA_HFOV;
const PX_V = SH / CAPTURE_CONFIG.CAMERA_VFOV;

interface Props {
    positions: CapturePosition[];
    currentYaw: number;
    currentPitch: number;
    targetPosition: CapturePosition | null;
    isAligned: boolean;
}

// ─── helpers ────────────────────────────────────────────────
function normDelta(a: number, b: number) {
    let d = a - b;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
}

function toScreen(yaw: number, pitch: number, curYaw: number, curPitch: number) {
    const dx = normDelta(yaw, curYaw);
    const dy = pitch - curPitch;
    return {
        x: SW / 2 + dx * PX_H,
        y: SH / 2 - dy * PX_V,
    };
}

function isOnScreen(x: number, y: number, margin = 80) {
    return x > -margin && x < SW + margin && y > -margin && y < SH + margin;
}

function distanceDeg(yaw1: number, pitch1: number, yaw2: number, pitch2: number) {
    const dy = normDelta(yaw1, yaw2);
    const dp = pitch1 - pitch2;
    return Math.sqrt(dy * dy + dp * dp);
}

// ═══════════════════════════════════════════════════════════════
// 1) CENTER VIEWFINDER — Large, clear targeting reticle
// ═══════════════════════════════════════════════════════════════
function CenterViewfinder({ isAligned, proximity }: { isAligned: boolean; proximity: number }) {
    const glow = useSharedValue(0);
    const rotation = useSharedValue(0);

    useEffect(() => {
        rotation.value = withRepeat(
            withTiming(360, { duration: 8000, easing: Easing.linear }),
            -1,
            false
        );
    }, []);

    useEffect(() => {
        if (isAligned) {
            glow.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 250 }),
                    withTiming(0.5, { duration: 250 })
                ),
                -1,
                true
            );
        } else {
            glow.value = withTiming(0, { duration: 200 });
        }
    }, [isAligned]);

    const glowStyle = useAnimatedStyle(() => ({
        opacity: glow.value,
        transform: [{ scale: 1 + glow.value * 0.15 }],
    }));

    const outerRotateStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const size = 56;
    const borderColor = isAligned
        ? '#22C55E'
        : proximity > 0.6
            ? `rgba(34, 197, 94, ${proximity})`
            : proximity > 0.3
                ? `rgba(255, 255, 255, ${0.3 + proximity})`
                : 'rgba(255, 255, 255, 0.35)';
    const borderWidth = isAligned ? 3 : 1.5 + proximity * 1.5;

    return (
        <View style={styles.viewfinderContainer}>
            {/* Animated outer ring — always visible, subtle rotation */}
            <Animated.View style={[styles.viewfinderOuterRing, outerRotateStyle]}>
                {/* 4 corner bracket marks */}
                <View style={[styles.bracketMark, { top: -1, left: -1 }]} />
                <View style={[styles.bracketMark, { top: -1, right: -1, transform: [{ rotate: '90deg' }] }]} />
                <View style={[styles.bracketMark, { bottom: -1, right: -1, transform: [{ rotate: '180deg' }] }]} />
                <View style={[styles.bracketMark, { bottom: -1, left: -1, transform: [{ rotate: '270deg' }] }]} />
            </Animated.View>

            {/* Glow ring when aligned */}
            {isAligned && (
                <Animated.View
                    style={[
                        styles.viewfinderGlow,
                        glowStyle,
                    ]}
                />
            )}

            {/* Main circle */}
            <View
                style={[
                    styles.viewfinderCircle,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        borderColor,
                        borderWidth,
                    },
                ]}
            />

            {/* Fine crosshairs */}
            <View style={[styles.vfCross, styles.vfCrossH]} />
            <View style={[styles.vfCross, styles.vfCrossV]} />

            {/* Center dot */}
            <View
                style={[
                    styles.vfDot,
                    isAligned && { backgroundColor: '#22C55E', width: 8, height: 8, borderRadius: 4 },
                ]}
            />
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════
// 2) TARGET ORB — Large, visible target to chase
// ═══════════════════════════════════════════════════════════════
function TargetOrb({
    screenX,
    screenY,
    isAligned,
    proximity,
    rowColor,
}: {
    screenX: number;
    screenY: number;
    isAligned: boolean;
    proximity: number;
    rowColor: string;
}) {
    const ripple = useSharedValue(1);
    const innerPulse = useSharedValue(1);

    useEffect(() => {
        ripple.value = withRepeat(
            withSequence(
                withTiming(2.5, { duration: 1500, easing: Easing.out(Easing.ease) }),
                withTiming(1, { duration: 0 })
            ),
            -1
        );
        innerPulse.value = withRepeat(
            withSequence(
                withTiming(1.15, { duration: 800 }),
                withTiming(0.95, { duration: 800 })
            ),
            -1,
            true
        );
    }, []);

    const rippleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: ripple.value }],
        opacity: Math.max(0, 2.5 - ripple.value) / 1.5,
    }));

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: innerPulse.value }],
    }));

    if (isAligned) return null;

    // Orb shrinks as it approaches center
    const orbSize = Math.max(14, 28 - proximity * 14);
    const color = rowColor;

    return (
        <View
            style={{
                position: 'absolute',
                left: screenX - 36,
                top: screenY - 36,
                width: 72,
                height: 72,
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 14,
            }}
        >
            {/* Outer ripple ring */}
            <Animated.View
                style={[
                    {
                        position: 'absolute',
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        borderWidth: 2,
                        borderColor: color,
                    },
                    rippleStyle,
                ]}
            />

            {/* Inner glow ring */}
            <Animated.View
                style={[
                    {
                        position: 'absolute',
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: color + '15',
                        borderWidth: 1,
                        borderColor: color + '40',
                    },
                    pulseStyle,
                ]}
            />

            {/* Solid orb */}
            <View
                style={{
                    width: orbSize,
                    height: orbSize,
                    borderRadius: orbSize / 2,
                    backgroundColor: color,
                    shadowColor: color,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.9,
                    shadowRadius: 18,
                    elevation: 10,
                }}
            />
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════
// 3) DOT PATH — Shows remaining positions in current row
// ═══════════════════════════════════════════════════════════════
function DotPathArc({
    positions,
    currentYaw,
    currentPitch,
    currentRow,
    rowColor,
}: {
    positions: CapturePosition[];
    currentYaw: number;
    currentPitch: number;
    currentRow: number;
    rowColor: string;
}) {
    const rowPositions = positions.filter((p) => p.row === currentRow);

    return (
        <>
            {rowPositions.map((pos) => {
                const { x, y } = toScreen(pos.yaw, pos.pitch, currentYaw, currentPitch);
                if (!isOnScreen(x, y, 40)) return null;

                if (pos.captured) {
                    return (
                        <View
                            key={`dot-${pos.id}`}
                            style={[
                                styles.arcDotCaptured,
                                { left: x - 12, top: y - 12 },
                            ]}
                        >
                            <MaterialIcons name="check" size={12} color="#22C55E" />
                        </View>
                    );
                } else {
                    return (
                        <View
                            key={`dot-${pos.id}`}
                            style={[
                                styles.arcDotPending,
                                {
                                    left: x - 7,
                                    top: y - 7,
                                    backgroundColor: rowColor + '30',
                                    borderColor: rowColor + '70',
                                },
                            ]}
                        />
                    );
                }
            })}
        </>
    );
}

// ═══════════════════════════════════════════════════════════════
// 4) DIRECTION INDICATOR — Full-width, unmissable
// ═══════════════════════════════════════════════════════════════
function DirectionArrow({
    deltaYaw,
    deltaPitch,
    rowColor,
}: {
    deltaYaw: number;
    deltaPitch: number;
    rowColor: string;
}) {
    const bob = useSharedValue(0);

    useEffect(() => {
        bob.value = withRepeat(
            withSequence(
                withTiming(8, { duration: 500, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const absYaw = Math.abs(deltaYaw);
    const absPitch = Math.abs(deltaPitch);

    let icon: keyof typeof MaterialIcons.glyphMap;
    let text: string;
    let position: 'top' | 'bottom' | 'left' | 'right';
    let axis: 'x' | 'y' = 'y';
    let dir = 1;

    if (absPitch > absYaw * 1.3) {
        if (deltaPitch > 0) {
            icon = 'keyboard-arrow-up';
            text = 'Vers le haut ↑';
            position = 'top';
            axis = 'y'; dir = -1;
        } else {
            icon = 'keyboard-arrow-down';
            text = 'Vers le bas ↓';
            position = 'bottom';
            axis = 'y'; dir = 1;
        }
    } else {
        if (deltaYaw > 0) {
            icon = 'keyboard-arrow-right';
            text = 'Tournez à droite →';
            position = 'right';
            axis = 'x'; dir = 1;
        } else {
            icon = 'keyboard-arrow-left';
            text = '← Tournez à gauche';
            position = 'left';
            axis = 'x'; dir = -1;
        }
    }

    const animStyle = useAnimatedStyle(() => ({
        transform:
            axis === 'x'
                ? [{ translateX: bob.value * dir }]
                : [{ translateY: bob.value * dir }],
    }));

    const positionStyle: any = {
        top: { top: 120, left: 0, right: 0, flexDirection: 'column' as const, alignItems: 'center' as const },
        bottom: { bottom: 200, left: 0, right: 0, flexDirection: 'column' as const, alignItems: 'center' as const },
        left: { left: 12, top: SH / 2 - 50, flexDirection: 'column' as const, alignItems: 'center' as const },
        right: { right: 12, top: SH / 2 - 50, flexDirection: 'column' as const, alignItems: 'center' as const },
    };

    return (
        <Animated.View style={[styles.dirArrow, positionStyle[position], animStyle]}>
            <View style={[styles.dirArrowIcon, { backgroundColor: rowColor + '20', borderColor: rowColor + '60' }]}>
                <MaterialIcons name={icon} size={36} color={rowColor} />
            </View>
            <Text style={[styles.dirArrowText, { color: rowColor }]}>{text}</Text>
        </Animated.View>
    );
}

// ═══════════════════════════════════════════════════════════════
// 5) PROGRESS RING — Clean circular progress in top-right
// ═══════════════════════════════════════════════════════════════
function ProgressRing({
    positions,
    currentRow,
}: {
    positions: CapturePosition[];
    currentRow: number;
}) {
    const totalCaptured = positions.filter(p => p.captured).length;
    const total = positions.length;
    const rowColor = CAPTURE_CONFIG.ROW_COLORS[currentRow] || '#6C63FF';

    // Build row summary
    const rows = [];
    for (let r = 0; r < CAPTURE_CONFIG.ROWS; r++) {
        const rp = positions.filter((p) => p.row === r);
        const captured = rp.filter((p) => p.captured).length;
        const rowTotal = rp.length;
        const color = CAPTURE_CONFIG.ROW_COLORS[r];
        const isActive = r === currentRow;
        const isDone = captured === rowTotal;
        rows.push({ captured, total: rowTotal, color, isActive, isDone, label: CAPTURE_CONFIG.ROW_LABELS[r] });
    }

    return (
        <View style={styles.progressRingContainer}>
            {/* Main counter */}
            <View style={styles.progressRingMain}>
                <Text style={[styles.progressRingCount, { color: rowColor }]}>{totalCaptured}</Text>
                <Text style={styles.progressRingTotal}>/{total}</Text>
            </View>

            {/* Row indicators */}
            <View style={styles.progressRowList}>
                {rows.map((row, i) => (
                    <View key={i} style={[
                        styles.progressRowItem,
                        row.isActive && styles.progressRowItemActive,
                    ]}>
                        <View style={[
                            styles.progressRowDot,
                            {
                                backgroundColor: row.isDone ? '#22C55E' : row.isActive ? row.color : 'rgba(255,255,255,0.15)',
                            },
                        ]}>
                            {row.isDone && <MaterialIcons name="check" size={8} color="#fff" />}
                        </View>
                        {row.isActive && (
                            <Text style={[styles.progressRowText, { color: row.color }]}>
                                {row.captured}/{row.total}
                            </Text>
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════
// 6) INSTRUCTION BANNER — Bottom, clear step guidance
// ═══════════════════════════════════════════════════════════════
function InstructionBanner({
    currentRow,
    isAligned,
    positions,
    rowColor,
}: {
    currentRow: number;
    isAligned: boolean;
    positions: CapturePosition[];
    rowColor: string;
}) {
    const rowPositions = positions.filter((p) => p.row === currentRow);
    const captured = rowPositions.filter((p) => p.captured).length;
    const total = rowPositions.length;
    const instruction = CAPTURE_CONFIG.ROW_INSTRUCTIONS[currentRow];

    return (
        <View style={[styles.instructionBanner, isAligned && styles.instructionBannerAligned]}>
            <View style={styles.instructionLeft}>
                <View style={[styles.instructionIcon, { backgroundColor: (isAligned ? '#22C55E' : rowColor) + '25' }]}>
                    <MaterialIcons
                        name={isAligned ? 'camera' : (CAPTURE_CONFIG.ROW_ICONS[currentRow] as keyof typeof MaterialIcons.glyphMap)}
                        size={18}
                        color={isAligned ? '#22C55E' : rowColor}
                    />
                </View>
                <Text style={[styles.instructionText, isAligned && { color: '#22C55E' }]}>
                    {isAligned ? 'Capture en cours...' : instruction}
                </Text>
            </View>
            <View style={[styles.instructionBadge, { backgroundColor: (isAligned ? '#22C55E' : rowColor) + '25' }]}>
                <Text style={[styles.instructionBadgeText, { color: isAligned ? '#22C55E' : rowColor }]}>
                    {captured}/{total}
                </Text>
            </View>
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════
// MAIN OVERLAY
// ═══════════════════════════════════════════════════════════════
export default function CaptureGuideOverlay({
    positions,
    currentYaw,
    currentPitch,
    targetPosition,
    isAligned,
}: Props) {
    const currentRow = targetPosition?.row ?? 0;
    const rowColor = CAPTURE_CONFIG.ROW_COLORS[currentRow] || '#6C63FF';

    // Target screen position & proximity
    const targetInfo = useMemo(() => {
        if (!targetPosition) return null;
        const { x, y } = toScreen(targetPosition.yaw, targetPosition.pitch, currentYaw, currentPitch);
        const dist = distanceDeg(targetPosition.yaw, targetPosition.pitch, currentYaw, currentPitch);
        const tolerance = CAPTURE_CONFIG.POSITION_TOLERANCE;
        const proximity = Math.max(0, Math.min(1, 1 - dist / (tolerance * 3)));
        const onScreen = isOnScreen(x, y);
        const deltaYaw = normDelta(targetPosition.yaw, currentYaw);
        const deltaPitch = targetPosition.pitch - currentPitch;
        return { x, y, dist, proximity, onScreen, deltaYaw, deltaPitch };
    }, [targetPosition, currentYaw, currentPitch]);

    const proximity = targetInfo?.proximity ?? 0;

    return (
        <View style={styles.container} pointerEvents="none">
            {/* Layer 1: Dot path (current row positions) */}
            <DotPathArc
                positions={positions}
                currentYaw={currentYaw}
                currentPitch={currentPitch}
                currentRow={currentRow}
                rowColor={rowColor}
            />

            {/* Layer 2: Target orb */}
            {targetInfo && targetInfo.onScreen && (
                <TargetOrb
                    screenX={targetInfo.x}
                    screenY={targetInfo.y}
                    isAligned={isAligned}
                    proximity={proximity}
                    rowColor={rowColor}
                />
            )}

            {/* Layer 3: Center viewfinder */}
            <CenterViewfinder isAligned={isAligned} proximity={proximity} />

            {/* Layer 4: Direction indicator (when target off-screen) */}
            {targetInfo && !targetInfo.onScreen && !isAligned && (
                <DirectionArrow
                    deltaYaw={targetInfo.deltaYaw}
                    deltaPitch={targetInfo.deltaPitch}
                    rowColor={rowColor}
                />
            )}

            {/* Layer 5: Progress ring (top-right) */}
            <ProgressRing positions={positions} currentRow={currentRow} />

            {/* Layer 6: Instruction banner (bottom) */}
            <View style={styles.instructionArea}>
                <InstructionBanner
                    currentRow={currentRow}
                    isAligned={isAligned}
                    positions={positions}
                    rowColor={rowColor}
                />
            </View>

            {/* Layer 7: Aligned edge vignette */}
            {isAligned && <View style={styles.edgeGlow} />}

            {/* Layer 8: Top vignette for readability */}
            <View style={styles.topVignette} />
            <View style={styles.bottomVignette} />
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 5,
    },

    // ── Vignettes ──
    topVignette: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 130,
        backgroundColor: 'transparent',
        // Use border trick for gradient-like effect
        borderBottomWidth: 0,
        opacity: 0.6,
        zIndex: 1,
    },
    bottomVignette: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 160,
        backgroundColor: 'transparent',
        opacity: 0.6,
        zIndex: 1,
    },

    // ── Center Viewfinder ──
    viewfinderContainer: {
        position: 'absolute',
        left: SW / 2 - 44,
        top: SH / 2 - 44,
        width: 88,
        height: 88,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 15,
    },
    viewfinderOuterRing: {
        position: 'absolute',
        width: 80,
        height: 80,
    },
    bracketMark: {
        position: 'absolute',
        width: 16,
        height: 16,
        borderLeftWidth: 2,
        borderTopWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.25)',
    },
    viewfinderCircle: {
        // Dynamic styles applied inline
    },
    viewfinderGlow: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        borderWidth: 2.5,
        borderColor: 'rgba(34, 197, 94, 0.4)',
    },
    vfCross: {
        position: 'absolute',
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
    },
    vfCrossH: {
        width: 36,
        height: 1,
        top: 43.5,
    },
    vfCrossV: {
        width: 1,
        height: 36,
        left: 43.5,
    },
    vfDot: {
        position: 'absolute',
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
    },

    // ── Arc Dots ──
    arcDotCaptured: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 6,
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.3)',
    },
    arcDotPending: {
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1.5,
        zIndex: 6,
    },

    // ── Direction Arrow ──
    dirArrow: {
        position: 'absolute',
        zIndex: 20,
        alignItems: 'center',
        gap: 8,
    },
    dirArrowIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
    },
    dirArrowText: {
        fontSize: 14,
        fontWeight: '800',
        textShadowColor: 'rgba(0,0,0,0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
        letterSpacing: 0.5,
    },

    // ── Progress Ring ──
    progressRingContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 62 : 42,
        right: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        borderRadius: 16,
        padding: 12,
        paddingHorizontal: 14,
        zIndex: 22,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    progressRingMain: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    progressRingCount: {
        fontSize: 22,
        fontWeight: '800',
    },
    progressRingTotal: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.4)',
    },
    progressRowList: {
        flexDirection: 'column',
        gap: 3,
    },
    progressRowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        opacity: 0.5,
    },
    progressRowItemActive: {
        opacity: 1,
    },
    progressRowDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressRowText: {
        fontSize: 10,
        fontWeight: '700',
    },

    // ── Instruction Banner ──
    instructionArea: {
        position: 'absolute',
        bottom: 140,
        left: 20,
        right: 20,
        alignItems: 'center',
        zIndex: 18,
    },
    instructionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        width: '100%',
    },
    instructionBannerAligned: {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        borderColor: 'rgba(34, 197, 94, 0.3)',
    },
    instructionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    instructionIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    instructionText: {
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    instructionBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    instructionBadgeText: {
        fontSize: 13,
        fontWeight: '800',
    },

    // ── Edge Glow ──
    edgeGlow: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 4,
        borderColor: 'rgba(34, 197, 94, 0.35)',
        borderRadius: 0,
        zIndex: 2,
    },
});
