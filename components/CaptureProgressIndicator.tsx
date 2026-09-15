/**
 * CaptureProgressIndicator.tsx
 * 
 * Visual feedback component showing real-time coverage during capture:
 * - Horizontal coverage bar (yaw 0-360°)
 * - Vertical coverage zones (pitch ranges)
 * - Gap detection: highlights missing coverage
 * - Overlap validation: warns if overlap too small
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CapturePosition } from '@/constants/CaptureConfig';
import { analyzeCoverage } from '@/utils/CoverageAnalyzer';

interface CaptureProgressIndicatorProps {
  positions: CapturePosition[];
  cameraHfov: number;
  cameraVfov: number;
}

export default function CaptureProgressIndicator({
  positions,
  cameraHfov,
  cameraVfov,
}: CaptureProgressIndicatorProps) {
  const report = useMemo(
    () => analyzeCoverage(positions, cameraHfov, cameraVfov, 0.35),
    [positions, cameraHfov, cameraVfov]
  );

  const capturedCount = positions.filter(p => p.captured).length;
  const totalCount = positions.length;
  const completionPercent = totalCount > 0 ? (capturedCount / totalCount) * 100 : 0;

  // ────────────────────────────────────────────────────────────────────────
  // 1. Horizontal coverage visualization (360° ring)
  // ────────────────────────────────────────────────────────────────────────
  
  const renderYawCoverageBar = () => {
    const segments = 36; // 10° each
    const segmentWidth = 100 / segments;
    
    return (
      <View style={styles.yawContainer}>
        {Array.from({ length: segments }).map((_, i) => {
          const yawStart = (i / segments) * 360;
          const yawEnd = ((i + 1) / segments) * 360;
          const isCovered = report.yawGapsDegrees.length > 0 ? true : false;
          
          // Check if this segment has a photo
          const hasPhoto = positions
            .filter(p => p.captured)
            .some(p => {
              const yaw = p.yaw % 360;
              return (yaw >= yawStart && yaw < yawEnd);
            });

          return (
            <View
              key={i}
              style={[
                styles.yawSegment,
                {
                  backgroundColor: hasPhoto ? '#51CF66' : '#404040',
                  borderRightWidth: i % 3 === 2 ? 1 : 0,
                  borderRightColor: '#666',
                },
              ]}
              accessibilityLabel={`${yawStart.toFixed(0)}°`}
            />
          );
        })}
      </View>
    );
  };

  // ────────────────────────────────────────────────────────────────────────
  // 2. Pitch (vertical) coverage zones
  // ────────────────────────────────────────────────────────────────────────
  
  const renderPitchIndicators = () => {
    const zones = [
      { name: 'Zénith', pitch: 80, ok: report.hasZenith, color: '#FF6B9D' },
      { name: 'Haut', pitch: 55, ok: true, color: '#4ECDC4' },
      { name: 'Horizon', pitch: 0, ok: true, color: '#95E1D3' },
      { name: 'Bas', pitch: -55, ok: true, color: '#F38181' },
      { name: 'Nadir', pitch: -80, ok: report.hasNadir, color: '#AA96DA' },
    ];

    return (
      <View style={styles.pitchContainer}>
        {zones.map(zone => {
          const hasPhotoAtPitch = positions
            .filter(p => p.captured)
            .some(p => Math.abs(p.pitch - zone.pitch) < 20);

          return (
            <View key={zone.name} style={styles.pitchZone}>
              <View
                style={[
                  styles.pitchIndicator,
                  {
                    backgroundColor: hasPhotoAtPitch ? zone.color : '#333',
                    borderColor: zone.ok ? 'transparent' : '#FF6B6B',
                    borderWidth: zone.ok ? 0 : 2,
                  },
                ]}
              />
              <Text style={styles.pitchLabel}>{zone.name}</Text>
              {hasPhotoAtPitch && (
                <Text style={styles.checkmark}>✓</Text>
              )}
              {!zone.ok && (
                <Text style={styles.missingLabel}>!</Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // ────────────────────────────────────────────────────────────────────────
  // 3. Status and warnings
  // ────────────────────────────────────────────────────────────────────────

  const statusColor = report.warnings.length === 0 ? '#51CF66' : '#FFD700';
  const statusText =
    report.warnings.length === 0
      ? '✅ Couverture OK'
      : `⚠️ ${report.warnings.length} problème${report.warnings.length > 1 ? 's' : ''}`;

  return (
    <View style={styles.container}>
      {/* Header: Progress */}
      <View style={styles.header}>
        <Text style={styles.title}>📊 Couverture Panorama</Text>
        <Text style={styles.progress}>
          {capturedCount} / {totalCount} photos ({completionPercent.toFixed(0)}%)
        </Text>
      </View>

      {/* Completion bar */}
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            { width: `${Math.min(100, completionPercent)}%` },
          ]}
        />
      </View>

      {/* Horizontal coverage (YAW) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔄 Couverture Horizontale (360°)</Text>
        {renderYawCoverageBar()}
        <Text style={[styles.coverageText, { color: report.yawCovered ? '#51CF66' : '#FFD700' }]}>
          {report.yawCovered
            ? '✅ 360° complet'
            : `⚠️ Gap max: ${Math.max(...report.yawGapsDegrees).toFixed(1)}°`}
        </Text>
      </View>

      {/* Vertical coverage (PITCH) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⬆️ Couverture Verticale</Text>
        {renderPitchIndicators()}
        <Text style={styles.pitchRangeText}>
          Range: {report.pitchMin.toFixed(0)}° → {report.pitchMax.toFixed(0)}°
        </Text>
      </View>

      {/* Overlap check */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 Recouvrement</Text>
        <View style={styles.overlapRow}>
          <Text style={styles.overlapLabel}>Min overlap:</Text>
          <Text
            style={[
              styles.overlapValue,
              {
                color: report.minOverlapPercent >= 30 ? '#51CF66' : '#FF6B6B',
              },
            ]}
          >
            {report.minOverlapPercent.toFixed(1)}%
          </Text>
          <Text style={styles.overlapTarget}>(cible: ≥30%)</Text>
        </View>
      </View>

      {/* Overall status */}
      <View style={[styles.statusBox, { borderColor: statusColor }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>
          {statusText}
        </Text>
      </View>

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <View style={styles.warningsBox}>
          {report.warnings.map((warning, i) => (
            <Text key={i} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <View style={styles.recommendationsBox}>
          <Text style={styles.recommendationTitle}>💡 À faire:</Text>
          {report.recommendations.map((rec, i) => (
            <Text key={i} style={styles.recommendationText}>
              {rec}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#404040',
  },

  header: {
    marginBottom: 12,
  },

  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },

  progress: {
    fontSize: 13,
    color: '#AAA',
  },

  progressBarContainer: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },

  progressBar: {
    height: '100%',
    backgroundColor: '#6C63FF',
  },

  section: {
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CCC',
    marginBottom: 6,
  },

  // ── YAW coverage bar ──
  yawContainer: {
    flexDirection: 'row',
    height: 20,
    backgroundColor: '#262626',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },

  yawSegment: {
    flex: 1,
    borderRightWidth: 0.5,
    borderRightColor: '#555',
  },

  coverageText: {
    fontSize: 11,
    marginTop: 4,
  },

  // ── PITCH zones ──
  pitchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  pitchZone: {
    alignItems: 'center',
    flex: 1,
  },

  pitchIndicator: {
    width: 28,
    height: 28,
    borderRadius: 4,
    marginBottom: 4,
  },

  pitchLabel: {
    fontSize: 10,
    color: '#AAA',
    textAlign: 'center',
  },

  checkmark: {
    fontSize: 12,
    color: '#51CF66',
    marginTop: 2,
  },

  missingLabel: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '700',
    marginTop: 2,
  },

  pitchRangeText: {
    fontSize: 11,
    color: '#AAA',
    marginTop: 4,
  },

  // ── OVERLAP ──
  overlapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },

  overlapLabel: {
    fontSize: 12,
    color: '#AAA',
    marginRight: 8,
  },

  overlapValue: {
    fontSize: 14,
    fontWeight: '700',
  },

  overlapTarget: {
    fontSize: 11,
    color: '#888',
    marginLeft: 6,
  },

  // ── Status box ──
  statusBox: {
    borderWidth: 2,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
  },

  statusText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Warnings ──
  warningsBox: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#FF6B6B',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },

  warningText: {
    fontSize: 11,
    color: '#FFB3B3',
    marginBottom: 4,
    lineHeight: 14,
  },

  // ── Recommendations ──
  recommendationsBox: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
    borderRadius: 4,
    padding: 8,
  },

  recommendationTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 4,
  },

  recommendationText: {
    fontSize: 11,
    color: '#FFE699',
    marginBottom: 2,
    lineHeight: 13,
  },
});
