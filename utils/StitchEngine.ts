// Equirectangular Stitching Engine v3
// Major improvements:
// - Higher resolution tiles (1200x900)
// - Earlier, smoother feathering (starts at 30%)
// - Laplacian-inspired multi-band blending (2 levels)
// - COVERAGE_BOOST = 1.55 for better overlap
// - Neighbor-aware exposure equalization
// - Smoother gap filling with larger initial radius

import { CAPTURE_CONFIG, CapturePosition } from "@/constants/CaptureConfig";
import { PROJECTION_JS } from "@/utils/Geometry";
import * as FileSystem from "expo-file-system/legacy";

// Output dimensions. 4096×2048 = 8.4M px and the per-pixel loop tested every
// photo → minutes-long stitches / WebView crashes. 2048×1024 is plenty for a
// phone-viewed 360 and ~4× faster.
const EQUIRECT_WIDTH = 2048;
const EQUIRECT_HEIGHT = 1024; // 2:1 ratio

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
    roll: pos.roll ?? 0,
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
        
        // Lower boost = far less edge extrapolation = fewer radial smears.
        const COVERAGE_BOOST = 1.12;

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

        // ── Canonical projection, shared verbatim with capture guidance ──
        // (injected from utils/Geometry.ts so stitch & guidance can't drift)
        ${PROJECTION_JS}

        // Roll-aware projection: project with the roll-0 basis, then undo the
        // camera's in-image rotation. Done in tan-space (physical angles) so
        // the differing H/V FOV doesn't distort the rotation. rollDeg = the
        // device roll recorded when the photo was shot. This removes the
        // zigzag/sheared straight lines at the seams.
        const __tanH = Math.tan(CAM_HFOV_DEG * Math.PI / 360);
        const __tanV = Math.tan(CAM_VFOV_DEG * Math.PI / 360);
        function proj(dirYaw, dirPitch, camYaw, camPitch, rollDeg) {
            const uv = worldToCamera(dirYaw, dirPitch, camYaw, camPitch, CAM_HFOV_DEG, CAM_VFOV_DEG);
            if (!uv) return null;
            if (!rollDeg) return uv;
            const x = (uv.u - 0.5) * __tanH;
            const y = (uv.v - 0.5) * __tanV;
            const a = -rollDeg * Math.PI / 180;
            const ca = Math.cos(a), sa = Math.sin(a);
            const xr = x * ca - y * sa;
            const yr = x * sa + y * ca;
            return { u: 0.5 + xr / __tanH, v: 0.5 + yr / __tanV };
        }

        /**
         * Euclidean feathering: circular blend zones, earlier start (30% from center),
         * smooth cosine falloff — eliminates boxy seam profiles from Chebyshev metric
         */
        function feather(u, v) {
            const du = Math.abs(u - 0.5) * 2; // 0 at center, 1 at edge
            const dv = Math.abs(v - 0.5) * 2;
            const d = Math.min(1.0, Math.sqrt(du * du + dv * dv) / Math.SQRT2);
            if (d >= 1) return 0;
            // Sharp center-biased weight: the photo whose centre is closest to
            // this pixel dominates strongly, so misaligned overlaps no longer
            // average into ghosts/doubles — while still feathering smoothly.
            const t = 1 - d;
            return t * t * t * t; // (1-d)^4
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
                    // Source tiles: 1024×768 is enough to feed a 2048-wide
                    // equirect and keeps WebView memory sane with many photos.
                    const tw = 1024;
                    const th = 768;
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

            // ════════════════════════════════════════════════════════════
            // Step 1.5: FEATURE-BASED POSE REFINEMENT (gyro-seeded bundle
            // adjustment). The gyro gives a coarse (yaw,pitch) per photo;
            // here we refine each photo by maximising image correlation in
            // the overlap regions, then relax all corrections globally so
            // they're mutually consistent. This is what removes the seams
            // at low photo counts.
            // ════════════════════════════════════════════════════════════
            status.textContent = 'Recalage des images...';

            const GW = 128, GH = 96; // tiny grayscale proxy per photo
            const grays = [];
            for (const pd of photoData) {
                const d = pd.pixels.data, w = pd.w, h = pd.h;
                const g = new Float32Array(GW * GH);
                for (let y = 0; y < GH; y++) {
                    const sy = Math.min(h - 1, (y / GH * h) | 0);
                    for (let x = 0; x < GW; x++) {
                        const sx = Math.min(w - 1, (x / GW * w) | 0);
                        const i = (sy * w + sx) * 4;
                        g[y * GW + x] = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
                    }
                }
                grays.push(g);
            }

            function grayAt(g, u, v) {
                // bilinear sample of the small proxy, u,v in [0,1]
                const fx = u * (GW - 1), fy = v * (GH - 1);
                const x0 = fx | 0, y0 = fy | 0;
                const x1 = Math.min(x0 + 1, GW - 1), y1 = Math.min(y0 + 1, GH - 1);
                const dx = fx - x0, dy = fy - y0;
                const a = g[y0*GW+x0], b = g[y0*GW+x1];
                const c = g[y1*GW+x0], e = g[y1*GW+x1];
                return a*(1-dx)*(1-dy) + b*dx*(1-dy) + c*(1-dx)*dy + e*dx*dy;
            }

            // Normalised cross-correlation of photos pi and pj when pj's pose
            // is nudged by (ddy, ddp). Returns {score, n} (score in -1..1).
            function pairNCC(pi, pj, ddy, ddp) {
                const ai = photoData[pi].info, aj = photoData[pj].info;
                const gi = grays[pi], gj = grays[pj];
                let sx=0, sy=0, sxx=0, syy=0, sxy=0, n=0;
                // sweep world directions around photo i's centre
                for (let dy = -28; dy <= 28; dy += 3) {
                    const pit = ai.pitch + dy;
                    if (pit > 89 || pit < -89) continue;
                    for (let dx = -34; dx <= 34; dx += 3) {
                        const yaw = ai.yaw + dx / Math.max(0.25, Math.cos(pit*Math.PI/180));
                        const ui = proj(yaw, pit, ai.yaw, ai.pitch, ai.roll || 0);
                        if (!ui || ui.u<0.1 || ui.u>0.9 || ui.v<0.1 || ui.v>0.9) continue;
                        const uj = proj(yaw, pit, aj.yaw + ddy, aj.pitch + ddp, aj.roll || 0);
                        if (!uj || uj.u<0.1 || uj.u>0.9 || uj.v<0.1 || uj.v>0.9) continue;
                        const a = grayAt(gi, ui.u, ui.v);
                        const b = grayAt(gj, uj.u, uj.v);
                        sx+=a; sy+=b; sxx+=a*a; syy+=b*b; sxy+=a*b; n++;
                    }
                }
                if (n < 40) return { score: -2, n: n };
                const cov = sxy/n - (sx/n)*(sy/n);
                const vx = sxx/n - (sx/n)*(sx/n);
                const vy = syy/n - (sy/n)*(sy/n);
                if (vx < 1e-3 || vy < 1e-3) return { score: -2, n: n }; // flat → no info
                return { score: cov / Math.sqrt(vx*vy), n: n };
            }

            // 1) Find overlapping pairs from the gyro pose
            const pairs = [];
            for (let i = 0; i < photoData.length; i++) {
                for (let j = i+1; j < photoData.length; j++) {
                    const a = photoData[i].info, b = photoData[j].info;
                    let dY = Math.abs(a.yaw - b.yaw); if (dY > 180) dY = 360 - dY;
                    const dP = Math.abs(a.pitch - b.pitch);
                    const cosP = Math.max(0.25, Math.cos((a.pitch+b.pitch)/2*Math.PI/180));
                    if (dY * cosP < CAM_HFOV_DEG * 0.95 && dP < CAM_VFOV_DEG * 1.05) {
                        pairs.push([i, j]);
                    }
                }
            }

            // 2) Per-pair: coarse→fine search of the residual (dyaw,dpitch)
            const meas = []; // {i,j,dy,dp,w}
            for (let p = 0; p < pairs.length; p++) {
                status.textContent = 'Recalage ' + (p+1) + '/' + pairs.length + '...';
                const [i, j] = pairs[p];
                let best = { s: -2, dy: 0, dp: 0 };
                // Track the best score that is FAR (>=2°) from the winner.
                // On repetitive textures (stripes, tiles) the NCC has several
                // near-equal peaks → ambiguous → we must NOT trust it.
                let secondFar = -2;
                for (let dy = -4; dy <= 4; dy += 1)
                    for (let dp = -4; dp <= 4; dp += 1) {
                        const r = pairNCC(i, j, dy, dp);
                        if (r.score > best.s) best = { s: r.score, dy: dy, dp: dp };
                    }
                for (let dy = -4; dy <= 4; dy += 1)
                    for (let dp = -4; dp <= 4; dp += 1) {
                        if (Math.abs(dy - best.dy) < 2 && Math.abs(dp - best.dp) < 2) continue;
                        const r = pairNCC(i, j, dy, dp);
                        if (r.score > secondFar) secondFar = r.score;
                    }
                if (best.s > -1) {
                    const cy0 = best.dy, cp0 = best.dp;
                    for (let dy = cy0-0.75; dy <= cy0+0.75; dy += 0.25)
                        for (let dp = cp0-0.75; dp <= cp0+0.75; dp += 0.25) {
                            const r = pairNCC(i, j, dy, dp);
                            if (r.score > best.s) best = { s: r.score, dy: dy, dp: dp };
                        }
                }
                // Trust the pair only if: well correlated, plausible shift,
                // AND the peak clearly dominates other far candidates
                // (rejects repetitive-pattern false matches).
                const dominant = best.s - secondFar > 0.12;
                if (best.s > 0.45 && dominant &&
                    Math.abs(best.dy) <= 5 && Math.abs(best.dp) <= 5) {
                    // weight de-rated by ambiguity → safer global solve
                    const wq = best.s * Math.min(1, (best.s - secondFar) / 0.3);
                    meas.push({ i: i, j: j, dy: best.dy, dp: best.dp, w: wq });
                }
            }

            // 3) Global relaxation: solve per-photo corrections so that
            //    (cj - ci) ≈ measured delta, weighted by correlation.
            const corrYaw = new Float64Array(photoData.length);
            const corrPit = new Float64Array(photoData.length);
            for (let it = 0; it < 80; it++) {
                const numY = new Float64Array(photoData.length);
                const numP = new Float64Array(photoData.length);
                const den = new Float64Array(photoData.length);
                for (const m of meas) {
                    // i wants: ci ≈ cj - delta ; j wants: cj ≈ ci + delta
                    numY[m.i] += (corrYaw[m.j] - m.dy) * m.w;
                    numP[m.i] += (corrPit[m.j] - m.dp) * m.w;
                    den[m.i]  += m.w;
                    numY[m.j] += (corrYaw[m.i] + m.dy) * m.w;
                    numP[m.j] += (corrPit[m.i] + m.dp) * m.w;
                    den[m.j]  += m.w;
                }
                for (let k = 0; k < photoData.length; k++) {
                    if (den[k] > 0) {
                        corrYaw[k] = numY[k] / den[k];
                        corrPit[k] = numP[k] / den[k];
                    }
                }
            }
            // Pin the gauge: keep the panorama globally where the gyro put it
            // (don't let the whole sphere drift). Remove mean correction.
            let mY = 0, mP = 0;
            for (let k = 0; k < photoData.length; k++) { mY += corrYaw[k]; mP += corrPit[k]; }
            mY /= photoData.length; mP /= photoData.length;
            for (let k = 0; k < photoData.length; k++) {
                let cy = corrYaw[k] - mY, cp = corrPit[k] - mP;
                // safety clamp so a bad pair can never wreck the pano
                cy = Math.max(-8, Math.min(8, cy));
                cp = Math.max(-8, Math.min(8, cp));
                photoData[k].info = {
                    ...photoData[k].info,
                    yaw: photoData[k].info.yaw + cy,
                    pitch: photoData[k].info.pitch + cp,
                };
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
                            // BUG FIX: was && — a pixel was only skipped when it
                            // was far in BOTH yaw AND pitch, so nearly every one
                            // of the photos was projected for every output pixel
                            // (the main cause of minutes-long stitches). With ||
                            // we skip as soon as it's out of range on EITHER axis.
                            if (Math.abs(dYaw) > CAM_HFOV_DEG * COVERAGE_BOOST || Math.abs(dPitch) > CAM_VFOV_DEG * COVERAGE_BOOST) continue;

                            // Project world direction into this camera
                            // (roll-aware: undoes the phone tilt at capture).
                            const uv = proj(dir.yaw, dir.pitch, cam.yaw, cam.pitch, cam.roll || 0);
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

                // Step 5: GENTLE gap fill. Small radius / few passes only.
                // Big holes (polar caps with no photo) are intentionally left
                // for the soft neutral gradient below — a clean grey cap looks
                // far better than long radial smears of stretched pixels.
                status.textContent = 'Correction des trous (' + uncoveredCount + ' pixels)...';

                for (let pass = 0; pass < 6; pass++) {
                    let filled = 0;
                    for (let y = 0; y < EQ_H; y++) {
                        for (let x = 0; x < EQ_W; x++) {
                            const idx = (y * EQ_W + x) * 4;
                            if (od[idx + 3] > 0) continue;

                            let sumR = 0, sumG = 0, sumB = 0, count = 0;
                            const r = pass < 3 ? 2 : 3;

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
