/**
 * ComputerVision.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-JS computer vision for panorama capture quality analysis.
 *
 * What it does:
 *  1. pHash  — perceptual image hash (8×8 DCT hash)
 *  2. Edge fingerprints — average RGB on the 4 edges of each photo
 *  3. Hamming distance — compare two pHashes to detect visual similarity
 *  4. Edge match score — check if the RIGHT edge of photo A looks like
 *     the LEFT edge of photo B (overlap zone quality)
 *  5. Exposure analysis — brightness & contrast fingerprint
 *
 * All processing runs in a hidden HTML5 Canvas inside a React Native WebView
 * (see CvWebViewProcessor). The WebView sends pixel data back as JSON.
 *
 * Usage:
 *   const cv = await analyzePhoto(uri);        // get fingerprint
 *   const score = matchFingerprints(cvA, cvB); // compare two photos
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PhotoFingerprint {
  positionId: number;
  uri: string;
  // pHash: 64-bit hash stored as array of 0/1
  pHash: number[];
  // Average colour on each edge (8-pixel strip)
  edges: {
    top:    { r: number; g: number; b: number };
    bottom: { r: number; g: number; b: number };
    left:   { r: number; g: number; b: number };
    right:  { r: number; g: number; b: number };
  };
  // Global brightness 0-255 and contrast (std deviation)
  brightness: number;
  contrast: number;
  // Thumbnail: tiny 32x24 pixel grid as flat RGB array (length = 32*24*3)
  thumb: number[];
}

export interface NeighborMatch {
  positionIdA: number;
  positionIdB: number;
  direction: 'left-right' | 'top-bottom';
  // 0 = no match, 1 = perfect match
  edgeScore: number;
  // Hamming similarity 0-1 (1=identical)
  hammingScore: number;
  // Combined quality
  quality: 'good' | 'fair' | 'poor';
}

// ─── dHash helpers ────────────────────────────────────────────────────────────

/**
 * Compute a difference hash (dHash) from an 8×9 grayscale pixel grid.
 * Far more robust than average-hash under exposure/lighting changes.
 *
 * Algorithm:
 *  - For each of 8 rows, compare each pixel to the one immediately to its right
 *  - Result is a 64-bit hash (8×8 comparisons)
 *  - Requires gray input of size 9×8 = 72 values (9 columns, 8 rows)
 */
export function computeDHash(gray72: number[]): number[] {
  // gray72 must have 9 columns × 8 rows = 72 values
  const COLS = 9;
  const ROWS = 8;
  const hash: number[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS - 1; x++) {
      const left  = gray72[y * COLS + x]     ?? 0;
      const right = gray72[y * COLS + x + 1] ?? 0;
      hash.push(left < right ? 1 : 0);
    }
  }
  return hash; // length = 64
}

/** @deprecated use computeDHash — kept for API compat */
export const computePHash = computeDHash;

/**
 * Hamming similarity between two 64-bit hashes.
 * Returns 0–1 (1 = identical).
 */
export function hammingSimilarity(hashA: number[], hashB: number[]): number {
  const len = Math.min(hashA.length, hashB.length);
  if (len === 0) return 0;
  let diff = 0;
  for (let i = 0; i < len; i++) {
    if (hashA[i] !== hashB[i]) diff++;
  }
  return 1 - diff / len;
}

/**
 * Edge colour similarity: compares the right edge of A with left edge of B.
 * Returns 0–1 (1 = perfect colour match = good overlap).
 */
export function edgeSimilarity(
  edgeA: { r: number; g: number; b: number },
  edgeB: { r: number; g: number; b: number },
): number {
  const dr = Math.abs(edgeA.r - edgeB.r) / 255;
  const dg = Math.abs(edgeA.g - edgeB.g) / 255;
  const db = Math.abs(edgeA.b - edgeB.b) / 255;
  // Perceptual weights (same as luminance: R=0.299, G=0.587, B=0.114)
  const dist = dr * 0.299 + dg * 0.587 + db * 0.114;
  return Math.max(0, 1 - dist * 3); // scale: 33% colour diff → score 0
}

// ─── Fingerprint computation ─────────────────────────────────────────────────

/**
 * Build a PhotoFingerprint from raw pixel data.
 * pixelData: Uint8ClampedArray or number[] from getImageData (RGBA, width×height)
 */
