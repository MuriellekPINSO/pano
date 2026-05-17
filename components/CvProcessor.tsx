/**
 * CvProcessor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Hidden component that runs computer vision analysis on captured photos.
 *
 * Architecture:
 *  - Renders ONE invisible WebView per unchecked photo
 *  - WebView loads the photo on an HTML5 Canvas, reads pixel data
 *  - Sends pixels back via postMessage → buildFingerprint()
 *  - Stores fingerprints in shared state / calls onFingerprintReady
 *  - Parent (CaptureGuideOverlay) uses fingerprints to show match quality
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
    buildFingerprint,
    generateCvHTML,
    matchNeighbors,
    NeighborMatch,
    PhotoFingerprint,
} from '@/utils/ComputerVision';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { CapturePosition } from '@/constants/CaptureConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CvProcessorProps {
  /** All positions (we only process captured ones with URIs) */
  positions: CapturePosition[];
  /** Called each time a new fingerprint is computed */
  onFingerprintReady: (fp: PhotoFingerprint) => void;
  /** Called each time a new neighbor match is computed */
  onMatchReady: (match: NeighborMatch) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CvProcessor({ positions, onFingerprintReady, onMatchReady }: CvProcessorProps) {
  // Guard against setState after unmount
  const isMounted = useRef(true);
  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  // Track which positions have already been processed
  const processedIds = useRef<Set<number>>(new Set());
  const fingerprintsRef = useRef<Map<number, PhotoFingerprint>>(new Map());

  // Queue of positions to process next
  const [queue, setQueue] = useState<CapturePosition[]>([]);

  // Update queue when new captured positions appear
  useEffect(() => {
    const toProcess = positions.filter(
      p => p.captured && p.uri && !processedIds.current.has(p.id)
    );
    if (toProcess.length > 0) {
      setQueue(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newOnes = toProcess.filter(p => !existingIds.has(p.id));
        return [...prev, ...newOnes];
      });
    }
  }, [positions]);

  // Process fingerprint when WebView sends pixels back
  const handleMessage = useCallback((positionId: number, uri: string, event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'CV_PIXELS') {
        // Mark as processed
        processedIds.current.add(positionId);

        // Build fingerprint from pixel data
        const fp = buildFingerprint(
          positionId,
          uri,
          data.pixels,
          data.width,
          data.height,
        );

        // Store it
        fingerprintsRef.current.set(positionId, fp);

        // Notify parent
        onFingerprintReady(fp);

        // Find neighbors and compute matches
        const position = positions.find(p => p.id === positionId);
        if (position) {
          // Find angular neighbors (same row adjacent col, or adjacent row same col)
          for (const [otherId, otherFp] of fingerprintsRef.current.entries()) {
            if (otherId === positionId) continue;

            const otherPos = positions.find(p => p.id === otherId);
            if (!otherPos) continue;

            // Same row → left-right neighbors
            if (
              position.row === otherPos.row &&
              Math.abs(position.col - otherPos.col) === 1
            ) {
              const isALeft = position.col < otherPos.col;
              const match = matchNeighbors(
                isALeft ? fp : otherFp,
                isALeft ? otherFp : fp,
                'left-right',
              );
              onMatchReady(match);
            }

            // Adjacent rows → top-bottom neighbors (check angular distance)
            if (
              Math.abs(position.row - otherPos.row) === 1
            ) {
              const yawDiff = Math.abs(position.yaw - otherPos.yaw);
              const normalizedDiff = Math.min(yawDiff, 360 - yawDiff);
              // Only match if they're angularly close (within 45°)
              if (normalizedDiff < 45) {
                const isATop = position.row < otherPos.row;
                const match = matchNeighbors(
                  isATop ? fp : otherFp,
                  isATop ? otherFp : fp,
                  'top-bottom',
                );
                onMatchReady(match);
              }
            }
          }
        }

        // Remove from queue
        if (isMounted.current) {
          setQueue(prev => prev.filter(p => p.id !== positionId));
        }
      }

      if (data.type === 'CV_ERROR') {
        console.warn(`CV: failed to process position ${positionId}`);
        processedIds.current.add(positionId);
        if (isMounted.current) {
          setQueue(prev => prev.filter(p => p.id !== positionId));
        }
      }
    } catch (e) {
      console.error('CV message parse error:', e);
    }
  }, [positions, onFingerprintReady, onMatchReady]);

  // Only process the FIRST item in queue at a time (avoid overloading)
  const currentItem = queue[0] ?? null;

  // ── Watchdog: drop a position from the queue if it takes > 5s ──
  // This prevents a corrupt/missing image from blocking the entire CV pipeline.
  useEffect(() => {
    if (!currentItem) return;
    const watchdog = setTimeout(() => {
      if (!isMounted.current) return;
      console.warn(`CV: watchdog timeout for position ${currentItem.id} — skipping`);
      processedIds.current.add(currentItem.id);
      setQueue(prev => prev.filter(p => p.id !== currentItem.id));
    }, 5000);
    return () => clearTimeout(watchdog);
  }, [currentItem]);

  if (!currentItem) return null;

  return (
    <View style={styles.hidden}>
      <WebView
        key={`cv-${currentItem.id}`}
        source={{ html: generateCvHTML(currentItem.id, currentItem.uri!) }}
        javaScriptEnabled
        onMessage={(e) => handleMessage(currentItem.id, currentItem.uri!, e)}
        style={styles.webview}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
    left: -9999,
    top: -9999,
  },
  webview: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
  },
});
