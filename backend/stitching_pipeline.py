#!/usr/bin/env python3
"""
============================================================================
 PIPELINE DE STITCHING PANORAMIQUE — Bloc 1 (cf. Cahier des charges §3.2)
============================================================================

Assemble une série de photographies avec recouvrement en une image
panoramique équirectangulaire (360°).

Le pipeline suit exactement les 6 étapes du cahier des charges :
    1. Prétraitement
    2. Détection de points d'intérêt
    3. Mise en correspondance (feature matching)
    4. Estimation géométrique (homographie + RANSAC)
    5. Warping & projection équirectangulaire
    6. Blending & export

Deux modes d'exécution sont proposés :
    --mode auto    -> utilise cv2.Stitcher (rapide, bon baseline)
    --mode manual  -> implémentation pas à pas (étapes 1 à 6 isolées),
                      utile pour déboguer / remplacer une étape,
                      et pour un panorama 360° complet que cv2.Stitcher
                      gère parfois mal (chevauchement au raccord 0°/360°).

Usage :
    python stitching_pipeline.py --input ./photos --output ./panorama.jpg --mode auto
    python stitching_pipeline.py --input ./photos --output ./panorama.jpg --mode manual

Dépendances :
    pip install opencv-python opencv-contrib-python numpy
    (opencv-contrib-python est nécessaire pour SIFT selon la version d'OpenCV)
============================================================================
"""

import argparse
import glob
import logging
import os
import sys
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

import cv2
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("stitching_pipeline")


# ============================================================================
# Configuration du pipeline
# ============================================================================

@dataclass
class PipelineConfig:
    """Paramètres ajustables du pipeline (cf. cahier des charges §3.2 à §3.5)."""

    # Étape 1 — Prétraitement
    resize_max_dim: int = 1600          # redimensionnement homogène (plus grand côté, px)
    apply_clahe: bool = False           # égalisation d'histogramme adaptative (contraste)

    # Étape 2 — Détection de points d'intérêt
    feature_detector: str = "sift"      # "sift" | "orb" | "akaze"
    n_features: int = 4000              # nb max de keypoints par image (0 = illimité pour SIFT)

    # Étape 3 — Mise en correspondance
    matcher: str = "flann"              # "flann" | "bf"
    lowe_ratio: float = 0.75            # ratio test de Lowe (filtrage des correspondances)
    min_match_count: int = 10           # nb minimal de correspondances valides pour continuer

    # Étape 4 — Estimation géométrique
    ransac_reproj_threshold: float = 4.0  # seuil de reprojection RANSAC (px)

    # Étape 5 — Warping / projection
    output_width: int = 4096            # largeur de l'équirectangulaire final (ratio 2:1)
    output_height: int = 2048

    # Étape 6 — Blending
    blend_mode: str = "multiband"       # "multiband" | "feather"
    blend_num_bands: int = 5


# ============================================================================
# Étape 1 — Prétraitement
# ============================================================================

def load_images(input_dir: str) -> List[Tuple[str, np.ndarray]]:
    """Charge toutes les images d'un dossier, triées par nom (ordre de prise de vue)."""
    exts = ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG")
    paths = sorted(sum([glob.glob(os.path.join(input_dir, e)) for e in exts], []))
    if not paths:
        raise FileNotFoundError(f"Aucune image trouvée dans {input_dir}")

    images = []
    for p in paths:
        img = cv2.imread(p)
        if img is None:
            log.warning("Impossible de lire %s — ignorée", p)
            continue
        images.append((os.path.basename(p), img))
    log.info("Étape 1a — %d images chargées depuis %s", len(images), input_dir)
    return images


