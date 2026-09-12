/**
 * INTEGRATION_GUIDE.md
 * 
 * Step-by-step guide to integrate the coverage analysis fix into your app
 */

# Integration Guide: Coverage Analysis & Diagnostic Feedback

## Overview

You now have three new tools:
1. **CoverageAnalyzer** — Detects gaps & validates overlap
2. **StitchEngine Integration** — Pre-stitch diagnostic logging
3. **CaptureProgressIndicator** — Real-time UI feedback during capture

This guide shows how to integrate them into your existing capture flow.

---

## Step 1: Use CaptureProgressIndicator in Your Capture Screen

### Before Integration:
Your capture screen probably has a guide overlay and status display. Add the progress indicator below.

### Example Integration:

**File: `app/screens/CaptureScreen.tsx` (or wherever you have your capture UI)**

```tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { CameraView } from 'expo-camera';
import { CAPTURE_CONFIG, generateCapturePositions } from '@/constants/CaptureConfig';
import CaptureProgressIndicator from '@/components/CaptureProgressIndicator';
import CaptureGuideOverlay from '@/components/CaptureGuideOverlay';

export default function CaptureScreen() {
  const [positions, setPositions] = useState<CapturePosition[]>(
    generateCapturePositions()
  );

  // ... your existing capture logic ...

  return (
    <View style={styles.container}>
      {/* Live camera preview */}
      <CameraView style={styles.camera} />

      {/* Guide overlay (existing) */}
      <CaptureGuideOverlay
        positions={positions}
        currentPosition={currentPosition}
      />

      {/* ✨ NEW: Real-time coverage feedback */}
      <ScrollView style={styles.feedbackContainer}>
        <CaptureProgressIndicator
          positions={positions}
          cameraHfov={CAPTURE_CONFIG.CAMERA_HFOV}
          cameraVfov={CAPTURE_CONFIG.CAMERA_VFOV}
        />
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.buttonContainer}>
        {/* ... your existing buttons ... */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  feedbackContainer: {
    position: 'absolute',
    bottom: 80, // above buttons
    left: 0,
    right: 0,
    maxHeight: 280, // adjust for your layout
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderTopWidth: 1,
    borderTopColor: '#404040',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: '#1a1a1a',
  },
});
```

### What The User Sees:

As they capture each photo:
- ✅ Horizontal coverage ring fills up (green = photo present, dark = gap)
- ✅ Pitch zones check off (Horizon ✓, Haut ✓, etc.)
- ✅ Overlap % updates
- ⚠️ If coverage incomplete, warnings appear with next steps

---

## Step 2: Enable Console Diagnostics During Development

### In Your Stitch Processor:

