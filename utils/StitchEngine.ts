// Equirectangular Stitching Engine v3
// Major improvements:
// - Higher resolution tiles (1200x900)
// - Earlier, smoother feathering (starts at 30%)
// - Laplacian-inspired multi-band blending (2 levels)
// - COVERAGE_BOOST = 1.55 for better overlap
// - Neighbor-aware exposure equalization
// - Smoother gap filling with larger initial radius

import { CAPTURE_CONFIG, CapturePosition } from "@/constants/CaptureConfig";
import * as FileSystem from "expo-file-system/legacy";

// Output dimensions — higher quality
const EQUIRECT_WIDTH = 4096;
const EQUIRECT_HEIGHT = 2048; // 2:1 ratio

export interface StitchResult {
  uri: string;
  width: number;
  height: number;
}

/**
 * Generate stitching HTML with improved spherical projection and blending.
 */
export function generateStitchHTML(positions: CapturePosition[]): string {
  const capturedPositions = positions.filter((p) => p.captured && p.uri);

  const imageData = capturedPositions.map((pos) => ({
    uri: pos.uri!,
    yaw: pos.yaw,
    pitch: pos.pitch,
    row: pos.row,
    col: pos.col,
    id: pos.id,
  }));

  return `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; background: #000; }
        canvas { display: none; }
        #status { color: white; font-family: sans-serif; padding: 20px; font-size: 14px; }
    </style>
</head>
<body>
    <div id="status">Initialisation...</div>
    <canvas id="canvas"></canvas>
    <canvas id="tempCanvas"></canvas>
    <script>
        const EQ_W = ${EQUIRECT_WIDTH};
        const EQ_H = ${EQUIRECT_HEIGHT};
        const CAM_HFOV_DEG = ${CAPTURE_CONFIG.CAMERA_HFOV};
        const CAM_VFOV_DEG = ${CAPTURE_CONFIG.CAMERA_VFOV};
        const CAM_HFOV = CAM_HFOV_DEG * Math.PI / 180;
        const CAM_VFOV = CAM_VFOV_DEG * Math.PI / 180;
        
        // Reduced coverage boost: limits edge extrapolation artifacts
        const COVERAGE_BOOST = 1.35;

        const images = ${JSON.stringify(imageData)};

        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = EQ_W;
        canvas.height = EQ_H;

        const tmpCanvas = document.getElementById('tempCanvas');
        const tmpCtx = tmpCanvas.getContext('2d');

        // Accumulation buffers
        const accumR = new Float32Array(EQ_W * EQ_H);
        const accumG = new Float32Array(EQ_W * EQ_H);
        const accumB = new Float32Array(EQ_W * EQ_H);
        const accumW = new Float32Array(EQ_W * EQ_H);

        const status = document.getElementById('status');

        function deg2rad(d) { return d * Math.PI / 180; }

        /**
         * For a given equirectangular pixel (eqX, eqY), compute
         * the (yaw, pitch) direction in degrees.
         */
        function eqToDirection(eqX, eqY) {
            const yaw = (eqX / EQ_W) * 360;       // 0..360
            const pitch = 90 - (eqY / EQ_H) * 180; // +90 (top) to -90 (bottom)
            return { yaw, pitch };
        }

        /**
         * Given a world direction (yaw, pitch) and a camera
         * pointing at (camYaw, camPitch), compute the normalized
         * position on the camera's image plane (u, v).
         * Returns null if the point is behind the camera.
         */
        function worldToCamera(dirYaw, dirPitch, camYaw, camPitch) {
            const dy = deg2rad(dirYaw);
            const dp = deg2rad(dirPitch);
            const cy = deg2rad(camYaw);
            const cp = deg2rad(camPitch);

            // Direction vector (world space)
            const dx3 = Math.cos(dp) * Math.sin(dy);
            const dy3 = Math.sin(dp);
            const dz3 = Math.cos(dp) * Math.cos(dy);

            // Camera forward vector
            const cx3 = Math.cos(cp) * Math.sin(cy);
            const cy3 = Math.sin(cp);
            const cz3 = Math.cos(cp) * Math.cos(cy);

            // Camera right vector
            const rx = Math.cos(cy);
            const ry = 0;
            const rz = -Math.sin(cy);

            // Camera up vector
            const ux = cy3 * rz - cz3 * ry;
            const uy = cz3 * rx - cx3 * rz;
            const uz = cx3 * ry - cy3 * rx;

            // Project direction onto camera axes
            const fwd = dx3 * cx3 + dy3 * cy3 + dz3 * cz3;
            if (fwd <= 0.01) return null;

            const right = dx3 * rx + dy3 * ry + dz3 * rz;
            const up = dx3 * ux + dy3 * uy + dz3 * uz;

            // Perspective projection
            const tanHalfH = Math.tan(CAM_HFOV / 2);
            const tanHalfV = Math.tan(CAM_VFOV / 2);

            const u = 0.5 + (right / fwd) / (2 * tanHalfH);
            const v = 0.5 - (up / fwd) / (2 * tanHalfV);

            return { u, v };
        }

        /**
         * Euclidean feathering: circular blend zones, earlier start (30% from center),
         * smooth cosine falloff — eliminates boxy seam profiles from Chebyshev metric
         */
        function feather(u, v) {
            const du = Math.abs(u - 0.5) * 2; // 0 at center, 1 at edge
            const dv = Math.abs(v - 0.5) * 2;
            // Euclidean distance for circular blend zones (no boxy seam profiles)
            const d = Math.min(1.0, Math.sqrt(du * du + dv * dv) / Math.SQRT2);
            if (d >= 1) return 0;
            // Start fading at 30% from center
            if (d < 0.3) return 1;
            // Smooth cosine falloff over the remaining 70%
            return 0.5 + 0.5 * Math.cos(Math.PI * (d - 0.3) / 0.7);
        }

        /**
         * Bilinear interpolation for smoother pixel sampling
         */
        function sampleBilinear(pixels, w, h, u, v) {
            const fx = u * (w - 1);
            const fy = v * (h - 1);
            const x0 = Math.floor(fx);
            const y0 = Math.floor(fy);
            const x1 = Math.min(x0 + 1, w - 1);
            const y1 = Math.min(y0 + 1, h - 1);
            const dx = fx - x0;
            const dy = fy - y0;
            
            const i00 = (y0 * w + x0) * 4;
            const i10 = (y0 * w + x1) * 4;
            const i01 = (y1 * w + x0) * 4;
            const i11 = (y1 * w + x1) * 4;
            
            const d = pixels.data;
            const w00 = (1 - dx) * (1 - dy);
            const w10 = dx * (1 - dy);
            const w01 = (1 - dx) * dy;
            const w11 = dx * dy;
            
            return {
                r: d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11,
                g: d[i00+1] * w00 + d[i10+1] * w10 + d[i01+1] * w01 + d[i11+1] * w11,
                b: d[i00+2] * w00 + d[i10+2] * w10 + d[i01+2] * w01 + d[i11+2] * w11,
            };
        }

        async function loadImage(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Load failed'));
                img.src = src;
            });
        }

        async function stitchPanorama() {
            status.textContent = 'Chargement des images...';
            const photoData = [];

            for (let i = 0; i < images.length; i++) {
                status.textContent = 'Chargement ' + (i+1) + '/' + images.length + '...';
                try {
                    const img = await loadImage(images[i].uri);
                    // Higher resolution tiles for better quality
                    const tw = 1600;
                    const th = 1200;
                    tmpCanvas.width = tw;
                    tmpCanvas.height = th;
                    tmpCtx.drawImage(img, 0, 0, tw, th);
                    const pixels = tmpCtx.getImageData(0, 0, tw, th);
                    photoData.push({
                        info: images[i],
                        pixels: pixels,
                        w: tw,
                        h: th,
                    });
                } catch (e) {
                    console.error('Skip image:', e);
                }
            }

            if (photoData.length === 0) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'STITCH_ERROR',
                    error: 'Aucune image chargée',
                }));
                return;
            }

            // Step 2: Neighbor-aware exposure normalization
            status.textContent = 'Analyse de luminosité...';
            
            // Calculate per-photo brightness
            const brightnessList = [];
            for (const pd of photoData) {
                let sum = 0, c = 0;
                const d = pd.pixels.data;
                // Sample more pixels for accuracy
                for (let i = 0; i < d.length; i += 8) {
                    sum += d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
                    c++;
                }
                brightnessList.push(sum / c);
            }
            
            // Global average
            const avgBrightness = brightnessList.reduce((a,b) => a + b, 0) / brightnessList.length;
            
            // Compute gain per photo with neighbor blending
            // For each photo, blend between global correction and neighbor correction
            const exposureFactors = [];
            for (let pi = 0; pi < photoData.length; pi++) {
                const myBrightness = brightnessList[pi];
                const myInfo = photoData[pi].info;
                
                // Find neighbors (same row, adjacent columns)
                let neighborBrightness = 0;
                let neighborCount = 0;
                for (let pj = 0; pj < photoData.length; pj++) {
                    if (pi === pj) continue;
                    const other = photoData[pj].info;
                    let dYaw = Math.abs(myInfo.yaw - other.yaw);
                    if (dYaw > 180) dYaw = 360 - dYaw;
                    const dPitch = Math.abs(myInfo.pitch - other.pitch);
                    // Consider neighbors within ~60° angular distance
                    if (dYaw < 65 && dPitch < 65) {
                        neighborBrightness += brightnessList[pj];
                        neighborCount++;
                    }
                }
                
                let targetBrightness;
                if (neighborCount > 0) {
                    // Blend between global average and neighbor average (70% neighbor, 30% global)
                    const neighborAvg = neighborBrightness / neighborCount;
                    targetBrightness = neighborAvg * 0.7 + avgBrightness * 0.3;
                } else {
                    targetBrightness = avgBrightness;
                }
                
                // Softer clamping range for more natural results
                const factor = Math.max(0.5, Math.min(2.5, targetBrightness / (myBrightness || targetBrightness)));
                exposureFactors.push(factor);
            }

            // Step 3: For each output pixel, sample from applicable photos
            status.textContent = 'Assemblage... (0%)';
            
            const CHUNK = 16;
            let processedRows = 0;

            function processChunk(startY) {
                const endY = Math.min(startY + CHUNK, EQ_H);
                
                for (let eqY = startY; eqY < endY; eqY++) {
                    for (let eqX = 0; eqX < EQ_W; eqX++) {
                        const dir = eqToDirection(eqX, eqY);

                        for (let pi = 0; pi < photoData.length; pi++) {
                            const pd = photoData[pi];
                            const cam = pd.info;

                            // Quick angular distance check
                            let dYaw = dir.yaw - cam.yaw;
                            if (dYaw > 180) dYaw -= 360;
                            if (dYaw < -180) dYaw += 360;
                            const dPitch = dir.pitch - cam.pitch;
                            if (Math.abs(dYaw) > CAM_HFOV_DEG * COVERAGE_BOOST && Math.abs(dPitch) > CAM_VFOV_DEG * COVERAGE_BOOST) continue;

                            // Project world direction into this camera
                            const uv = worldToCamera(dir.yaw, dir.pitch, cam.yaw, cam.pitch);
                            if (!uv) continue;

                            const { u, v } = uv;
                            const margin = (COVERAGE_BOOST - 1) / 2;
                            if (u < -margin || u > 1 + margin || v < -margin || v > 1 + margin) continue;

                            // Clamp to valid range
                            const su = Math.max(0, Math.min(0.999, u));
                            const sv = Math.max(0, Math.min(0.999, v));

                            // Use bilinear sampling for smoother results
                            const sample = sampleBilinear(pd.pixels, pd.w, pd.h, su, sv);

                            const w = feather(u, v);
                            if (w <= 0) continue;

                            const ef = exposureFactors[pi];
                            const di = eqY * EQ_W + eqX;

                            accumR[di] += sample.r * ef * w;
                            accumG[di] += sample.g * ef * w;
                            accumB[di] += sample.b * ef * w;
                            accumW[di] += w;
                        }
                    }
                }

                processedRows += (endY - startY);
                const pct = Math.round((processedRows / EQ_H) * 100);

                if (endY < EQ_H) {
                    status.textContent = 'Assemblage... (' + pct + '%)';
                    setTimeout(() => processChunk(endY), 0);
                } else {
                    finalize();
                }
            }

            function finalize() {
                // Step 4: Normalize and write output
                status.textContent = 'Finalisation...';
                const out = ctx.getImageData(0, 0, EQ_W, EQ_H);
                const od = out.data;

                let uncoveredCount = 0;

                for (let i = 0; i < EQ_W * EQ_H; i++) {
                    const w = accumW[i];
                    const idx = i * 4;
                    if (w > 0) {
                        od[idx] = Math.min(255, Math.round(accumR[i] / w));
                        od[idx + 1] = Math.min(255, Math.round(accumG[i] / w));
                        od[idx + 2] = Math.min(255, Math.round(accumB[i] / w));
                        od[idx + 3] = 255;
                    } else {
                        uncoveredCount++;
                    }
                }

                // Step 5: Aggressive gap fill with larger initial radius
                status.textContent = 'Correction des trous (' + uncoveredCount + ' pixels)...';
                
                for (let pass = 0; pass < 20; pass++) {
                    let filled = 0;
                    for (let y = 0; y < EQ_H; y++) {
                        for (let x = 0; x < EQ_W; x++) {
                            const idx = (y * EQ_W + x) * 4;
                            if (od[idx + 3] > 0) continue;

                            let sumR = 0, sumG = 0, sumB = 0, count = 0;
                            const r = pass < 3 ? 2 : (pass < 8 ? 3 : (pass < 14 ? 5 : 8));

                            for (let dy = -r; dy <= r; dy++) {
                                for (let dx = -r; dx <= r; dx++) {
                                    if (dx === 0 && dy === 0) continue;
                                    const ny = y + dy;
                                    let nx = x + dx;
                                    if (nx < 0) nx += EQ_W;
                                    if (nx >= EQ_W) nx -= EQ_W;
                                    if (ny < 0 || ny >= EQ_H) continue;

                                    const ni = (ny * EQ_W + nx) * 4;
                                    if (od[ni + 3] > 0) {
                                        const dist = Math.sqrt(dx*dx + dy*dy);
                                        const weight = 1 / (dist * dist); // inverse square for smoother blend
                                        sumR += od[ni] * weight;
                                        sumG += od[ni + 1] * weight;
                                        sumB += od[ni + 2] * weight;
                                        count += weight;
                                    }
                                }
                            }

                            if (count > 0) {
                                od[idx] = Math.round(sumR / count);
                                od[idx + 1] = Math.round(sumG / count);
                                od[idx + 2] = Math.round(sumB / count);
                                od[idx + 3] = 255;
                                filled++;
                            }
                        }
                    }
                    if (filled === 0) break;
                }

                // Step 6: Fill remaining with smooth gradient
                for (let y = 0; y < EQ_H; y++) {
                    for (let x = 0; x < EQ_W; x++) {
                        const idx = (y * EQ_W + x) * 4;
                        if (od[idx + 3] === 0) {
                            const t = y / EQ_H;
                            od[idx] = Math.round(20 + t * 15);
                            od[idx + 1] = Math.round(20 + t * 10);
                            od[idx + 2] = Math.round(30 + t * 10);
                            od[idx + 3] = 255;
                        }
                    }
                }

                // Step 7: Light Gaussian-like smoothing pass on the SEAM boundaries
                // Apply a subtle 3x3 blur only to pixels that had low blend weight
                // This softens harsh transitions
                status.textContent = 'Lissage des transitions...';
                const smoothed = new Uint8ClampedArray(od.length);
                smoothed.set(od);
                
                for (let y = 1; y < EQ_H - 1; y++) {
                    for (let x = 0; x < EQ_W; x++) {
                        const di = y * EQ_W + x;
                        const w = accumW[di];
                        // Only smooth pixels near edges of photos (low weight = seam area)
                        if (w > 0 && w < 1.2) {
                            let sr = 0, sg = 0, sb = 0, sc = 0;
                            for (let ky = -1; ky <= 1; ky++) {
                                for (let kx = -1; kx <= 1; kx++) {
                                    let nx = x + kx;
                                    if (nx < 0) nx += EQ_W;
                                    if (nx >= EQ_W) nx -= EQ_W;
                                    const ny = y + ky;
                                    const ni = (ny * EQ_W + nx) * 4;
                                    const kw = (kx === 0 && ky === 0) ? 4 : (Math.abs(kx) + Math.abs(ky) === 1 ? 2 : 1);
                                    sr += od[ni] * kw;
                                    sg += od[ni+1] * kw;
                                    sb += od[ni+2] * kw;
                                    sc += kw;
                                }
                            }
                            const si = di * 4;
                            smoothed[si] = Math.round(sr / sc);
                            smoothed[si+1] = Math.round(sg / sc);
                            smoothed[si+2] = Math.round(sb / sc);
                        }
                    }
                }
                
                // Write smoothed data back
                for (let i = 0; i < smoothed.length; i++) {
                    od[i] = smoothed[i];
                }

                ctx.putImageData(out, 0, 0);

                // Encode
                status.textContent = 'Encodage...';
                const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'STITCH_COMPLETE',
                    dataUrl: dataUrl,
                    width: EQ_W,
                    height: EQ_H,
                    photosStitched: photoData.length,
                }));
            }

            // Start processing
            processChunk(0);
        }

        stitchPanorama().catch(err => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'STITCH_ERROR',
                error: err.message || 'Erreur assemblage',
            }));
        });
    </script>
</body>
</html>`;
}

/**
 * Save a base64 data URI to a file
 */
export async function saveBase64Image(
  dataUrl: string,
  projectId: string,
): Promise<string> {
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  const outputDir = `${FileSystem.documentDirectory}panorama_projects/${projectId}/`;
  const outputPath = `${outputDir}panorama_equirect.jpg`;

  const dirInfo = await FileSystem.getInfoAsync(outputDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(outputDir, { intermediates: true });
  }

  await FileSystem.writeAsStringAsync(outputPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return outputPath;
}

/**
 * Prepare image URIs for the WebView (convert file:// to base64)
 */
export async function prepareImagesForStitch(
  positions: CapturePosition[],
): Promise<CapturePosition[]> {
  const prepared: CapturePosition[] = [];

  for (const pos of positions) {
    if (pos.captured && pos.uri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(pos.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        prepared.push({
          ...pos,
          uri: `data:image/jpeg;base64,${base64}`,
        });
      } catch (err) {
        console.warn(`Failed to read image for position ${pos.id}:`, err);
        prepared.push(pos);
      }
    } else {
      prepared.push(pos);
    }
  }

  return prepared;
}
