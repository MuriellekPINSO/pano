"""
============================================================================
 API FASTAPI — Rendu 360° (Bloc 1 & Bloc 2), pour intégration mobile
============================================================================
Expose le pipeline de stitching et la préparation d'assets sous forme
d'endpoints REST consommables par une app mobile (Flutter, React Native,
natif iOS/Android...).

Endpoints :
    GET  /api/health                    — vérification de disponibilité
    POST /api/stitch                    — upload photos -> panorama assemblé
    POST /api/assets                    — upload panorama -> assets optimisés (.zip)
    GET  /files/{filename}               — récupération d'un fichier généré (statique)

Lancement local :
    pip install -r requirements.txt
    uvicorn fastapi_app:app --reload --host 0.0.0.0 --port 8000

Documentation interactive générée automatiquement : http://localhost:8000/docs

Déploiement : n'importe quelle plateforme supportant une app ASGI Python
(Render, Railway, Fly.io, un VPS avec Docker...). Streamlit Cloud n'est PAS
adapté à FastAPI — c'est un service séparé.
============================================================================
"""

import os
import shutil
import uuid
import zipfile
from io import BytesIO

import cv2
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from asset_prep import DEFAULT_PROFILES, prepare_assets
from stitching_pipeline import PipelineConfig, check_seam_continuity, run_auto_pipeline, run_manual_pipeline

app = FastAPI(
    title="API Rendu 360°",
    description="Stitching panoramique (Bloc 1) et préparation d'assets WebGL (Bloc 2).",
    version="1.0.0",
)

# Autorise les appels depuis une app mobile (Flutter/RN font des requêtes
# cross-origin depuis un WebView ou un environnement natif). À restreindre
# à des origines précises en production si nécessaire.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = "/tmp/rendu360_api"
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/files", StaticFiles(directory=STORAGE_DIR), name="files")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/stitch")
async def stitch_photos(
    files: list[UploadFile] = File(..., description="Au moins 2 photos avec chevauchement"),
    mode: str = Form("auto"),
    output_width: int = Form(4096),
    output_height: int = Form(2048),
    blend_mode: str = Form("multiband"),
):
    """
    Bloc 1 — Assemble des photos uploadées en un panorama équirectangulaire.
    Retourne l'URL du panorama généré et le score de continuité de jonction.
    """
    if len(files) < 2:
        raise HTTPException(400, "Au moins 2 photos sont nécessaires pour l'assemblage.")
    if mode not in ("auto", "manual"):
        raise HTTPException(400, "mode doit être 'auto' ou 'manual'.")

    job_id = uuid.uuid4().hex[:12]
    input_dir = os.path.join(STORAGE_DIR, job_id, "input")
    os.makedirs(input_dir, exist_ok=True)
    output_filename = f"{job_id}_panorama.jpg"
    output_path = os.path.join(STORAGE_DIR, output_filename)

    for f in files:
        if not f.content_type or not f.content_type.startswith("image/"):
            continue
        dest = os.path.join(input_dir, f.filename)
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out)

    cfg = PipelineConfig(blend_mode=blend_mode, output_width=output_width, output_height=output_height)
    pipeline_fn = run_auto_pipeline if mode == "auto" else run_manual_pipeline
    ok = pipeline_fn(input_dir, output_path, cfg)

    shutil.rmtree(os.path.dirname(input_dir), ignore_errors=True)

    if not ok or not os.path.exists(output_path):
        raise HTTPException(
            422,
            "Échec de l'assemblage : chevauchement insuffisant entre les photos, "
            "ou images trop peu texturées. Essayez mode='manual'.",
        )

    panorama = cv2.imread(output_path)
    score = check_seam_continuity(panorama) if panorama is not None else None

    return {
        "job_id": job_id,
        "panorama_url": f"/files/{output_filename}",
        "width": output_width,
        "height": output_height,
        "seam_continuity_score": round(score, 3) if score is not None else None,
    }


@app.post("/api/assets")
async def generate_assets(
    file: UploadFile = File(..., description="Panorama équirectangulaire source"),
    name: str = Form("panorama"),
    profiles: str = Form("hq,standard,preview"),
    formats: str = Form("jpg"),
):
    """
    Bloc 2 — Génère les déclinaisons optimisées (résolutions/formats) d'un
    panorama et retourne une archive .zip contenant les assets + manifeste.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Le fichier fourni n'est pas une image.")

    job_id = uuid.uuid4().hex[:12]
    work_dir = os.path.join(STORAGE_DIR, job_id, "assets")
    os.makedirs(work_dir, exist_ok=True)
    input_path = os.path.join(work_dir, file.filename)
    with open(input_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    selected_labels = [p.strip() for p in profiles.split(",") if p.strip()]
    selected_profiles = [p for p in DEFAULT_PROFILES if p.label in selected_labels] or DEFAULT_PROFILES
    selected_formats = [f.strip() for f in formats.split(",") if f.strip()] or ["jpg"]

    try:
        manifest = prepare_assets(
            input_path, work_dir, name=name,
            profiles=selected_profiles, formats=selected_formats,
        )
    except Exception as exc:
        raise HTTPException(422, f"Échec de la génération des assets : {exc}")

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for asset in manifest["assets"]:
            zf.write(os.path.join(work_dir, asset["file"]), arcname=asset["file"])
        zf.write(os.path.join(work_dir, f"{name}_manifest.json"), arcname=f"{name}_manifest.json")
    zip_buffer.seek(0)

    shutil.rmtree(os.path.dirname(work_dir), ignore_errors=True)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}_assets_360.zip"'},
    )


@app.get("/files/{filename}")
def get_file(filename: str):
    path = os.path.join(STORAGE_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Fichier introuvable ou expiré.")
    return FileResponse(path)

