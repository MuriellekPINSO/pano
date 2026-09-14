"""
Pipeline de projection sphérique par orientation connue.
============================================================================

Contrairement aux pipelines `auto` (cv2.Stitcher) et `manual` (homographies
chaînées) de stitching_pipeline.py, celui-ci n'essaie PAS de redécouvrir la
géométrie de la scène par appariement de points.

L'app de capture connaît déjà l'orientation de chaque photo : elle guide
l'utilisateur vers une grille (row, col) et encode cette position dans le nom
du fichier (`pos_<id>_r<row>_c<col>_k<roll>.jpg`). On reconstruit donc
(yaw, pitch) directement et on projette chaque image à sa place sur la sphère.

Le suffixe `_k<roll>` porte l'inclinaison du téléphone autour de l'axe optique
au moment du déclenchement, en degrés signés (ex. `_k-12.4`). Sans lui la
projection suppose roll = 0 : mesuré sur jeu de référence, un roll de ±5° —
soit MOINS que la tolérance de capture (ROLL_TOLERANCE = 6° dans capture.tsx) —
fait passer l'erreur de 2,7 à 16,3 /255, sous forme de fantômes et de raccords
en zigzag. Les noms sans `_k` restent acceptés et valent roll = 0.

Pourquoi c'est nécessaire :
  - les homographies chaînées dérivent (l'erreur de chaque paire se cumule) ;
  - une homographie ne décrit correctement qu'une scène plane — enchaîner des
    homographies autour d'une sphère complète ne peut pas boucler ;
  - sur des textures répétitives (carrelage, moquette, briques), RANSAC ne
    retient que 3 à 20 % d'inliers et la transformation dégénère.

Ici : aucune estimation, aucune dérive, insensible aux textures répétitives.

Les constantes de grille sont volontairement DUPLIQUÉES depuis
constants/CaptureConfig.ts. Si elles changent côté app, elles doivent changer
ici aussi — cf. GRID_SOURCE ci-dessous.
"""

from __future__ import annotations

import glob
import logging
import math
import os
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np

log = logging.getLogger(__name__)

# Fichier de référence côté app — toute divergence casse l'alignement.
GRID_SOURCE = "constants/CaptureConfig.ts"

# ── Grille de capture (miroir de CaptureConfig.ts) ──────────────────────────
CAMERA_HFOV = 65.0
CAMERA_VFOV = 50.0
RING_OVERLAP = 0.35
ROW_PITCHES = [0.0, 55.0, -55.0, 80.0]

_FILENAME_RE = re.compile(r"_r(\d+)_c(\d+)", re.IGNORECASE)
_ROLL_RE = re.compile(r"_k(-?\d+(?:\.\d+)?)", re.IGNORECASE)


def cols_for_ring(hfov_deg: float, pitch_deg: float, overlap: float) -> int:
    """Miroir exact de colsForRing() dans utils/Geometry.ts."""
    effective_step = hfov_deg * (1.0 - overlap)
    cos_p = max(0.18, math.cos(math.radians(pitch_deg)))
    return max(1, math.ceil((360.0 / effective_step) * cos_p))


def build_cols_per_row() -> List[int]:
    """Miroir de COLS_PER_ROW : la dernière rangée (zénith) n'a qu'une photo."""
    last = len(ROW_PITCHES) - 1
    return [
        1 if i == last else cols_for_ring(CAMERA_HFOV, p, RING_OVERLAP)
        for i, p in enumerate(ROW_PITCHES)
    ]


def orientation_for(row: int, col: int, cols_per_row: List[int]) -> Tuple[float, float]:
    """
    Reconstruit (yaw, pitch) en degrés pour une case de la grille.

    Miroir de generateCapturePositions() : les rangées impaires sont décalées
    d'un demi-pas en yaw (maillage en nid d'abeille).
    """
    col_count = cols_per_row[row]
    yaw_step = 360.0 / col_count
    yaw_offset = yaw_step / 2.0 if row % 2 != 0 else 0.0
    yaw = (col * yaw_step + yaw_offset) % 360.0
    return yaw, ROW_PITCHES[row]