**File: `components/StitchProcessor.tsx`** (already updated, but here's what changed)

```tsx
export default function StitchProcessor({
  positions,
  projectId,
  onComplete,
  onError,
  onProgress,
}: StitchProcessorProps) {
  // ... existing code ...

  React.useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        setStatus('Lecture des images...');
        onProgress?.('Lecture des images...');

        const preparedPositions = await prepareImagesForStitch(positions);

        if (cancelled) return;

        // ✨ NEW: Diagnostic report is now automatically logged
        // You'll see it in React Native console before stitching starts
        setStatus('Vérification de couverture...');
        
        const stitchHTML = generateStitchHTML(preparedPositions);
        // Console will show full diagnostic report here
        
        setStatus('Assemblage en cours...');
        onProgress?.('Assemblage en cours...');
        setHtml(stitchHTML);
      } catch (err: any) {
        onError(err.message || 'Failed to prepare images');
      }
    }

    prepare();
    return () => { cancelled = true; };
  }, [positions]);

  // ... rest of component ...
}
```

### Where to See Diagnostics:

**React Native Console Output:**
```
════════════════════════════════════════════════════════════
📊 PANORAMA COVERAGE ANALYSIS
════════════════════════════════════════════════════════════

📸 Photos: 14/18 capturées

🔄 COUVERTURE HORIZONTALE (YAW):
   Status: ❌ INCOMPLET
   Range: 0° → 330°
   ...
```

Use **Expo DevTools** or **React Native Debugger** to see these logs:
- Press `j` in Expo CLI to open DevTools
- Or run: `adb logcat *:S ReactNativeJS:V` (Android)

---

## Step 3: Add Manual Coverage Check Before Stitching

### Optional: Block Stitching If Coverage Bad

**File: `screens/ReviewScreen.tsx` (or your stitch confirmation screen)**

```tsx
import { analyzeCoverage, formatCoverageReport } from '@/utils/CoverageAnalyzer';
import { CAPTURE_CONFIG } from '@/constants/CaptureConfig';

export default function ReviewScreen({ positions, onStitch, onCancel }) {
  const handleStitchPress = () => {
    const report = analyzeCoverage(
      positions,
      CAPTURE_CONFIG.CAMERA_HFOV,
      CAPTURE_CONFIG.CAMERA_VFOV,
      0.35
    );

    // Option A: Just warn
    if (report.warnings.length > 0) {
      Alert.alert(
        '⚠️ Avertissements de couverture',
        formatCoverageReport(report),
        [
          { text: 'Modifier les photos', onPress: onCancel },
          { text: 'Continuer quand même', onPress: onStitch },
        ]
      );
    } else {
      // All good!
      onStitch();
    }

    // Option B: Block if critical
    if (!report.yawCovered || !report.hasZenith || !report.hasNadir) {
      Alert.alert(
        '❌ Couverture Incomplète',
        `Couverture détectée:\n${formatCoverageReport(report)}\n\nVeuillez capturer les zones manquantes.`,
        [{ text: 'OK', onPress: onCancel }]
      );
      return;
    }

    onStitch();
  };

  return (
    <View style={styles.container}>
      {/* Preview, info, etc. */}
      <Button
        title="Démarrer l'assemblage"
        onPress={handleStitchPress}
        color="#6C63FF"
      />
    </View>
  );
}
```

---

## Step 4: Understand the Diagnostic Report

### What Each Metric Means:

#### 🔄 YAW Coverage (Horizontal)
```
yawCovered: true/false
  → true: All 360° covered (no major gaps)
  
yawGapsDegrees: [23.5, 22.1, 24.3, ...]
  → Size of each gap between adjacent photos
  → If any gap > HFOV × (1 - overlap), you have a seam risk
```

**Action:**
- ✅ If `yawCovered === true`: Good
- ⚠️ If max gap > 45° (for 65° HFOV): Likely seam visible
- ❌ If gaps add up to >30°: Significant coverage missing

#### ⬆️ PITCH Coverage (Vertical)
```
pitchMin/Max: number
  → Actual range of pitch values captured
  
hasZenith: boolean
  → true if any photo at pitch ≥ 75° (ceiling)
  
hasNadir: boolean
  → true if any photo at pitch ≤ -75° (floor)
```

**Action:**
- ✅ If span > 130° and both caps have photos: Full sphere covered
- ⚠️ If span = 110° (missing ±90°): Polar caps will have gaps
- ❌ If span < 100°: Significant regions black

#### 🔗 OVERLAP (Critical for Stitching Quality)
```
minOverlapPercent: number (0-100)
  → Smallest overlap between any two adjacent photos
  
averageOverlapPercent: number
  → Average overlap across all photo pairs
  
overlapsOk: boolean
  → true if minOverlapPercent ≥ 30%
```

**Why This Matters:**
- **< 20%**: Visible seams, misalignment, ghosting
- **20-30%**: OK if features are distinctive; risky on flat walls
- **30-50%**: Sweet spot; feature-based alignment works well
- **> 50%**: Overkill but safer

---

## Step 5: Debug Coverage Issues

### Scenario 1: "User Got Black Corners"

```tsx
// In StitchProcessor or ReviewScreen:

const report = analyzeCoverage(positions, 65, 50, 0.35);

console.log('📊 DEBUG: Coverage Report');
console.log(`  Total photos: ${report.capturedPhotos}/${report.totalPhotos}`);
console.log(`  YAW: ${report.yawCovered ? 'OK' : 'INCOMPLETE'}`);
console.log(`  PITCH: ${report.pitchMin}° to ${report.pitchMax}°`);
console.log(`  Zenith: ${report.hasZenith ? 'YES' : 'NO'}`);
console.log(`  Nadir: ${report.hasNadir ? 'YES' : 'NO'}`);
console.log(`  Min Overlap: ${report.minOverlapPercent.toFixed(1)}%`);

// Print which photos exist at each pitch
positions
  .filter(p => p.captured)
  .sort((a, b) => a.pitch - b.pitch)
  .forEach(p => {
    console.log(`  Photo ${p.id}: yaw=${p.yaw.toFixed(0)}°, pitch=${p.pitch.toFixed(0)}°`);
  });
```

**Likely causes:**
1. ❌ `hasZenith === false` → User didn't capture ceiling
2. ❌ `hasNadir === false` → User didn't capture floor
3. ❌ `minOverlapPercent < 20%` → Photos too far apart → seams + ghosting
4. ❌ `yawCovered === false` → Missing wedge (e.g., didn't rotate full 360°)

### Scenario 2: "Overlap % Looks Wrong"

Double-check the overlap calculation:

```typescript
// For each row, calculate overlap between adjacent photos
const byRow = new Map();
for (const pos of positions.filter(p => p.captured)) {
  if (!byRow.has(pos.row)) byRow.set(pos.row, []);
  byRow.get(pos.row)!.push(pos);
}

for (const [row, photos] of byRow) {
  const sorted = photos.sort((a, b) => a.yaw - b.yaw);
  
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    
    let gap = next.yaw - curr.yaw;
    if (gap <= 0) gap += 360;
    
    const overlap = Math.max(0, 1 - (gap / 65)); // 65° = HFOV
    console.log(`Row ${row}: Photo ${curr.id} → ${next.id} = ${(overlap * 100).toFixed(1)}% overlap`);
  }
}
```

---

## Step 6: Production Recommendations

### For Your App Users:

#### Before Capture:
Show this checklist:
```
✅ BEFORE YOU START:
1. Stand in the center
2. Hold phone level for horizon row
3. Tilt UP for ceiling row
4. Tilt DOWN for floor row
5. Wait for green "✅ Couverture OK" before stitching

⚠️ If you see red warnings during capture:
   → Rotate more to fill gaps
   → Tilt phone up/down to capture poles
```

#### During Capture:
Display `CaptureProgressIndicator` prominently (as shown above).

#### Before Stitching:
```tsx
if (report.warnings.length > 0) {
  showModal('Coverage Warnings', formatCoverageReport(report), [
    { text: 'Re-capture', action: goBackToCapture },
    { text: 'Stitch Anyway', action: startStitching },
  ]);
}
```

### Optional: Send Diagnostics to Backend

For analytics/quality monitoring:

```typescript
export async function logDiagnostics(
  projectId: string,
  report: CoverageReport
) {
  await fetch(`${API_URL}/projects/${projectId}/diagnostics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      ...report,
    }),
  });
}
```

Then track:
- % of captures with complete coverage
- Average overlap %
- Most common missing zones (zenith? nadir?)
- UX improvement after adding CaptureProgressIndicator

---

## Troubleshooting

### Q: "CaptureProgressIndicator doesn't update in real-time"
**A:** Make sure you're passing the `positions` state object directly:
```tsx
const [positions, setPositions] = useState(generateCapturePositions());