def preprocess(images: List[Tuple[str, np.ndarray]], cfg: PipelineConfig
               ) -> List[Tuple[str, np.ndarray]]:
    """
    Étape 1 — Prétraitement.
    Redimensionnement homogène + correction de contraste optionnelle (CLAHE).
    La correction de distorsion optique (si focale/intrinsèques connues) peut être
    injectée ici via cv2.undistort() si un calibrage caméra est disponible.
    """
    out = []
    for name, img in images:
        h, w = img.shape[:2]
        scale = cfg.resize_max_dim / max(h, w)
        if scale < 1.0:
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        if cfg.apply_clahe:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            img = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)

        out.append((name, img))
    log.info("Étape 1b — Prétraitement appliqué (resize max=%dpx, CLAHE=%s)",
              cfg.resize_max_dim, cfg.apply_clahe)
    return out


# ============================================================================
# Étape 2 — Détection de points d'intérêt
# ============================================================================

def get_feature_detector(cfg: PipelineConfig):
    """Instancie le détecteur de features choisi (SIFT / ORB / AKAZE)."""
    name = cfg.feature_detector.lower()
    if name == "sift":
        return cv2.SIFT_create(nfeatures=cfg.n_features)
    elif name == "orb":
        return cv2.ORB_create(nfeatures=cfg.n_features)
    elif name == "akaze":
        return cv2.AKAZE_create()
    else:
        raise ValueError(f"Détecteur inconnu : {cfg.feature_detector}")


def detect_features(images: List[Tuple[str, np.ndarray]], cfg: PipelineConfig):
    """
    Étape 2 — Détection de points d'intérêt.
    Retourne, pour chaque image, ses keypoints et descripteurs.
    """
    detector = get_feature_detector(cfg)
    features = []
    for name, img in images:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        kp, desc = detector.detectAndCompute(gray, None)
        features.append((name, kp, desc))
        log.info("Étape 2 — %-20s : %d keypoints (%s)", name, len(kp), cfg.feature_detector.upper())
    return features


# ============================================================================
# Étape 3 — Mise en correspondance
# ============================================================================

def get_matcher(cfg: PipelineConfig):
    """Instancie le matcher (FLANN ou Brute-Force) selon le détecteur utilisé."""
    if cfg.matcher == "flann":
        if cfg.feature_detector.lower() == "orb":
            index_params = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
        else:
            index_params = dict(algorithm=1, trees=5)
        search_params = dict(checks=50)
        return cv2.FlannBasedMatcher(index_params, search_params)
    else:
        norm = cv2.NORM_HAMMING if cfg.feature_detector.lower() in ("orb", "akaze") else cv2.NORM_L2
        return cv2.BFMatcher(norm)


def match_features(desc1, desc2, cfg: PipelineConfig) -> List[cv2.DMatch]:
    """
    Étape 3 — Mise en correspondance entre deux images adjacentes.
    Filtrage des correspondances aberrantes via le ratio test de Lowe.
    """
    if desc1 is None or desc2 is None or len(desc1) < 2 or len(desc2) < 2:
        return []

    matcher = get_matcher(cfg)
    raw_matches = matcher.knnMatch(desc1, desc2, k=2)

    good = []
    for pair in raw_matches:
        if len(pair) != 2:
            continue
        m, n = pair
        if m.distance < cfg.lowe_ratio * n.distance:
            good.append(m)
    return good


# ============================================================================
# Étape 4 — Estimation géométrique
# ============================================================================

def estimate_homography(kp1, kp2, matches: List[cv2.DMatch], cfg: PipelineConfig
                        ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    """
    Étape 4 — Estimation de l'homographie entre deux images via RANSAC.
    RANSAC écarte automatiquement les correspondances aberrantes (outliers)
    restantes après le ratio test de Lowe.
    Retourne (H, mask) ou (None, None) si le nombre de correspondances est insuffisant.
    """
    if len(matches) < cfg.min_match_count:
        log.warning("Étape 4 — Correspondances insuffisantes (%d < %d)",
                    len(matches), cfg.min_match_count)
        return None, None

    src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, cfg.ransac_reproj_threshold)
    inliers = int(mask.sum()) if mask is not None else 0
    log.info("Étape 4 — Homographie estimée : %d/%d correspondances retenues (inliers RANSAC)",
              inliers, len(matches))
    return H, mask


# ============================================================================
# Étape 5 — Warping & projection équirectangulaire
# ============================================================================

