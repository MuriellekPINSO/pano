#!/usr/bin/env python3
"""
============================================================================
 PRÉPARATION DES ASSETS 360° — Bloc 2 (cf. Cahier des charges §4.3)
============================================================================

Prend en entrée un panorama équirectangulaire (sortie du pipeline de
stitching, Bloc 1) et génère automatiquement les déclinaisons optimisées
pour le rendu WebGL/Three.js :

    - Plusieurs résolutions (haute qualité / standard / aperçu)
    - Compression JPEG et WebP
    - Validation du ratio 2:1 (format équirectangulaire standard)
    - Nommage normalisé (cf. §4.3 : panorama_<id>_equirect.<ext>)
    - Un manifeste JSON documentant chaque asset généré (dimensions,
      poids, chemin) — sert de base à la "note technique" du §4.5.

Usage :
    python asset_prep.py --input panorama_final.jpg --output-dir outputs/assets_360 --name taj_mahal

    # Depuis un notebook Jupyter :
    from asset_prep import prepare_assets
    prepare_assets("panorama_final.jpg", "outputs/assets_360", name="taj_mahal")

Dépendances :
    pip install Pillow
============================================================================
"""

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, asdict
from typing import List, Dict

from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("asset_prep")

# ============================================================================
# Profils de résolution (cf. cahier des charges §4.3)
# ============================================================================

@dataclass
class ResolutionProfile:
    label: str            # suffixe du nom de fichier
    width: int
    height: int
    jpeg_quality: int
    webp_quality: int
    purpose: str           # description courte (documentation)


DEFAULT_PROFILES: List[ResolutionProfile] = [
    ResolutionProfile("hq",       8192, 4096, 92, 88, "Haute qualité — zoom serré, présentation grand écran"),
    ResolutionProfile("standard", 4096, 2048, 88, 84, "Standard — usage courant dans le viewer Three.js"),
    ResolutionProfile("preview",  2048, 1024, 82, 78, "Aperçu léger — chargement rapide / vignette / mobile"),
]


# ============================================================================
# Validation
# ============================================================================

def validate_equirectangular(img: Image.Image, tolerance: float = 0.02) -> bool:
    """
    Vérifie que l'image respecte le ratio 2:1 attendu pour une projection
    équirectangulaire (cf. §4.2). Une tolérance de 2% absorbe les
    arrondis de redimensionnement.
    """
    ratio = img.width / img.height
    expected = 2.0
    ok = abs(ratio - expected) / expected <= tolerance
    if not ok:
        log.warning(
            "Ratio %.3f détecté (attendu ~2.0 pour un équirectangulaire). "
            "L'image sera tout de même traitée, mais vérifiez la source.",
            ratio,
        )
    return ok


# ============================================================================
# Génération des déclinaisons
# ============================================================================

def generate_asset(
    source: Image.Image,
    profile: ResolutionProfile,
    output_dir: str,
    name: str,
    formats: List[str],
) -> List[Dict]:
    """
    Redimensionne l'image source selon un profil de résolution donné et
    l'exporte dans chaque format demandé (jpg, webp).
    Retourne la liste des entrées de manifeste correspondantes.
    """
    resized = source.resize((profile.width, profile.height), Image.LANCZOS)
    entries = []

    for fmt in formats:
        filename = f"{name}_{profile.label}_equirect.{fmt}"
        path = os.path.join(output_dir, filename)

        if fmt == "jpg":
            resized.convert("RGB").save(path, "JPEG", quality=profile.jpeg_quality, optimize=True)
        elif fmt == "webp":
            resized.convert("RGB").save(path, "WEBP", quality=profile.webp_quality)
        else:
            raise ValueError(f"Format non supporté : {fmt}")

        size_kb = os.path.getsize(path) / 1024
        log.info("Généré : %-42s %5dx%-5d  %6.0f Ko  (%s)",
                  filename, profile.width, profile.height, size_kb, profile.purpose)

        entries.append({
            "file": filename,
            "profile": profile.label,
            "format": fmt,
            "width": profile.width,
            "height": profile.height,
            "size_kb": round(size_kb, 1),
            "purpose": profile.purpose,
        })

    return entries


# ============================================================================
# Point d'entrée principal
# ============================================================================

def prepare_assets(
    input_path: str,
    output_dir: str,
    name: str = "panorama",
    profiles: List[ResolutionProfile] = None,
    formats: List[str] = None,
) -> Dict:
    """
    Génère l'ensemble des assets optimisés à partir d'un panorama source.
    Retourne le manifeste (dict) également écrit sur disque en JSON.
    """
    profiles = profiles or DEFAULT_PROFILES
    formats = formats or ["jpg"]

    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Fichier introuvable : {input_path}")

    os.makedirs(output_dir, exist_ok=True)

    log.info("=== Préparation des assets pour %s ===", input_path)
    source = Image.open(input_path)
    source.load()
    log.info("Source : %dx%d px, %.0f Ko", source.width, source.height,
              os.path.getsize(input_path) / 1024)

    validate_equirectangular(source)

    all_entries = []
    for profile in profiles:
        all_entries.extend(generate_asset(source, profile, output_dir, name, formats))

    manifest = {
        "source_file": os.path.basename(input_path),
        "source_width": source.width,
        "source_height": source.height,
        "name": name,
        "assets": all_entries,
    }

    manifest_path = os.path.join(output_dir, f"{name}_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    log.info("Manifeste écrit : %s", manifest_path)
    log.info("=== %d assets générés dans %s ===", len(all_entries), output_dir)

    return manifest


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Préparation des assets 360° optimisés (Bloc 2 — cahier des charges Rendu 360°)"
    )
    parser.add_argument("--input", required=True, help="Panorama équirectangulaire source")
    parser.add_argument("--output-dir", required=True, help="Dossier de sortie des assets")
    parser.add_argument("--name", default="panorama", help="Préfixe de nommage (ex. taj_mahal)")
    parser.add_argument("--formats", nargs="+", default=["jpg"], choices=["jpg", "webp"],
                         help="Formats à générer (ex. --formats jpg webp)")
    parser.add_argument("--profiles", nargs="+", default=["hq", "standard", "preview"],
                         choices=["hq", "standard", "preview"],
                         help="Sous-ensemble de profils de résolution à générer")
    args = parser.parse_args()

    selected_profiles = [p for p in DEFAULT_PROFILES if p.label in args.profiles]

    if "ipykernel_launcher" in sys.argv[0]:
        log.warning(
            "Exécution détectée depuis Jupyter : utilisez prepare_assets(...) "
            "dans une cellule plutôt que ce script en CLI."
        )
        return

    prepare_assets(args.input, args.output_dir, name=args.name,
                    profiles=selected_profiles, formats=args.formats)


if __name__ == "__main__":
    main()
