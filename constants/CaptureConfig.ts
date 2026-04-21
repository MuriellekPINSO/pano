// Configuration for 360° capture - Optimized for coverage AND great UX
// 18 photos total: enough for seamless stitching, fast enough (~90s)
// Row-by-row guided capture like Google Street View
import { Dimensions } from 'react-native';

export const CAPTURE_CONFIG = {
  // Grid: 6 rings — 51 photos total (Exact Teleport 360 layout)
  ROWS: 6,
  COLS_PER_ROW: [14, 12, 12, 6, 6, 1],
  ROW_PITCHES: [0, 35, -35, 65, -65, 85],
  TOTAL_PHOTOS: 51,

  // Camera settings
  CAMERA: {
    QUALITY: 0.92,
    RATIO: "4:3",
  },

  // Tighter tolerance for better alignment accuracy
  POSITION_TOLERANCE: 10,

  // Slightly longer delay so the phone stabilizes before shooting
  AUTO_CAPTURE_DELAY: 550,

  // Camera field of view
  CAMERA_HFOV: 70,
  CAMERA_VFOV: 55,

  // Row labels
  ROW_LABELS: ["Horizon", "Haut 1", "Bas 1", "Haut 2", "Bas 2", "Plafond"] as const,
  ROW_ICONS: [
    "panorama-horizontal",
    "arrow-upward",
    "arrow-downward",
    "arrow-upward",
    "arrow-downward",
    "vertical-align-top",
  ] as const,

  // Instructions
  ROW_INSTRUCTIONS: [
    "Tenez le téléphone droit\net tournez lentement",
    "Inclinez vers le haut\net tournez à 360°",
    "Inclinez vers le bas\net tournez à 360°",
    "Montez encore plus\nvers le plafond",
    "Descendez encore plus\nvers le sol",
    "Pointez vers le plafond",
  ] as const,

  // Couleurs
  ROW_COLORS: ["#00FF00", "#00FF00", "#00FF00", "#00FF00", "#00FF00", "#00FF00"] as const,
};

// ── Géométrie du Viewfinder AR ───────────────────────────────────────────────
const { width: SW0, height: SH0 } = Dimensions.get('window');

// Le Viewfinder cadre la vue live de la caméra
export const VF_W = SW0 * 0.72;
export const VF_H = SH0 * 0.48;
export const VF_LEFT = (SW0 - VF_W) / 2;
export const VF_TOP = (SH0 - VF_H) / 2 + 20;

// ── Calcul 3D -> 2D ──────────────────────────────────────────────────────────
export function normDelta(a: number, b: number): number {
    let d = a - b;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
}

export function toScreen(yaw: number, pitch: number, curYaw: number, curPitch: number, SW: number, SH: number) {
    // Les pixels virtuels de deplacement par degres.
    // L'image de la caméra est contrainte dans VF_W x VF_H.
    // Donc 55 degres verticaux de camera remplissent VF_H pixels, pas SH pixels !
    const PX_H = VF_W / CAPTURE_CONFIG.CAMERA_HFOV;
    const PX_V = VF_H / CAPTURE_CONFIG.CAMERA_VFOV;
    
    // Correction de perspective horizontale par rapport à l'équateur 
    // Plus on regarde haut (pitch != 0), plus les méridiens se resserrent
    const pitchRad = curPitch * (Math.PI / 180);
    const adjustedPX_H = PX_H * Math.cos(pitchRad);

    return {
        x: SW / 2 + normDelta(yaw, curYaw) * adjustedPX_H,
        y: SH / 2 - (pitch - curPitch) * PX_V,
    };
}

// Generate capture positions
export function generateCapturePositions(): CapturePosition[] {
  const positions: CapturePosition[] = [];
  let id = 0;

  for (let row = 0; row < CAPTURE_CONFIG.ROWS; row++) {
    const colCount = CAPTURE_CONFIG.COLS_PER_ROW[row];
    const pitch = CAPTURE_CONFIG.ROW_PITCHES[row];
    const yawStep = 360 / colCount;

    for (let col = 0; col < colCount; col++) {
      // Stagger non-horizon rows for perfect honeycomb coverage
      const yawOffset = (row % 2 !== 0) ? yawStep / 2 : 0;
      positions.push({
        id: id++,
        row,
        col,
        yaw: (col * yawStep + yawOffset) % 360,
        pitch,
        captured: false,
        label: getPositionLabel(row, col, colCount),
      });
    }
  }

  return positions;
}

function getPositionLabel(row: number, col: number, totalCols: number): string {
  const rowNames = CAPTURE_CONFIG.ROW_LABELS;
  if (totalCols === 1) return rowNames[row];

  const dir8 = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const dir6 = ["N", "NE", "SE", "S", "SO", "NO"];
  const dir5 = ["NE", "E", "S", "SO", "NO"];
  const dir3 = ["NE", "S", "NO"];

  let dir: string;
  if (totalCols === 8) dir = dir8[col % 8];
  else if (totalCols === 6) dir = dir6[col % 6];
  else if (totalCols === 5) dir = dir5[col % 5];
  else if (totalCols === 3) dir = dir3[col % 3];
  else dir = `${col + 1}`;

  return `${rowNames[row]} ${dir}`;
}

export interface CapturePosition {
  id: number;
  row: number;
  col: number;
  yaw: number;
  pitch: number;
  captured: boolean;
  uri?: string;
  label?: string;
}

export interface PanoramaProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  positions: CapturePosition[];
  thumbnailUri?: string;
  panoramaUri?: string;
  isComplete: boolean;
  totalPhotos: number;
  capturedPhotos: number;
}