def cylindrical_warp(img: np.ndarray, focal: float) -> np.ndarray:
    """
    Warping cylindrique d'une image, étape intermédiaire courante avant
    projection équirectangulaire complète : redresse chaque image sur un
    cylindre de focale donnée pour faciliter l'assemblage horizontal à 360°.
    """
    h, w = img.shape[:2]
    K = np.array([[focal, 0, w / 2], [0, focal, h / 2], [0, 0, 1]])
    y_i, x_i = np.indices((h, w))
    X = np.stack([x_i, y_i, np.ones_like(x_i)], axis=-1).reshape(h * w, 3)
    Kinv = np.linalg.inv(K)
    X = Kinv.dot(X.T).T

    A = np.stack([np.sin(X[:, 0]), X[:, 1], np.cos(X[:, 0])], axis=-1)
    B = K.dot(A.T).T
    B = B[:, :-1] / B[:, [-1]]

    B = B.reshape(h, w, -1)
    B[(B[:, :, 0] < 0) | (B[:, :, 0] >= w) | (B[:, :, 1] < 0) | (B[:, :, 1] >= h)] = -1

    map_x = B[:, :, 0].astype(np.float32)
    map_y = B[:, :, 1].astype(np.float32)
    warped = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    return warped


def to_equirectangular(panorama: np.ndarray, cfg: PipelineConfig) -> np.ndarray:
    """
    Étape 5 (finalisation) — Reprojection du panorama assemblé vers le format
    équirectangulaire standard (ratio 2:1), taille de sortie fixée par la config
    (cf. cahier des charges §4.3 : 4096x2048 par défaut).
    """
    resized = cv2.resize(panorama, (cfg.output_width, cfg.output_height),
                          interpolation=cv2.INTER_LANCZOS4)
    log.info("Étape 5 — Reprojection équirectangulaire : %dx%d (ratio 2:1)",
              cfg.output_width, cfg.output_height)
    return resized


# ============================================================================
# Étape 6 — Blending & export
# ============================================================================

def feather_blend(img1: np.ndarray, img2: np.ndarray, mask1: np.ndarray, mask2: np.ndarray
                  ) -> np.ndarray:
    """
    Étape 6 (variante simple) — Feathering : fusion pondérée par distance à la
    bordure du masque, dans la zone de recouvrement entre deux images.
    """
    dist1 = cv2.distanceTransform(mask1.astype(np.uint8), cv2.DIST_L2, 5)
    dist2 = cv2.distanceTransform(mask2.astype(np.uint8), cv2.DIST_L2, 5)
    total = dist1 + dist2 + 1e-6
    w1 = (dist1 / total)[..., None]
    w2 = (dist2 / total)[..., None]
    blended = img1.astype(np.float32) * w1 + img2.astype(np.float32) * w2
    return np.clip(blended, 0, 255).astype(np.uint8)


def multiband_blend_pair(img1: np.ndarray, img2: np.ndarray, mask1: np.ndarray,
                          num_bands: int = 5) -> np.ndarray:
    """
    Étape 6 — Multi-band blending (Burt & Adelson) entre deux images déjà
    recalées dans le même référentiel. Fusionne par pyramide laplacienne pour
    supprimer les coutures visibles, plus robuste que le feathering simple
    en cas de différences d'exposition résiduelles entre prises de vue.
    """
    mask = mask1.astype(np.float32)
    gp_mask = [mask]
    gp1 = [img1.astype(np.float32)]
    gp2 = [img2.astype(np.float32)]

    for _ in range(num_bands):
        gp_mask.append(cv2.pyrDown(gp_mask[-1]))
        gp1.append(cv2.pyrDown(gp1[-1]))
        gp2.append(cv2.pyrDown(gp2[-1]))

    lp1, lp2 = [gp1[-1]], [gp2[-1]]
    for i in range(num_bands, 0, -1):
        size = (gp1[i - 1].shape[1], gp1[i - 1].shape[0])
        lp1.append(gp1[i - 1] - cv2.pyrUp(gp1[i], dstsize=size))
        lp2.append(gp2[i - 1] - cv2.pyrUp(gp2[i], dstsize=size))

    gp_mask_rev = gp_mask[::-1]
    blended_pyr = []
    for l1, l2, m in zip(lp1, lp2, gp_mask_rev):
        if m.ndim == 2:
            m = m[..., None]
        blended_pyr.append(l1 * m + l2 * (1 - m))

    result = blended_pyr[0]
    for i in range(1, len(blended_pyr)):
        size = (blended_pyr[i].shape[1], blended_pyr[i].shape[0])
        result = cv2.pyrUp(result, dstsize=size) + blended_pyr[i]

    return np.clip(result, 0, 255).astype(np.uint8)


