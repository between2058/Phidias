
import os
import shutil
import tempfile
import uuid
import trimesh
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import argparse

# Import AutoMask from the provided script
try:
    from auto_mask import AutoMask
except ImportError as e:
    print(f"Warning: Could not import AutoMask. Dependencies might be missing. Error: {e}")
    AutoMask = None

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
OUTPUT_DIR = tempfile.mkdtemp()
OS_SEPARATOR = os.sep

# Global model instance
auto_mask_model = None

@app.on_event("startup")
async def load_model():
    global auto_mask_model
    if AutoMask is None:
        print("❌ AutoMask class not available. Service will not function correctly.")
        return

    # Check for checkpoint
    ckpt_path = os.getenv("P3SAM_CHECKPOINT", "weights/last.ckpt")
    if not os.path.exists(ckpt_path):
        print(f"⚠️ Checkpoint not found at {ckpt_path}. Model loading might fail.")
        # We allow startup even if model fails, but requests will error
    
    try:
        # Initialize AutoMask
        # Note: AutoMask __init__ expects ckpt_path
        # We assume defaults for other params as per auto_mask.py logic
        print(f"Loading P3SAM model from {ckpt_path}...")
        auto_mask_model = AutoMask(
            ckpt_path=ckpt_path,
            point_num=100000,
            prompt_num=400,
            threshold=0.95,
            post_process=True
        )
        print("✅ P3SAM model loaded successfully.")
    except Exception as e:
        print(f"❌ Failed to load P3SAM model: {e}")

@app.post("/segment")
async def segment_3d(file: UploadFile = File(...)):
    """
    Accepts a .glb/.ply/.obj file, runs P3-SAM segmentation, 
    and returns a .glb file (scene with segmented parts).
    """
    if auto_mask_model is None:
        raise HTTPException(status_code=503, detail="Segmentation model is not loaded.")

    request_id = str(uuid.uuid4())
    job_dir = os.path.join(OUTPUT_DIR, request_id)
    os.makedirs(job_dir, exist_ok=True)

    input_filename = file.filename or "input.glb"
    input_path = os.path.join(job_dir, input_filename)
    output_glb_path = os.path.join(job_dir, "segmented_output_parts.glb")

    try:
        # Save uploaded file
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Load mesh using trimesh
        # auto_mask.py expects a trimesh object
        mesh = trimesh.load(input_path, force='mesh')

        # Run prediction
        # predict_aabb returns aabb, face_ids, mesh
        # It also saves files to save_path if provided
        await run_in_threadpool(
            auto_mask_model.predict_aabb,
            mesh,
            save_path=job_dir,
            save_mid_res=False, # Don't flood with debug files
            show_info=True,
            clean_mesh_flag=True
        )

        # auto_mask.py logic (lines 1341-1350 in the provided file) 
        # exports "auto_mask_mesh_final_parts.glb" if save_path is present.
        # Let's verify if that file exists, or the output_path logic in the script.
        # Looking at auto_mask.py:
        # parts_scene_path = os.path.join(save_path, "auto_mask_mesh_final_parts.glb")
        
        expected_output = os.path.join(job_dir, "auto_mask_mesh_final_parts.glb")
        
        if not os.path.exists(expected_output):
            # Fallback: maybe it saved as something else or we returned it?
            # predict_aabb returns (aabb, final_face_ids, mesh)
            # We could export it manually if the script didn't.
            # But the logic I saw in auto_mask.py had the export.
            raise HTTPException(status_code=500, detail="Model finished but output file was not found.")

        # Rename to generic name for download
        shutil.move(expected_output, output_glb_path)

        return {
            "segmented_glb": f"/download/{request_id}/segmented_output_parts.glb",
            "request_id": request_id
        }

    except Exception as e:
        print(f"Segmentation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download/{request_id}/{file_name}")
async def download_file(request_id: str, file_name: str):
    file_path = os.path.join(OUTPUT_DIR, request_id, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type='application/octet-stream', filename=file_name)

@app.on_event("shutdown")
async def cleanup():
    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)

# Async helper to run blocking code 
from starlette.concurrency import run_in_threadpool

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5001)