@dataclass
class OrientedFrame:
    """Une photo avec son orientation reconstruite."""

    name: str
    image: np.ndarray
    yaw: float
    pitch: float
    hfov: float
    vfov: float
    roll: float = 0.0


def parse_row_col(filename: str) -> Optional[Tuple[int, int]]:
    """Extrait (row, col) de `pos_<id>_r<row>_c<col>_k<roll>.jpg`."""
    m = _FILENAME_RE.search(os.path.basename(filename))
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def parse_roll(filename: str) -> float:
    """
    Extrait le roll (degrés signés) du suffixe `_k<roll>`.

    Renvoie 0.0 si le suffixe est absent — les captures faites avant que l'app
    ne transmette le roll restent donc assemblables, simplement sans correction.
    """
    m = _ROLL_RE.search(os.path.basename(filename))
    if not m:
        return 0.0
    try:
        return float(m.group(1))
    except ValueError:
        return 0.0


def load_oriented_frames(input_dir: str, resize_max_dim: int = 1600) -> List[OrientedFrame]:
    """
    Charge les images dont le nom porte une position de grille exploitable.

    Renvoie une liste vide si aucune image n'est orientable — l'appelant doit
    alors se rabattre sur les pipelines par appariement.
    """
    exts = ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG")
    paths = sorted(sum([glob.glob(os.path.join(input_dir, e)) for e in exts], []))
    cols_per_row = build_cols_per_row()

    frames: List[OrientedFrame] = []
    for path in paths:
        rc = parse_row_col(path)
        if rc is None:
            log.warning("Orientation absente du nom %s — image ignorée", os.path.basename(path))
            continue

        row, col = rc
        if not (0 <= row < len(cols_per_row)):
            log.warning("Rangée %d hors grille (%s) — ignorée", row, os.path.basename(path))
            continue
        if not (0 <= col < cols_per_row[row]):
            log.warning(
                "Colonne %d hors de la rangée %d (max %d) — %s ignorée",
                col, row, cols_per_row[row] - 1, os.path.basename(path),
            )
            continue

        img = cv2.imread(path)
        if img is None:
            log.warning("Illisible : %s — ignorée", os.path.basename(path))
            continue

        h, w = img.shape[:2]
        if max(h, w) > resize_max_dim:
            scale = resize_max_dim / float(max(h, w))
            img = cv2.resize(img, (int(round(w * scale)), int(round(h * scale))),
                             interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]

        # Les FOV de la config sont donnés en paysage (65 × 50). Une photo
        # portrait a donc les deux axes permutés.
        if w >= h:
            hfov, vfov = CAMERA_HFOV, CAMERA_VFOV
        else:
            hfov, vfov = CAMERA_VFOV, CAMERA_HFOV

        yaw, pitch = orientation_for(row, col, cols_per_row)
        roll = parse_roll(path)
        frames.append(
            OrientedFrame(os.path.basename(path), img, yaw, pitch, hfov, vfov, roll)
        )

    if frames:
        with_roll = [f for f in frames if f.roll]
        log.info(
            "Étape 1 — %d image(s) orientée(s) sur la grille %s (source : %s)",
            len(frames), build_cols_per_row(), GRID_SOURCE,
        )
        if with_roll:
            rolls = [abs(f.roll) for f in with_roll]
            log.info(
                "Étape 1b — Roll transmis pour %d/%d image(s) (|roll| moyen %.1f°, max %.1f°)",
                len(with_roll), len(frames), sum(rolls) / len(rolls), max(rolls),
            )
        else:
            log.warning(
                "Étape 1b — Aucun roll dans les noms de fichiers (suffixe _k absent) : "
                "projection à roll = 0, raccords en zigzag probables si le "
                "téléphone n'était pas parfaitement d'aplomb"
            )
    return frames