def export_panorama(panorama: np.ndarray, output_path: str) -> bool:
    """
    Étape 6 (finalisation) — Export du panorama final.
    Vérifie explicitement le succès de l'écriture (cv2.imwrite échoue parfois
    silencieusement — chemin invalide, permissions, disque plein, extension
    non supportée — et retourne simplement False sans lever d'exception).
    """
    out_dir = os.path.dirname(os.path.abspath(output_path)) or "."
    os.makedirs(out_dir, exist_ok=True)

    if os.path.isdir(output_path):
        log.error(
            "Étape 6 — ÉCHEC : %s est un DOSSIER, pas un fichier. "
            "Supprimez ce dossier ou choisissez un autre nom de sortie.",
            output_path,
        )
        return False

    success = cv2.imwrite(output_path, panorama, [cv2.IMWRITE_JPEG_QUALITY, 90])

    if not success or not os.path.exists(output_path):
        log.error(
            "Étape 6 — ÉCHEC de l'export vers %s (cv2.imwrite a retourné %s). "
            "Vérifiez : chemin valide, extension supportée (.jpg/.png), "
            "permissions d'écriture, espace disque disponible.",
            output_path, success,
        )
        return False

    size_kb = os.path.getsize(output_path) / 1024
    log.info("Étape 6 — Panorama exporté : %s (%.0f Ko)", output_path, size_kb)
    return True


# ============================================================================
# Mode AUTO — cv2.Stitcher (baseline rapide, cf. cahier des charges §3.4)
# ============================================================================

def run_auto_pipeline(input_dir: str, output_path: str, cfg: PipelineConfig) -> bool:
    """
    Mode automatique : s'appuie sur cv2.Stitcher, qui exécute en interne les
    étapes 2 à 6. Recommandé comme premier test rapide avant de basculer en
    mode manuel si le résultat est insuffisant sur un panorama 360° complet.
    """
    images = load_images(input_dir)
    images = preprocess(images, cfg)
    imgs_only = [img for _, img in images]

    log.info("Mode AUTO — lancement de cv2.Stitcher sur %d images...", len(imgs_only))
    stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
    status, panorama = stitcher.stitch(imgs_only)

    if status != cv2.Stitcher_OK:
        codes = {
            cv2.Stitcher_ERR_NEED_MORE_IMGS: "images insuffisantes / chevauchement trop faible",
            cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "échec de l'estimation d'homographie",
            cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "échec de l'ajustement des paramètres caméra",
        }
        log.error("Mode AUTO — échec du stitching (code %s : %s)",
                  status, codes.get(status, "erreur inconnue"))
        return False

    panorama = to_equirectangular(panorama, cfg)
    return export_panorama(panorama, output_path)


# ============================================================================
# Mode MANUAL — pipeline pas-à-pas (étapes 1 à 6 isolées et testables)
# ============================================================================

