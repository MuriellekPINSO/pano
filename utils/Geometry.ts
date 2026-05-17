/**
 * Geometry.ts — SINGLE SOURCE OF TRUTH for all 3D ↔ 2D projection.
 * ─────────────────────────────────────────────────────────────────────────────
 * BEFORE this file existed, three different projections were used:
 *   - CaptureConfig.toScreen()        (flat, with cos(pitch) hack)
 *   - CaptureGuideOverlay.toScreen()  (flat, different scale, no hack)
 *   - StitchEngine.worldToCamera()    (correct spherical/gnomonic)
 * The guidance dot, the live camera frame, and the final stitch therefore
 * disagreed → photos taken at the wrong angle → ghosting & seams.
 *
 * Now EVERYTHING uses the spherical (gnomonic) projection below.
 * The exact same maths is also emitted as a JS string (PROJECTION_JS) and
 * injected into the stitching WebView, so capture-guidance and stitch are
 * guaranteed to use identical geometry.
 *
 * Convention (Y up, right-handed):
 *   world direction from (yaw°, pitch°):
 *     x = cos(pitch)·sin(yaw)
 *     y = sin(pitch)
 *     z = cos(pitch)·cos(yaw)
 *   yaw  = azimuth around the vertical axis (0 = forward, +→right)
 *   pitch = elevation (0 = horizon, +90 = straight up)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface UV {
  /** normalised image plane coords, 0..1, (0.5,0.5) = optical centre */
  u: number;
  v: number;
}

const DEG = Math.PI / 180;

