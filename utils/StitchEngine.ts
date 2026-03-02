// Equirectangular Stitching Engine v2
// Correct spherical projection: each photo is mapped onto the sphere
// by reverse-projecting each output pixel through the camera model.
// This eliminates black gaps and handles latitude compression properly.

import { CAPTURE_CONFIG, CapturePosition } from '@/constants/CaptureConfig';
import * as FileSystem from 'expo-file-system/legacy';

// Output dimensions
const EQUIRECT_WIDTH = 4096;
const EQUIRECT_HEIGHT = 2048; // 2:1 ratio

export interface StitchResult {
    uri: string;
    width: number;
    height: number;
}

/**
 * Generate stitching HTML with proper spherical projection.
 * 
 * Key difference from v1:
 * Instead of a simple "place tile at position" approach, we use
 * REVERSE PROJECTION: for each pixel in the output equirectangular
 * image, we figure out which input photo(s) can see that direction,
 * and sample from those photos with feathered blending.
 * 
 * This correctly handles the fact that photos at high pitch cover
 * more horizontal area in equirectangular space.
 */
export function generateStitchHTML(positions: CapturePosition[]): string {
    const capturedPositions = positions.filter(p => p.captured && p.uri);

    const imageData = capturedPositions.map(pos => ({
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
        
        // How much to enlarge tiles to ensure overlap and fill gaps
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
         * u,v are in range [0,1] when inside the photo.
         */
        function worldToCamera(dirYaw, dirPitch, camYaw, camPitch) {
            // Convert to radians
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

            // Camera right vector (in horizontal plane, rotated 90°)
            const rx = Math.cos(cy);
            const ry = 0;
            const rz = -Math.sin(cy);

            // Camera up vector (cross product of forward and right)
            const ux = cy3 * rz - cz3 * ry;
            const uy = cz3 * rx - cx3 * rz;
            const uz = cx3 * ry - cy3 * rx;

            // Project direction onto camera axes
            const fwd = dx3 * cx3 + dy3 * cy3 + dz3 * cz3;
            if (fwd <= 0.01) return null; // Behind camera

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
         * Feather weight: 1.0 at center, fades to 0 at edges
         * Uses smooth cosine falloff
         */
        function feather(u, v) {
            // Distance from center normalized to [0,1]
            const du = Math.abs(u - 0.5) * 2; // 0 at center, 1 at edge
            const dv = Math.abs(v - 0.5) * 2;
            const d = Math.max(du, dv);
            if (d >= 1) return 0;
            // Smooth falloff starting at 60% from center
            if (d < 0.6) return 1;
            return 0.5 + 0.5 * Math.cos(Math.PI * (d - 0.6) / 0.4);
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
            // Step 1: Load all images and get pixel data
            status.textContent = 'Chargement des images...';
            const photoData = [];

            for (let i = 0; i < images.length; i++) {
                status.textContent = 'Chargement ' + (i+1) + '/' + images.length + '...';
                try {
                    const img = await loadImage(images[i].uri);
                    // Draw to temp canvas at reasonable size
                    const tw = 800;
                    const th = 600;
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

            // Step 2: Compute exposure normalization
            status.textContent = 'Analyse de luminosité...';
            const brightnessList = [];
            for (const pd of photoData) {
                let sum = 0, c = 0;
                const d = pd.pixels.data;
                for (let i = 0; i < d.length; i += 16) {
                    sum += d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
                    c++;
                }
                brightnessList.push(sum / c);
            }
            const avgBrightness = brightnessList.reduce((a,b) => a + b, 0) / brightnessList.length;
            const exposureFactors = brightnessList.map(b =>
                Math.max(0.6, Math.min(1.5, avgBrightness / (b || avgBrightness)))
            );

            // Step 3: For each output pixel, sample from applicable photos
            status.textContent = 'Assemblage... (0%)';
            
            // Process in chunks to avoid UI freeze and show progress
            const CHUNK = 16; // Process 16 rows at a time
            let processedRows = 0;

            function processChunk(startY) {
                const endY = Math.min(startY + CHUNK, EQ_H);
                
                for (let eqY = startY; eqY < endY; eqY++) {
                    for (let eqX = 0; eqX < EQ_W; eqX++) {
                        const dir = eqToDirection(eqX, eqY);

                        // Check each photo to see if it covers this direction
                        for (let pi = 0; pi < photoData.length; pi++) {
                            const pd = photoData[pi];
                            const cam = pd.info;

                            // Quick angular distance check (skip if too far)
                            let dYaw = dir.yaw - cam.yaw;
                            if (dYaw > 180) dYaw -= 360;
                            if (dYaw < -180) dYaw += 360;
                            const dPitch = dir.pitch - cam.pitch;
                            // Generous check using COVERAGE_BOOST
                            if (Math.abs(dYaw) > CAM_HFOV_DEG * COVERAGE_BOOST && Math.abs(dPitch) > CAM_VFOV_DEG * COVERAGE_BOOST) continue;

                            // Project world direction into this camera
                            const uv = worldToCamera(dir.yaw, dir.pitch, cam.yaw, cam.pitch);
                            if (!uv) continue;

                            const { u, v } = uv;
                            // Check if inside the photo (with coverage boost for overlap)
                            const margin = (COVERAGE_BOOST - 1) / 2;
                            if (u < -margin || u > 1 + margin || v < -margin || v > 1 + margin) continue;

                            // Clamp u,v to valid sample range
                            const su = Math.max(0, Math.min(0.999, u));
                            const sv = Math.max(0, Math.min(0.999, v));

                            // Sample pixel from photo
                            const sx = Math.floor(su * pd.w);
                            const sy = Math.floor(sv * pd.h);
                            const si = (sy * pd.w + sx) * 4;

                            const w = feather(u, v);
                            if (w <= 0) continue;

                            const ef = exposureFactors[pi];
                            const di = eqY * EQ_W + eqX;

                            accumR[di] += pd.pixels.data[si] * ef * w;
                            accumG[di] += pd.pixels.data[si + 1] * ef * w;
                            accumB[di] += pd.pixels.data[si + 2] * ef * w;
                            accumW[di] += w;
                        }
                    }
                }

                processedRows += (endY - startY);
                const pct = Math.round((processedRows / EQ_H) * 100);

                if (endY < EQ_H) {
                    status.textContent = 'Assemblage... (' + pct + '%)';
                    // Yield to UI to show progress
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

                // Step 5: Aggressive gap fill for remaining uncovered pixels
                // Multiple passes with increasing radius
                status.textContent = 'Correction des trous (' + uncoveredCount + ' pixels)...';
                
                for (let pass = 0; pass < 12; pass++) {
                    let filled = 0;
                    for (let y = 0; y < EQ_H; y++) {
                        for (let x = 0; x < EQ_W; x++) {
                            const idx = (y * EQ_W + x) * 4;
                            if (od[idx + 3] > 0) continue; // Already filled

                            let sumR = 0, sumG = 0, sumB = 0, count = 0;
                            const r = pass < 4 ? 1 : (pass < 8 ? 2 : 3);

                            for (let dy = -r; dy <= r; dy++) {
                                for (let dx = -r; dx <= r; dx++) {
                                    if (dx === 0 && dy === 0) continue;
                                    const ny = y + dy;
                                    let nx = x + dx;
                                    // Wrap horizontally (equirectangular wraps around)
                                    if (nx < 0) nx += EQ_W;
                                    if (nx >= EQ_W) nx -= EQ_W;
                                    if (ny < 0 || ny >= EQ_H) continue;

                                    const ni = (ny * EQ_W + nx) * 4;
                                    if (od[ni + 3] > 0) {
                                        const dist = Math.sqrt(dx*dx + dy*dy);
                                        const weight = 1 / dist;
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

                // Step 6: Fill any remaining black pixels with sky gradient
                for (let y = 0; y < EQ_H; y++) {
                    for (let x = 0; x < EQ_W; x++) {
                        const idx = (y * EQ_W + x) * 4;
                        if (od[idx + 3] === 0) {
                            // Gradient from dark blue (top) to dark gray (bottom)
                            const t = y / EQ_H;
                            od[idx] = Math.round(20 + t * 15);
                            od[idx + 1] = Math.round(20 + t * 10);
                            od[idx + 2] = Math.round(30 + t * 10);
                            od[idx + 3] = 255;
                        }
                    }
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
    projectId: string
): Promise<string> {
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
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
    positions: CapturePosition[]
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