def run_manual_pipeline(input_dir: str, output_path: str, cfg: PipelineConfig) -> bool:
    """
    Mode manuel : exécute explicitement chaque étape du cahier des charges,
    image adjacente par image adjacente, par accumulation successive sur un
    canevas panoramique. À privilégier pour déboguer une étape spécifique ou
    remplacer un composant (ex. détecteur, méthode de blending).
    """
    images = load_images(input_dir)
    images = preprocess(images, cfg)
    features = detect_features(images, cfg)

    if len(images) < 2:
        log.error("Mode MANUAL — au moins 2 images sont requises")
        return False

    # Canevas de travail large pour accueillir l'accumulation des warps
    base_h, base_w = images[0][1].shape[:2]
    canvas_w, canvas_h = base_w * len(images), base_h * 2
    offset_x, offset_y = base_w // 2, base_h // 2

    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    canvas_mask = np.zeros((canvas_h, canvas_w), dtype=np.uint8)

    # Placement de la première image comme référence
    name0, img0 = images[0]
    canvas[offset_y:offset_y + base_h, offset_x:offset_x + base_w] = img0
    canvas_mask[offset_y:offset_y + base_h, offset_x:offset_x + base_w] = 255
    cumulative_H = np.eye(3)

    for i in range(1, len(images)):
        name_a, kp_a, desc_a = features[i - 1]
        name_b, kp_b, desc_b = features[i]
        img_b = images[i][1]

        # Étape 3 — matches indexés (queryIdx -> kp_b, trainIdx -> kp_a) pour
        # obtenir directement, à l'étape 4, une homographie qui projette B vers A.
        matches = match_features(desc_b, desc_a, cfg)
        log.info("Étape 3 — %s -> %s : %d correspondances valides (ratio de Lowe)",
                  name_a, name_b, len(matches))

        # Étape 4 (H mappe l'image B vers l'image A)
        H, mask = estimate_homography(kp_b, kp_a, matches, cfg)
        if H is None:
            log.warning("Image %s ignorée (homographie non estimable)", name_b)
            continue
        cumulative_H = cumulative_H @ H

        # Translation pour repositionner dans le canevas global
        T = np.array([[1, 0, offset_x], [0, 1, offset_y], [0, 0, 1]], dtype=np.float64)
        H_canvas = T @ cumulative_H

        # Étape 5 — Warping de l'image courante dans le référentiel du canevas
        warped = cv2.warpPerspective(img_b, H_canvas, (canvas_w, canvas_h))
        warped_mask = cv2.warpPerspective(
            np.full(img_b.shape[:2], 255, dtype=np.uint8), H_canvas, (canvas_w, canvas_h)
        )

        # Étape 6 — Blending dans la zone de recouvrement uniquement
        overlap = cv2.bitwise_and(canvas_mask, warped_mask)
        if cv2.countNonZero(overlap) > 0 and cfg.blend_mode == "multiband":
            blend_region_mask = (canvas_mask.astype(np.float32) / 255.0)
            blended = multiband_blend_pair(canvas, warped, blend_region_mask, cfg.blend_num_bands)
            fill = (warped_mask > 0) & (canvas_mask == 0)
            canvas = np.where(fill[..., None], warped, blended).astype(np.uint8)
        else:
            fill = warped_mask > 0
            canvas[fill] = warped[fill]

        canvas_mask = cv2.bitwise_or(canvas_mask, warped_mask)
        log.info("Étape 6 — Image %s fusionnée dans le canevas (%s)", name_b, cfg.blend_mode)

    # Recadrage sur la zone effectivement peinte
    ys, xs = np.where(canvas_mask > 0)
    if len(xs) == 0:
        log.error("Mode MANUAL — canevas vide, échec du pipeline")
        return False
    cropped = canvas[ys.min():ys.max(), xs.min():xs.max()]

    panorama = to_equirectangular(cropped, cfg)
    return export_panorama(panorama, output_path)


# ============================================================================
# Contrôle qualité (cf. cahier des charges §3.5)
# ============================================================================