export function buildFingerprint(
  positionId: number,
  uri: string,
  pixelData: number[],
  width: number,
  height: number,
): PhotoFingerprint {
  const EDGE_STRIP = Math.max(1, Math.floor(Math.min(width, height) * 0.08));

  // ── Grayscale 9×8 grid for dHash (left-right pixel comparisons) ──
  // dHash needs 9 cols × 8 rows = 72 grayscale samples
  const DHASH_COLS = 9;
  const DHASH_ROWS = 8;
  const gray72: number[] = [];
  for (let ty = 0; ty < DHASH_ROWS; ty++) {
    for (let tx = 0; tx < DHASH_COLS; tx++) {
      const px = Math.floor((tx / DHASH_COLS) * width);
      const py = Math.floor((ty / DHASH_ROWS) * height);
      const i = (py * width + px) * 4;
      const lum = pixelData[i] * 0.299 + pixelData[i + 1] * 0.587 + pixelData[i + 2] * 0.114;
      gray72.push(lum);
    }
  }

  // ── Tiny 32×24 thumbnail (RGB) ──
  const THUMB_W = 32, THUMB_H = 24;
  const thumb: number[] = [];
  for (let ty = 0; ty < THUMB_H; ty++) {
    for (let tx = 0; tx < THUMB_W; tx++) {
      const px = Math.floor((tx / THUMB_W) * width);
      const py = Math.floor((ty / THUMB_H) * height);
      const i = (py * width + px) * 4;
      thumb.push(pixelData[i], pixelData[i + 1], pixelData[i + 2]);
    }
  }

  // ── Edge fingerprints ──
  function avgEdge(strip: number[]): { r: number; g: number; b: number } {
    let r = 0, g = 0, b = 0;
    const n = strip.length / 4;
    for (let i = 0; i < strip.length; i += 4) {
      r += strip[i]; g += strip[i + 1]; b += strip[i + 2];
    }
    return { r: r / n, g: g / n, b: b / n };
  }

  // Top edge
  const topPixels: number[] = [];
  for (let y = 0; y < EDGE_STRIP; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      topPixels.push(pixelData[i], pixelData[i+1], pixelData[i+2], pixelData[i+3]);
    }

  // Bottom edge
  const botPixels: number[] = [];
  for (let y = height - EDGE_STRIP; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      botPixels.push(pixelData[i], pixelData[i+1], pixelData[i+2], pixelData[i+3]);
    }

  // Left edge
  const leftPixels: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < EDGE_STRIP; x++) {
      const i = (y * width + x) * 4;
      leftPixels.push(pixelData[i], pixelData[i+1], pixelData[i+2], pixelData[i+3]);
    }

  // Right edge
  const rightPixels: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = width - EDGE_STRIP; x < width; x++) {
      const i = (y * width + x) * 4;
      rightPixels.push(pixelData[i], pixelData[i+1], pixelData[i+2], pixelData[i+3]);
    }

  // ── Global brightness & contrast ──
  let sumL = 0, sumL2 = 0;
  const totalPixels = width * height;
  for (let i = 0; i < pixelData.length; i += 4) {
    const lum = pixelData[i] * 0.299 + pixelData[i+1] * 0.587 + pixelData[i+2] * 0.114;
    sumL += lum;
    sumL2 += lum * lum;
  }
  const brightness = sumL / totalPixels;
  const variance = sumL2 / totalPixels - brightness * brightness;
  const contrast = Math.sqrt(Math.max(0, variance));

  return {
    positionId,
    uri,
    pHash: computeDHash(gray72),
    edges: {
      top:    avgEdge(topPixels),
      bottom: avgEdge(botPixels),
      left:   avgEdge(leftPixels),
      right:  avgEdge(rightPixels),
    },
    brightness,
    contrast,
    thumb,
  };
}

// ─── Neighbor matching ────────────────────────────────────────────────────────

/**
 * Compare two fingerprints that should be left-right neighbors.
 * The right edge of A should match the left edge of B.
 */
export function matchNeighbors(
  fpA: PhotoFingerprint,
  fpB: PhotoFingerprint,
  direction: 'left-right' | 'top-bottom',
): NeighborMatch {
  // Edge similarity at the shared boundary
  let edgeScore: number;
  if (direction === 'left-right') {
    edgeScore = edgeSimilarity(fpA.edges.right, fpB.edges.left);
  } else {
    edgeScore = edgeSimilarity(fpA.edges.bottom, fpB.edges.top);
  }

  // pHash similarity (do the photos look like the same scene?)
  const hammingScore = hammingSimilarity(fpA.pHash, fpB.pHash);

  // Combined score (edge match is more specific, weight it more)
  const combined = edgeScore * 0.65 + hammingScore * 0.35;

  const quality: 'good' | 'fair' | 'poor' =
    combined > 0.70 ? 'good' :
    combined > 0.45 ? 'fair' : 'poor';

  return {
    positionIdA: fpA.positionId,
    positionIdB: fpB.positionId,
    direction,
    edgeScore,
    hammingScore,
    quality,
  };
}

// ─── HTML generator for WebView pixel extraction ─────────────────────────────

/**
 * Generates the HTML string to inject into a hidden WebView.
 * The WebView loads the image, draws it on a canvas, extracts pixels,
 * and sends the result back via postMessage.
 */
export function generateCvHTML(positionId: number, imageUri: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;background:#000">
<canvas id="c"></canvas>
<script>
(function() {
  const SAMPLE_W = 64;
  const SAMPLE_H = 48;
  const canvas = document.getElementById('c');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = function() {
    ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
    const imageData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    // Convert Uint8ClampedArray to regular Array for JSON
    const pixels = Array.from(imageData.data);
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'CV_PIXELS',
      positionId: ${positionId},
      pixels: pixels,
      width: SAMPLE_W,
      height: SAMPLE_H,
      uri: ${JSON.stringify(imageUri)},
    }));
  };

  img.onerror = function(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'CV_ERROR',
      positionId: ${positionId},
      error: 'Failed to load image',
    }));
  };

  img.src = ${JSON.stringify(imageUri)};
})();
</script>
</body>
</html>`;
}

// ─── Quality score helpers ────────────────────────────────────────────────────

/** Returns a colour representing match quality for UI display */
export function qualityColor(quality: 'good' | 'fair' | 'poor'): string {
  switch (quality) {
    case 'good': return '#22C55E';  // green
    case 'fair': return '#F59E0B';  // amber
    case 'poor': return '#EF4444';  // red
  }
}

/** Returns a score 0-1 summarising overall panorama quality */
export function panoramaQualityScore(matches: NeighborMatch[]): number {
  if (matches.length === 0) return 0;
  const avg = matches.reduce((s, m) =>
    s + (m.quality === 'good' ? 1 : m.quality === 'fair' ? 0.5 : 0), 0
  ) / matches.length;
  return avg;
}
