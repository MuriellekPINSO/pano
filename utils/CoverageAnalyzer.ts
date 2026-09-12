/**
 * CoverageAnalyzer.ts
 * 
 * Diagnostic tool: calcule la couverture réelle d'un ensemble de photos
 * et identifie les zones manquantes.
 * 
 * C'est là qu'on répond aux questions :
 * 1. Couverture angulaire totale (yaw) ?
 * 2. Plage de pitch capturée (min/max) ?
 * 3. Des trous entre deux photos adjacentes ?
 * 4. Overlap réel vs attendu ?
 */

import { CapturePosition } from "@/constants/CaptureConfig";

export interface CoverageReport {
  // Horizontal (yaw) coverage
  yawCovered: boolean; // true si 360° de yaw couverts
  yawMinDegrees: number; // minimum de degrés yaw couverts par photo
  yawMaxDegrees: number; // maximum
  yawGapsDegrees: number[]; // lacunes entre photos consécutives (en degrés)
  
  // Vertical (pitch) coverage
  pitchMin: number; // pitch min capturée
  pitchMax: number; // pitch max capturée
  totalPitchSpan: number; // plage totale (max - min)
  hasZenith: boolean; // true si pitch proche de +90°
  hasNadir: boolean; // true si pitch proche de -90°
  
  // Overlap analysis
  totalPhotos: number;
  capturedPhotos: number;
  averageOverlapPercent: number;
  minOverlapPercent: number;
  overlapsOk: boolean; // true si overlap minimum atteint
  
  // Warnings
  warnings: string[];
  recommendations: string[];
}