// When capturing a photo:
setPositions(prev => [
  ...prev.map((p, i) => i === photoIndex ? { ...p, captured: true, uri } : p)
]);

// Component will re-render automatically
<CaptureProgressIndicator positions={positions} ... />
```

### Q: "Console diagnostics not showing"
**A:** Make sure you're using Expo DevTools or proper logging:
```tsx
// Add this to see logs
import { LogBox } from 'react-native';
if (__DEV__) {
  const originalLog = console.log;
  console.log = (...args) => {
    originalLog('[LOG]', ...args);
  };
}
```

### Q: "Overlap calculation seems off"
**A:** Remember:
- Overlap = 1 - (gap / HFOV)
- For HFOV=65°, overlap of 35% means gap = 65° × (1 - 0.35) = 42.25°
- If gap > 42.25°, overlap < 35%

### Q: "Should I require 100% coverage before stitching?"
**A:** No. Recommend it, but allow user choice:
- 🟢 **Optimal**: YAW 100%, PITCH 130°+, Overlap 30%+
- 🟡 **Acceptable**: YAW 95%+, PITCH 110°+, Overlap 25%+
- 🔴 **Risk**: Anything less

---

## Summary

| File | What to Do |
|------|-----------|
| `components/CaptureProgressIndicator.tsx` | Import & use in your capture screen |
| `utils/CoverageAnalyzer.ts` | Already used by StitchEngine; call manually if needed |
| `utils/StitchEngine.ts` | No changes needed; diagnostics now automatic |
| Your capture screen | Add `<CaptureProgressIndicator>` to layout |
| Your stitch review screen | Optional: use `analyzeCoverage()` to warn before stitching |

**Expected Result:**
- Users see real-time coverage feedback
- Warnings appear before stitching (not after)
- Black panoramas → Rare (< 5%)
- User satisfaction → ↑↑↑

Good luck! 🚀
