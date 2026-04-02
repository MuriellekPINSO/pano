// Configuration for 360° capture - Optimized for coverage AND great UX
// 18 photos total: enough for seamless stitching, fast enough (~90s)
// Row-by-row guided capture like Google Street View

export const CAPTURE_CONFIG = {
  // Grid: 3 rings + zenith — improved coverage
  // Row 0 (Horizon):  8 photos at pitch  0°  — main coverage
  // Row 1 (Top):      6 photos at pitch +50° — upper hemisphere
  // Row 2 (Bottom):   5 photos at pitch -50° — lower hemisphere (72° spacing, was 120°)
  // Row 3 (Zenith):   3 photos at pitch +85° — ceiling (120° spacing, interleaved with row 1)
  ROWS: 4,
  COLS_PER_ROW: [8, 6, 5, 3],
  ROW_PITCHES: [0, 50, -50, 85],
  HORIZONTAL_STEP: 45, // 360 / 8 = 45° (row 0)
  TOTAL_PHOTOS: 22,

  // Camera settings
  CAMERA: {
    QUALITY: 0.92,
    RATIO: "4:3",
  },

  // Tighter tolerance for better alignment accuracy
  POSITION_TOLERANCE: 15,

  // Fast auto-capture
  AUTO_CAPTURE_DELAY: 400,

  // Camera field of view
  CAMERA_HFOV: 70,
  CAMERA_VFOV: 55,

  // Row labels — French
  ROW_LABELS: ["Horizon", "Haut", "Bas", "Plafond"] as const,
  ROW_ICONS: [
    "panorama-horizontal",
    "arrow-upward",
    "arrow-downward",
    "vertical-align-top",
  ] as const,

  // Instructions for guided experience
  ROW_INSTRUCTIONS: [
    "Tournez lentement sur vous-même",
    "Inclinez le téléphone vers le haut",
    "Inclinez le téléphone vers le bas",
    "Pointez vers le plafond",
  ] as const,

  // Row colors
  ROW_COLORS: ["#6C63FF", "#FF6B35", "#10B981", "#F59E0B"] as const,
};

// Generate capture positions
export function generateCapturePositions(): CapturePosition[] {
  const positions: CapturePosition[] = [];
  let id = 0;

  for (let row = 0; row < CAPTURE_CONFIG.ROWS; row++) {
    const colCount = CAPTURE_CONFIG.COLS_PER_ROW[row];
    const pitch = CAPTURE_CONFIG.ROW_PITCHES[row];
    const yawStep = 360 / colCount;

    for (let col = 0; col < colCount; col++) {
      // Stagger all non-horizon rows for better inter-row coverage
      const yawOffset = row === 1 || row === 2 || row === 3 ? yawStep / 2 : 0;
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