export function analyzeCoverage(
  positions: CapturePosition[],
  cameraHfovDeg: number,
  cameraVfovDeg: number,
  targetOverlap: number = 0.35, // 35% par défaut
): CoverageReport {
  const capturedPositions = positions.filter(p => p.captured && p.uri);
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // ────────────────────────────────────────────────────────────────────────
  // 1. Analyse du YAW (couverture horizontale)
  // ────────────────────────────────────────────────────────────────────────
  
  // Grouper par rangée (row) car chaque rangée a sa propre couverture yaw
  const byRow = new Map<number, CapturePosition[]>();
  for (const pos of capturedPositions) {
    if (!byRow.has(pos.row)) byRow.set(pos.row, []);
    byRow.get(pos.row)!.push(pos);
  }

  let yawCovered = false;
  let yawCoveredPercent = 0;
  const yawGapsDegrees: number[] = [];
  let minYaw = 360;
  let maxYaw = 0;

  // Analyser chaque rangée
  for (const [row, rowPhotos] of byRow) {
    const sortedByYaw = rowPhotos.sort((a, b) => a.yaw - b.yaw);
    
    if (sortedByYaw.length === 0) continue;

    // Trouver les lacunes entre photos consécutives
    for (let i = 0; i < sortedByYaw.length; i++) {
      const current = sortedByYaw[i];
      const next = sortedByYaw[(i + 1) % sortedByYaw.length];
      
      let gapYaw = next.yaw - current.yaw;
      if (gapYaw <= 0) gapYaw += 360; // Wrapping circulaire

      yawGapsDegrees.push(gapYaw);
      minYaw = Math.min(minYaw, current.yaw);
      maxYaw = Math.max(maxYaw, current.yaw);
    }

    // Check: couverture complète 360° ?
    // On considère c'est OK si le gap max est < à (HFOV × overlap boost)
    const maxGap = Math.max(...yawGapsDegrees);
    const minGapThreshold = cameraHfovDeg * (1 - targetOverlap); // Expected step size
    
    if (maxGap <= minGapThreshold * 1.1) {
      yawCovered = true;
      yawCoveredPercent = 100;
    } else if (sortedByYaw.length > 0) {
      // Estimer le % de couverture
      const avgGap = yawGapsDegrees.reduce((a, b) => a + b, 0) / yawGapsDegrees.length;
      yawCoveredPercent = Math.max(0, Math.min(100, (360 - avgGap) / 360 * 100));
    }
  }

  if (yawCoveredPercent < 95) {
    warnings.push(
      `⚠️ Couverture YAW insuffisante: ${yawCoveredPercent.toFixed(1)}% seulement ` +
      `(attendu: ≥95%). Gap max: ${Math.max(...yawGapsDegrees).toFixed(1)}° ` +
      `(attendu: <${(cameraHfovDeg * (1 - targetOverlap)).toFixed(1)}°)`
    );
    recommendations.push(
      "📸 Assurez-vous de tourner 360° complet sans laisser de zone"
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // 2. Analyse du PITCH (couverture verticale)
  // ────────────────────────────────────────────────────────────────────────
  
  let pitchMin = 90;
  let pitchMax = -90;
  let hasZenith = false;
  let hasNadir = false;

  for (const pos of capturedPositions) {
    pitchMin = Math.min(pitchMin, pos.pitch);
    pitchMax = Math.max(pitchMax, pos.pitch);
    
    if (pos.pitch >= 75) hasZenith = true;
    if (pos.pitch <= -75) hasNadir = true;
  }

  const totalPitchSpan = pitchMax - pitchMin;

  // Warnings de couverture pitch
  if (!hasZenith) {
    warnings.push(
      `⚠️ Pas de photo au zénith (pitch ≥75°). ` +
      `Pitch max capturée: ${pitchMax.toFixed(0)}° → des trous au plafond`
    );
    recommendations.push(
      "📸 Capturez aussi en inclinant bien le téléphone vers le haut (≥75°)"
    );
  }

  if (!hasNadir) {
    warnings.push(
      `⚠️ Pas de photo au nadir (pitch ≤-75°). ` +
      `Pitch min capturée: ${pitchMin.toFixed(0)}° → des trous au sol`
    );
    recommendations.push(
      "📸 Capturez aussi en penchant le téléphone vers le bas (≤-75°)"
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // 3. Analyse de l'OVERLAP entre photos
  // ────────────────────────────────────────────────────────────────────────
  
  const overlaps: number[] = [];
  
  for (const [row, rowPhotos] of byRow) {
    const sortedByYaw = rowPhotos.sort((a, b) => a.yaw - b.yaw);
    
    for (let i = 0; i < sortedByYaw.length; i++) {
      const current = sortedByYaw[i];
      const next = sortedByYaw[(i + 1) % sortedByYaw.length];
      
      let gapYaw = next.yaw - current.yaw;
      if (gapYaw <= 0) gapYaw += 360;

      // overlap = 1 - (gap / HFOV)
      const overlapFraction = Math.max(0, 1 - (gapYaw / cameraHfovDeg));
      overlaps.push(overlapFraction * 100);
    }
  }

  const averageOverlapPercent = overlaps.length > 0
    ? overlaps.reduce((a, b) => a + b, 0) / overlaps.length
    : 0;

  const minOverlapPercent = overlaps.length > 0
    ? Math.min(...overlaps)
    : 0;

  const overlapsOk = minOverlapPercent >= targetOverlap * 100 * 0.9; // 90% de la cible

  if (!overlapsOk) {
    warnings.push(
      `⚠️ Overlap insuffisant: min=${minOverlapPercent.toFixed(1)}% (attendu: ≥${(targetOverlap * 100).toFixed(0)}%). ` +
      `Risque de bandes blanches aux coutures`
    );
    recommendations.push(
      "📸 Rapprochez chaque position (recouvrement doit être d'au moins 30%)"
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // 4. Résumé
  // ────────────────────────────────────────────────────────────────────────

  return {
    yawCovered,
    yawMinDegrees: minYaw === 360 ? 0 : minYaw,
    yawMaxDegrees: maxYaw,
    yawGapsDegrees,
    
    pitchMin,
    pitchMax,
    totalPitchSpan,
    hasZenith,
    hasNadir,
    
    totalPhotos: positions.length,
    capturedPhotos: capturedPositions.length,
    averageOverlapPercent,
    minOverlapPercent,
    overlapsOk,
    
    warnings,
    recommendations,
  };
}

/**
 * Format human-readable coverage report for logging/display
 */
export function formatCoverageReport(report: CoverageReport): string {
  let text = "\n════════════════════════════════════════════════════════════\n";
  text += "📊 PANORAMA COVERAGE ANALYSIS\n";
  text += "════════════════════════════════════════════════════════════\n\n";

  // Photos
  text += `📸 Photos: ${report.capturedPhotos}/${report.totalPhotos} capturées\n`;

  // YAW coverage
  text += `\n🔄 COUVERTURE HORIZONTALE (YAW):\n`;
  text += `   Status: ${report.yawCovered ? "✅ 360° couverts" : "❌ INCOMPLET"}\n`;
  text += `   Range: ${report.yawMinDegrees.toFixed(0)}° → ${report.yawMaxDegrees.toFixed(0)}°\n`;
  if (report.yawGapsDegrees.length > 0) {
    const maxGap = Math.max(...report.yawGapsDegrees);
    const avgGap = report.yawGapsDegrees.reduce((a, b) => a + b, 0) / report.yawGapsDegrees.length;
    text += `   Écarts: min=${Math.min(...report.yawGapsDegrees).toFixed(1)}°, `;
    text += `max=${maxGap.toFixed(1)}°, avg=${avgGap.toFixed(1)}°\n`;
  }

  // PITCH coverage
  text += `\n⬆️  COUVERTURE VERTICALE (PITCH):\n`;
  text += `   Range: ${report.pitchMin.toFixed(0)}° → ${report.pitchMax.toFixed(0)}° (span: ${report.totalPitchSpan.toFixed(0)}°)\n`;
  text += `   Zénith (≥75°): ${report.hasZenith ? "✅" : "❌"}\n`;
  text += `   Nadir (≤-75°): ${report.hasNadir ? "✅" : "❌"}\n`;

  // Overlap
  text += `\n🔗 RECOUVREMENT (OVERLAP):\n`;
  text += `   Moyen: ${report.averageOverlapPercent.toFixed(1)}%\n`;
  text += `   Minimum: ${report.minOverlapPercent.toFixed(1)}%\n`;
  text += `   Status: ${report.overlapsOk ? "✅ OK" : "❌ INSUFFISANT"}\n`;

  // Warnings & recommendations
  if (report.warnings.length > 0) {
    text += `\n⚠️  AVERTISSEMENTS:\n`;
    for (const w of report.warnings) {
      text += `   ${w}\n`;
    }
  }

  if (report.recommendations.length > 0) {
    text += `\n💡 RECOMMANDATIONS:\n`;
    for (const r of report.recommendations) {
      text += `   ${r}\n`;
    }
  }

  text += "\n════════════════════════════════════════════════════════════\n";

  return text;
}