/** Shortest signed angular delta a-b in degrees, wrapped to [-180,180]. */
export function normDelta(a: number, b: number): number {
  let d = a - b;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Gnomonic (perspective) projection of a world direction onto a camera
 * pointing at (camYaw, camPitch). Returns null if the point is behind the
 * camera. This is the canonical projection — DO NOT fork it.
 *
 * NOTE: kept byte-for-byte equivalent to the JS injected into the stitch
 * WebView (see PROJECTION_JS below). If you change one, change both.
 */
export function worldToCamera(
  dirYaw: number,
  dirPitch: number,
  camYaw: number,
  camPitch: number,
  hfovDeg: number,
  vfovDeg: number,
): UV | null {
  const dy = dirYaw * DEG;
  const dp = dirPitch * DEG;
  const cy = camYaw * DEG;
  const cp = camPitch * DEG;

  // Target direction vector (world space)
  const dx3 = Math.cos(dp) * Math.sin(dy);
  const dy3 = Math.sin(dp);
  const dz3 = Math.cos(dp) * Math.cos(dy);

  // Camera forward vector
  const cx3 = Math.cos(cp) * Math.sin(cy);
  const cy3 = Math.sin(cp);
  const cz3 = Math.cos(cp) * Math.cos(cy);

  // Camera right vector (horizontal, roll = 0)
  const rx = Math.cos(cy);
  const ry = 0;
  const rz = -Math.sin(cy);

  // Camera up vector = forward × right
  const ux = cy3 * rz - cz3 * ry;
  const uy = cz3 * rx - cx3 * rz;
  const uz = cx3 * ry - cy3 * rx;

  // Project onto camera axes
  const fwd = dx3 * cx3 + dy3 * cy3 + dz3 * cz3;
  if (fwd <= 0.01) return null; // behind camera

  const right = dx3 * rx + dy3 * ry + dz3 * rz;
  const up = dx3 * ux + dy3 * uy + dz3 * uz;

  const tanHalfH = Math.tan((hfovDeg * DEG) / 2);
  const tanHalfV = Math.tan((vfovDeg * DEG) / 2);

  const u = 0.5 + right / fwd / (2 * tanHalfH);
  const v = 0.5 - up / fwd / (2 * tanHalfV);

  return { u, v };
}

/**
 * Project a world direction onto the on-screen viewfinder rectangle.
 * The viewfinder rect IS the live camera image, so this maps a target
 * direction to the exact pixel where it will appear in the camera frame.
 * Returns null if the target is behind the camera.
 */
export function worldToViewfinder(
  dirYaw: number,
  dirPitch: number,
  camYaw: number,
  camPitch: number,
  hfovDeg: number,
  vfovDeg: number,
  vf: { left: number; top: number; width: number; height: number },
): { x: number; y: number; visible: boolean } | null {
  const uv = worldToCamera(dirYaw, dirPitch, camYaw, camPitch, hfovDeg, vfovDeg);
  if (!uv) return null;
  const x = vf.left + uv.u * vf.width;
  const y = vf.top + uv.v * vf.height;
  // visible only if it falls inside the camera frame (small margin)
  const m = 0.06;
  const visible =
    uv.u > -m && uv.u < 1 + m && uv.v > -m && uv.v < 1 + m;
  return { x, y, visible };
}

/**
 * Convert a raw device-motion attitude (W3C deviceorientation Euler angles,
 * in radians) into the camera optical-axis orientation (yaw, pitch, roll) in
 * degrees.
 *
 * WHY this matters: previously the code used `beta` directly as pitch. But
 * when you hold the phone upright to shoot the horizon, beta ≈ 90°, so the
 * "horizon" target (pitch 0) was physically unreachable. Deriving the actual
 * back-camera axis vector fixes this for any way the phone is held.
 *
 * The back camera looks along the device's -Z axis. We rotate (0,0,-1) by the
 * ZXY intrinsic rotation R = Rz(alpha)·Rx(beta)·Ry(gamma), then read the
 * azimuth/elevation/roll of that world vector.
 */
export function attitudeToOrientation(
  alpha: number,
  beta: number,
  gamma: number,
): { yaw: number; pitch: number; roll: number } {
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  const cb = Math.cos(beta), sb = Math.sin(beta);
  const cg = Math.cos(gamma), sg = Math.sin(gamma);

  // Back-camera axis = R · (0,0,-1) = -(third column of R), ZXY convention.
  // World frame from the sensor is X-east, Y-north, Z-UP — so the VERTICAL
  // (elevation) component is vz, NOT vy. Using vy was the bug that made a
  // phone held upright report pitch ≈ 90° instead of 0°.
  const vx = -(ca * sg + sa * sb * cg);
  const vy = -(sa * sg - ca * sb * cg);
  const vz = -(cb * cg);

  const pitch = Math.asin(Math.max(-1, Math.min(1, vz))) / DEG;
  let yaw = Math.atan2(vx, vy) / DEG;
  if (yaw < 0) yaw += 360;

  // Roll: how far the device's right axis (first column of R) tilts out of
  // the world-horizontal plane. ~0 when the phone is held level.
  const rightZ = -cb * sg;
  const roll = Math.asin(Math.max(-1, Math.min(1, rightZ))) / DEG;

  return { yaw, pitch, roll: isFinite(roll) ? roll : 0 };
}

/**
 * Decide how many photos a horizontal ring needs so that adjacent frames
 * overlap by `overlap` (fraction, e.g. 0.4 = 40%). Derived from the REAL
 * effective horizontal FOV at that pitch (rings near the poles need fewer
 * because the meridians converge by cos(pitch)).
 */
export function colsForRing(
  hfovDeg: number,
  pitchDeg: number,
  overlap: number,
): number {
  const effectiveStep = hfovDeg * (1 - overlap);
  const cosP = Math.max(0.18, Math.cos(pitchDeg * DEG));
  // angular distance covered per step shrinks with cos(pitch) on screen,
  // but the ring circumference also shrinks by cos(pitch) → they cancel,
  // so the count is driven by the horizon need, clamped to >=1.
  const cols = Math.ceil((360 / effectiveStep) * cosP);
  return Math.max(1, cols);
}

/**
 * The projection maths, emitted as a JS source string, for injection into
 * the stitching WebView. MUST stay equivalent to worldToCamera() above.
 */
export const PROJECTION_JS = `
function __deg2rad(d){return d*Math.PI/180;}
function worldToCamera(dirYaw, dirPitch, camYaw, camPitch, hfovDeg, vfovDeg) {
  var dy=__deg2rad(dirYaw), dp=__deg2rad(dirPitch);
  var cy=__deg2rad(camYaw), cp=__deg2rad(camPitch);
  var dx3=Math.cos(dp)*Math.sin(dy);
  var dy3=Math.sin(dp);
  var dz3=Math.cos(dp)*Math.cos(dy);
  var cx3=Math.cos(cp)*Math.sin(cy);
  var cy3=Math.sin(cp);
  var cz3=Math.cos(cp)*Math.cos(cy);
  var rx=Math.cos(cy), ry=0, rz=-Math.sin(cy);
  var ux=cy3*rz - cz3*ry;
  var uy=cz3*rx - cx3*rz;
  var uz=cx3*ry - cy3*rx;
  var fwd=dx3*cx3 + dy3*cy3 + dz3*cz3;
  if (fwd <= 0.01) return null;
  var right=dx3*rx + dy3*ry + dz3*rz;
  var up=dx3*ux + dy3*uy + dz3*uz;
  var tanHalfH=Math.tan(__deg2rad(hfovDeg)/2);
  var tanHalfV=Math.tan(__deg2rad(vfovDeg)/2);
  var u=0.5 + (right/fwd)/(2*tanHalfH);
  var v=0.5 - (up/fwd)/(2*tanHalfV);
  return { u: u, v: v };
}
`;
