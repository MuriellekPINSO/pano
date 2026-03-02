import { CAPTURE_CONFIG } from '@/constants/CaptureConfig';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

const { width } = Dimensions.get('window');

interface PositionGridProps {
    positions: Array<{ id: number; row: number; col: number; captured: boolean }>;
    currentPositionId?: number;
    rows: number;
    cols: number;
}

export default function PositionGrid({
    positions,
    currentPositionId,
    rows,
    cols,
}: PositionGridProps) {
    const gridWidth = Math.min(width - 40, 320);

    // Group positions by row
    const rowGroups: { [key: number]: typeof positions } = {};
    positions.forEach((pos) => {
        if (!rowGroups[pos.row]) rowGroups[pos.row] = [];
        rowGroups[pos.row].push(pos);
    });

    const rowLabels = CAPTURE_CONFIG.ROW_LABELS;
    const rowIcons = CAPTURE_CONFIG.ROW_ICONS;

    return (
        <View style={[styles.container, { width: gridWidth }]}>
            <Text style={styles.title}>Grille de Capture 360°</Text>
            <View style={styles.grid}>
                {Object.keys(rowGroups)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((rowKey) => {
                        const rowIndex = Number(rowKey);
                        const rowPositions = rowGroups[rowIndex];
                        const colCount = rowPositions.length;
                        const cellSize = colCount === 1
                            ? 36
                            : Math.min((gridWidth - 60) / colCount - 4, 32);
                        const capturedInRow = rowPositions.filter((p) => p.captured).length;
                        const rowComplete = capturedInRow === colCount;

                        return (
                            <View key={rowIndex} style={styles.rowContainer}>
                                <View style={styles.rowHeader}>
                                    <MaterialIcons
                                        name={rowIcons[rowIndex] as any || 'arrow-forward'}
                                        size={14}
                                        color={rowComplete ? '#22C55E' : 'rgba(255,255,255,0.5)'}
                                    />
                                    <Text style={[
                                        styles.rowLabel,
                                        rowComplete && styles.rowLabelComplete,
                                    ]}>
                                        {rowLabels[rowIndex] || `Row ${rowIndex}`}
                                    </Text>
                                    <Text style={styles.rowCount}>
                                        {capturedInRow}/{colCount}
                                    </Text>
                                </View>
                                <View style={[
                                    styles.row,
                                    colCount === 1 && styles.rowCentered,
                                ]}>
                                    {rowPositions.map((position) => {
                                        const isCurrent = position.id === currentPositionId;
                                        const isCaptured = position.captured;

                                        return (
                                            <View
                                                key={`${position.row}-${position.col}`}
                                                style={[
                                                    styles.cell,
                                                    { width: cellSize, height: cellSize },
                                                    isCaptured && styles.cellCaptured,
                                                    isCurrent && styles.cellCurrent,
                                                ]}
                                            >
                                                {isCaptured && (
                                                    <MaterialIcons name="check" size={cellSize * 0.6} color="#10B981" />
                                                )}
                                                {isCurrent && !isCaptured && (
                                                    <View style={styles.currentDot} />
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })}
            </View>
            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.cellCaptured]} />
                    <Text style={styles.legendText}>Capturé</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.cellCurrent]} />
                    <Text style={styles.legendText}>Cible</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.cellPending]} />
                    <Text style={styles.legendText}>En attente</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 16,
        padding: 12,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    title: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 10,
        letterSpacing: 0.5,
    },
    grid: {
        gap: 6,
    },
    rowContainer: {
        gap: 4,
    },
    rowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 4,
    },
    rowLabel: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 11,
        fontWeight: '600',
        flex: 1,
    },
    rowLabelComplete: {
        color: '#22C55E',
    },
    rowCount: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 10,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 3,
        paddingLeft: 4,
    },
    rowCentered: {
        justifyContent: 'center',
    },
    cell: {
        borderRadius: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cellCaptured: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: 'rgba(16, 185, 129, 0.5)',
    },
    cellCurrent: {
        backgroundColor: 'rgba(255, 107, 53, 0.2)',
        borderColor: '#FF6B35',
        borderWidth: 2,
    },
    cellPending: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    currentDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF6B35',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 10,
        gap: 14,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    legendText: {
        color: 'rgba(255, 255, 255, 0.55)',
        fontSize: 10,
        fontWeight: '500',
    },
});