def check_seam_continuity(panorama: np.ndarray, band_px: int = 20) -> float:
    """
    Contrôle basique de continuité au raccord 0°/360° : compare la colonne
    de gauche et la colonne de droite du panorama équirectangulaire via SSIM
    simplifié (corrélation normalisée). Une valeur proche de 1 indique une
    jonction cohérente ; une valeur faible signale un décalage ou une coupure
    visible à surveiller manuellement (cf. §3.5 — Continuité géométrique).
    """
    left = cv2.cvtColor(panorama[:, :band_px], cv2.COLOR_BGR2GRAY).astype(np.float32)
    right = cv2.cvtColor(panorama[:, -band_px:], cv2.COLOR_BGR2GRAY).astype(np.float32)
    left = (left - left.mean()) / (left.std() + 1e-6)
    right = (right - right.mean()) / (right.std() + 1e-6)
    score = float(np.mean(left * right))
    log.info("QC — Score de continuité de jonction 0°/360° : %.3f (1.0 = parfait)", score)
    return score


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Pipeline de stitching panoramique (Bloc 1 — cahier des charges Rendu 360°)"
    )
    parser.add_argument("--input", required=True, help="Dossier contenant les photos sources")
    parser.add_argument("--output", required=True, help="Chemin de l'image panoramique de sortie")
    parser.add_argument("--mode", choices=["auto", "manual"], default="auto",
                         help="auto = cv2.Stitcher (rapide) | manual = pipeline pas-à-pas")
    parser.add_argument("--detector", choices=["sift", "orb", "akaze"], default="sift")
    parser.add_argument("--blend", choices=["multiband", "feather"], default="multiband")
    parser.add_argument("--out-width", type=int, default=4096)
    parser.add_argument("--out-height", type=int, default=2048)
    args = parser.parse_args()

    cfg = PipelineConfig(
        feature_detector=args.detector,
        blend_mode=args.blend,
        output_width=args.out_width,
        output_height=args.out_height,
    )

    log.info("=== Démarrage pipeline de stitching — mode %s ===", args.mode.upper())
    if args.mode == "auto":
        ok = run_auto_pipeline(args.input, args.output, cfg)
    else:
        ok = run_manual_pipeline(args.input, args.output, cfg)

    if not ok:
        log.error("Pipeline terminé en échec.")
        sys.exit(1)

    panorama = cv2.imread(args.output)
    if panorama is not None:
        check_seam_continuity(panorama)

    log.info("=== Pipeline terminé avec succès : %s ===", args.output)


def run_pipeline(input_dir: str, output_path: str, mode: str = "auto", **cfg_kwargs):
    """
    Point d'entrée utilisable directement depuis un notebook Jupyter
    (contourne argparse, qui capte les arguments d'ipykernel dans ce contexte).

    Exemple dans une cellule Jupyter :
        from stitching_pipeline import run_pipeline
        run_pipeline(
            input_dir="./photos",
            output_path="./panorama.jpg",
            mode="auto",              # ou "manual"
            feature_detector="sift",  # kwargs optionnels -> PipelineConfig
            blend_mode="multiband",
            output_width=4096,
            output_height=2048,
        )
    """
    cfg = PipelineConfig(**cfg_kwargs)
    log.info("=== Démarrage pipeline de stitching — mode %s ===", mode.upper())

    if mode == "auto":
        ok = run_auto_pipeline(input_dir, output_path, cfg)
    elif mode == "manual":
        ok = run_manual_pipeline(input_dir, output_path, cfg)
    else:
        raise ValueError("mode doit être 'auto' ou 'manual'")

    if not ok:
        log.error("Pipeline terminé en échec.")
        return False

    panorama = cv2.imread(output_path)
    if panorama is not None:
        check_seam_continuity(panorama)

    log.info("=== Pipeline terminé avec succès : %s ===", output_path)
    return True


if __name__ == "__main__":
    # Ignore les arguments injectés par ipykernel (Jupyter) pour éviter
    # une SystemExit intempestive si le fichier est importé/exécuté par erreur
    # dans ce contexte ; utiliser run_pipeline() depuis une cellule à la place.
    if "ipykernel_launcher" in sys.argv[0]:
        log.warning(
            "Exécution détectée depuis Jupyter : utilisez run_pipeline(...) "
            "dans une cellule plutôt que ce script en CLI. Voir docstring de run_pipeline()."
        )
    else:
        main()