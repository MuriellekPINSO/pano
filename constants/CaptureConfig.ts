// Configuration for 360° capture - Optimized for coverage AND great UX
// 18 photos total: enough for seamless stitching, fast enough (~90s)
// Row-by-row guided capture like Google Street View
import { Dimensions } from 'react-native';
import { colsForRing, worldToViewfinder } from '@/utils/Geometry';

// Real-ish field of view of a typical phone back camera in 4:3.
// (Was 70/55 — pure guesses. These drive ring spacing AND stitch reprojection,
// so they must be the same number everywhere — hence exported once here.)
const CAMERA_HFOV = 65;
const CAMERA_VFOV = 50;

// Desired overlap between adjacent frames (0.45 = 45%). More overlap = more
// photos but far more robust stitching.
const RING_OVERLAP = 0.45;

const ROW_PITCHES = [0, 35, -35, 65, -65, 90];

// Columns are DERIVED from the real FOV + overlap, not hand-typed, so the
// capture grid and the stitch geometry can never drift apart again.
const COLS_PER_ROW = ROW_PITCHES.map((p, i) =>
  i === ROW_PITCHES.length - 1 ? 1 : colsForRing(CAMERA_HFOV, p, RING_OVERLAP),
);

export const CAPTURE_CONFIG = {
  ROWS: ROW_PITCHES.length,
  COLS_PER_ROW,
  ROW_PITCHES,
  TOTAL_PHOTOS: COLS_PER_ROW.reduce((a, b) => a + b, 0),

  // Camera settings
  CAMERA: {
    QUALITY: 0.92,
    RATIO: "4:3",
  },

  // Tighter tolerance for better alignment accuracy
  POSITION_TOLERANCE: 9,

  // Slightly longer delay so the phone stabilizes before shooting
  AUTO_CAPTURE_DELAY: 550,

  // Camera field of view (single source of truth — used by capture guidance
  // AND the stitch reprojection)
  CAMERA_HFOV,
  CAMERA_VFOV,

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
// Single shared spherical projection (see utils/Geometry.ts). Both the
// guidance overlay and the live photo-patch placement now use THIS, which is
// the exact same maths the stitch engine uses — no more drift.
export { normDelta } from '@/utils/Geometry';

export function toScreen(
    yaw: number,
    pitch: number,
    curYaw: number,
    curPitch: number,
    _SW: number,
    _SH: number,
) {
    const r = worldToViewfinder(
        yaw, pitch, curYaw, curPitch,
        CAPTURE_CONFIG.CAMERA_HFOV, CAPTURE_CONFIG.CAMERA_VFOV,
        { left: VF_LEFT, top: VF_TOP, width: VF_W, height: VF_H },
    );
    // Behind the camera → push far off-screen so it isn't drawn.
    if (!r) return { x: -99999, y: -99999 };
    return { x: r.x, y: r.y };
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