def _feather_weight(u: np.ndarray, v: np.ndarray, frac: float = 0.18) -> np.ndarray:
    """
    Poids de fusion décroissant vers les bords du cadre.

    Sans ce dégradé, les recouvrements produisent des arêtes franches là où
    une photo s'arrête net.
    """
    du = np.minimum(u, 1.0 - u) / frac
    dv = np.minimum(v, 1.0 - v) / frac
    w = np.clip(du, 0.0, 1.0) * np.clip(dv, 0.0, 1.0)
    # Lissage cubique : évite une cassure de pente au raccord du dégradé.
    return w * w * (3.0 - 2.0 * w)


def project_equirectangular(
    frames: List[OrientedFrame],
    out_w: int,
    out_h: int,
    band_rows: int = 256,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Projette les images orientées sur un canevas équirectangulaire.

    Reproduit la convention de worldToCamera() (utils/Geometry.ts) :
      direction  d = (cos(p)sin(y), sin(p), cos(p)cos(y))
      droite     r = (cos(cy), 0, -sin(cy))
      haut       u = forward × right

    Traité par bandes horizontales pour borner l'empreinte mémoire.
    Renvoie (panorama BGR uint8, carte de poids cumulés).
    """
    acc = np.zeros((out_h, out_w, 3), np.float32)
    wsum = np.zeros((out_h, out_w), np.float32)

    # Longitude constante par colonne : calculée une seule fois.
    lon = (np.arange(out_w, dtype=np.float32) + 0.5) / out_w * 2.0 * np.pi - np.pi

    for y0 in range(0, out_h, band_rows):
        y1 = min(y0 + band_rows, out_h)
        lat = np.pi / 2.0 - (np.arange(y0, y1, dtype=np.float32) + 0.5) / out_h * np.pi

        cos_lat = np.cos(lat)[:, None]
        sin_lat = np.sin(lat)[:, None]
        dx = cos_lat * np.sin(lon)[None, :]
        dy = np.broadcast_to(sin_lat, (y1 - y0, out_w))
        dz = cos_lat * np.cos(lon)[None, :]

        for f in frames:
            cy, cp = math.radians(f.yaw), math.radians(f.pitch)
            cx3, cy3, cz3 = math.cos(cp) * math.sin(cy), math.sin(cp), math.cos(cp) * math.cos(cy)
            rx, ry, rz = math.cos(cy), 0.0, -math.sin(cy)
            ux = cy3 * rz - cz3 * ry
            uy = cz3 * rx - cx3 * rz
            uz = cx3 * ry - cy3 * rx

            fwd = dx * cx3 + dy * cy3 + dz * cz3
            in_front = fwd > 0.01
            if not in_front.any():
                continue

            safe_fwd = np.where(in_front, fwd, 1.0)
            right = dx * rx + dy * ry + dz * rz
            up = dx * ux + dy * uy + dz * uz

            tan_h = math.tan(math.radians(f.hfov) / 2.0)
            tan_v = math.tan(math.radians(f.vfov) / 2.0)
            u = 0.5 + right / safe_fwd / (2.0 * tan_h)
            v = 0.5 - up / safe_fwd / (2.0 * tan_v)

            if f.roll:
                # Transcription littérale de proj() dans utils/StitchEngine.ts :
                # on projette avec la base roll = 0, puis on défait la rotation
                # du capteur EN ESPACE TANGENT (angles physiques). Tourner
                # directement dans le repère uv normalisé cisaillerait l'image,
                # puisque hfov != vfov.
                # Le signe (-roll) et l'ordre des termes sont repris tels quels
                # de l'ancien moteur : la convention de attitudeToOrientation()
                # est ainsi partagée par les deux chemins d'assemblage.
                a = math.radians(-f.roll)
                ca, sa = math.cos(a), math.sin(a)
                x = (u - 0.5) * tan_h
                y = (v - 0.5) * tan_v
                u = 0.5 + (x * ca - y * sa) / tan_h
                v = 0.5 + (x * sa + y * ca) / tan_v

            # Le masque est calculé APRÈS la rotation : le roll change quels
            # rayons retombent dans le cadre.
            mask = in_front & (u >= 0.0) & (u <= 1.0) & (v >= 0.0) & (v <= 1.0)
            if not mask.any():
                continue

            ih, iw = f.image.shape[:2]
            map_x = (u * (iw - 1)).astype(np.float32)
            map_y = (v * (ih - 1)).astype(np.float32)
            sampled = cv2.remap(
                f.image, map_x, map_y,
                interpolation=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REPLICATE,
            ).astype(np.float32)

            w = _feather_weight(np.clip(u, 0.0, 1.0), np.clip(v, 0.0, 1.0))
            w = np.where(mask, w, 0.0).astype(np.float32)

            acc[y0:y1] += sampled * w[:, :, None]
            wsum[y0:y1] += w

    covered = wsum > 1e-6
    out = np.zeros_like(acc)
    out[covered] = acc[covered] / wsum[covered][:, None]
    return np.clip(out, 0, 255).astype(np.uint8), wsum


def fill_gaps(panorama: np.ndarray, wsum: np.ndarray) -> np.ndarray:
    """
    Comble les zones non couvertes (typiquement le nadir, sous le trépied)
    par inpainting, pour éviter des trous noirs francs dans le viewer.
    """
    holes = (wsum <= 1e-6).astype(np.uint8)
    if holes.sum() == 0:
        return panorama

    frac = holes.mean()
    log.info("Étape 4 — Comblement de %.1f%% de surface non couverte", 100 * frac)
    if frac > 0.5:
        # Trop de vide : l'inpainting inventerait plus qu'il ne reconstruit.
        log.warning(
            "Plus de la moitié de la sphère n'est pas couverte — "
            "comblement limité, la capture est probablement incomplète"
        )
    return cv2.inpaint(panorama, holes, 5, cv2.INPAINT_TELEA)


def measure_real_coverage(panorama: np.ndarray, threshold: float = 12.0) -> float:
    """
    Part de l'image portant un VRAI détail photographique.

    Compter les pixels non-noirs ne suffit pas : une zone étirée par une
    homographie divergente est non-noire mais ne contient aucune information.
    On mesure donc le gradient local.
    """
    gray = cv2.cvtColor(panorama, cv2.COLOR_BGR2GRAY).astype(np.float32)
    detail = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)) + \
             np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))
    return float((detail > threshold).mean())


def run_oriented_pipeline(input_dir: str, output_path: str, cfg) -> bool:
    """
    Assemble un équirectangulaire à partir des orientations connues.

    Renvoie False si les noms de fichiers ne portent pas de position de grille
    exploitable — l'appelant doit alors basculer sur un pipeline par
    appariement de points.
    """
    frames = load_oriented_frames(input_dir, cfg.resize_max_dim)
    if len(frames) < 2:
        log.warning(
            "Pipeline ORIENTED — %d image(s) orientable(s) : insuffisant, "
            "les noms de fichiers doivent contenir _r<row>_c<col>", len(frames)
        )
        return False

    log.info(
        "Étape 2 — Projection sphérique directe de %d image(s) (aucune homographie)",
        len(frames),
    )
    panorama, wsum = project_equirectangular(frames, cfg.output_width, cfg.output_height)

    log.info("Étape 3 — Reprojection équirectangulaire : %dx%d (ratio 2:1)",
             cfg.output_width, cfg.output_height)
    panorama = fill_gaps(panorama, wsum)

    real = measure_real_coverage(panorama)
    log.info("QC — Détail photographique réel : %.1f%% de la surface", 100 * real)

    ok = cv2.imwrite(output_path, panorama, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if ok:
        size_kb = os.path.getsize(output_path) // 1024
        log.info("Étape 5 — Panorama exporté : %s (%d Ko)", output_path, size_kb)
    return bool(ok)
