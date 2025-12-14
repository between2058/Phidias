from fastapi import APIRouter, HTTPException, Form, UploadFile, Response, File
from .models import (
    GenerationRequest, GenerationResponse, 
    SegmentationRequest, SegmentationResponse
)
import base64
import time
import os
import httpx
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# External Trellis API Configuration
# Defaulting to localhost:5000 based on typical separate service setups. 
# User should set this env var if different.
TRELLIS_API_URL = os.getenv("TRELLIS_API_URL", "http://localhost:5000")

# --- DRY RUN MODE ---
# Set to True to bypass actual model generation and return mock data (Emma char).
# Useful for frontend development without GPU backend.
DRY_RUN = True 
# --------------------

# Mock GLB data
GLB_PATH = "/Users/between2058/Desktop/code/phidias/emma-stylized-adventure-character/source/1.glb"

def get_mock_glb_base64():
    try:
        with open(GLB_PATH, "rb") as f:
            return base64.b64encode(f.read()).decode('utf-8')
    except FileNotFoundError:
        logger.warning(f"Mock GLB not found at {GLB_PATH}")
        return base64.b64encode(b'\x67\x6C\x54\x46\x02\x00\x00\x00\x14\x00\x00\x00\x0C\x00\x00\x00\x4A\x53\x4F\x4E\x7B\x7D\x20\x20').decode('utf-8')

import io

# ... imports ...

@router.post("/generate/text3d", response_model=GenerationResponse)
async def generate_text_3d(request: GenerationRequest):
    """
    Generates a 3D model from text.
    If model_id is 'trellis', calls external API with params.
    Otherwise, uses mock.
    """
    if request.model_id.lower() == 'trellis':
        # Dry Run Check
        if DRY_RUN:
            logger.info("DRY RUN ACTIVE: Returning mock data for Trellis request.")
            time.sleep(1) # Simulate delay
            return GenerationResponse(
                status="success",
                glb_data=get_mock_glb_base64(),
                message=f"[DRY RUN] Mock 3D model for: {request.prompt}"
            )

        try:
            if not request.prompt:
                raise HTTPException(status_code=400, detail="Prompt is required")

            logger.info(f"Calling Trellis (Text) at {TRELLIS_API_URL}")
            
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{TRELLIS_API_URL}/generate-text",
                    params={
                        "prompt": request.prompt,
                        "seed": request.seed,
                        "simplify": request.simplify,
                        "sparse_steps": request.ss_sampling_steps,
                        "sparse_cfg": request.ss_guidance_strength,
                        "slat_steps": request.slat_sampling_steps,
                        "slat_cfg": request.slat_guidance_strength,
                        "texture_size": 1024
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                # Download GLB
                glb_path = data.get("glb_file")
                if not glb_path: raise ValueError("No GLB path in response")
                
                glb_resp = await client.get(f"{TRELLIS_API_URL}{glb_path}")
                glb_resp.raise_for_status()
                
                return GenerationResponse(
                    status="success",
                    glb_data=base64.b64encode(glb_resp.content).decode('utf-8'),
                    message=f"Trellis Generated: {request.prompt}"
                )
        except Exception as e:
            logger.error(f"Trellis Error: {e}")
            pass

    # Mock Fallback (or if model != trellis)
    # time.sleep(1) # Removed for faster fallback testing
    return GenerationResponse(
        status="success",
        glb_data=get_mock_glb_base64(),
        message=f"Generated 3D model (Mock) for: {request.prompt}"
    )

@router.post("/generate/image3d", response_model=GenerationResponse)
async def generate_image_3d(request: GenerationRequest):
    """
    Generates 3D from Image(s).
    Supports Single (generate-single) or Multi (generate-multi).
    """
    if request.model_id.lower() == 'trellis':
        # Dry Run Check
        if DRY_RUN:
            logger.info("DRY RUN ACTIVE: Returning mock data for Trellis Image request.")
            time.sleep(1) # Simulate delay
            return GenerationResponse(
                status="success",
                glb_data=get_mock_glb_base64(),
                message="[DRY RUN] Mock 3D model from Image"
            )

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                # 1. Multi-Image Case
                if request.images and len(request.images) >= 2:
                    logger.info(f"Calling Trellis (Multi-Image) with {len(request.images)} images")
                    
                    # Convert base64s to bytes for multipart upload
                    files = []
                    for i, b64_str in enumerate(request.images):
                        # Strip prefix if present (e.g. "data:image/png;base64,")
                        if "base64," in b64_str:
                            b64_str = b64_str.split("base64,")[1]
                        
                        file_bytes = base64.b64decode(b64_str)
                        files.append(('files', (f'image_{i}.png', file_bytes, 'image/png')))

                    response = await client.post(
                        f"{TRELLIS_API_URL}/generate-multi",
                        params={
                            "seed": request.seed,
                            "simplify": request.simplify,
                            "sparse_steps": request.ss_sampling_steps,
                            "sparse_cfg": request.ss_guidance_strength,
                            "slat_steps": request.slat_sampling_steps,
                            "slat_cfg": request.slat_guidance_strength
                        },
                        files=files
                    )

                # 2. Single Image Case
                elif request.image_url or (request.images and len(request.images) == 1):
                    logger.info("Calling Trellis (Single-Image)")
                    
                    # Get base64 string
                    b64_str = request.images[0] if request.images else request.image_url
                    if "base64," in b64_str:
                        b64_str = b64_str.split("base64,")[1]
                    
                    file_bytes = base64.b64decode(b64_str)
                    files = {'file': ('input.png', file_bytes, 'image/png')}
                    
                    response = await client.post(
                        f"{TRELLIS_API_URL}/generate-single",
                        params={
                            "seed": request.seed,
                            "simplify": request.simplify,
                            # Single image pipeline might might not take all CFG params in provided API, 
                            # checking trellis_api.py... generate_single takes seed, simplify, texture_size
                            "texture_size": 1024
                        },
                        files=files
                    )
                else:
                     raise HTTPException(status_code=400, detail="No image provided")

                response.raise_for_status()
                data = response.json()
                
                # Download GLB
                glb_path = data.get("glb_file")
                if not glb_path: raise ValueError("No GLB path in response")
                
                glb_resp = await client.get(f"{TRELLIS_API_URL}{glb_path}")
                glb_resp.raise_for_status()
                
                return GenerationResponse(
                    status="success",
                    glb_data=base64.b64encode(glb_resp.content).decode('utf-8'),
                    message="Trellis Generated from Image"
                )

        except Exception as e:
            logger.error(f"Trellis Image Error: {e}")
            pass

    time.sleep(1)
    return GenerationResponse(
        status="success",
        glb_data=get_mock_glb_base64(),
        message=f"Generated 3D model (Mock) from image"
    )

SEGMENTATION_API_URL = os.getenv("SEGMENTATION_API_URL", "http://localhost:5001")

@router.post("/segment/2d", response_model=SegmentationResponse)
async def segment_2d(request: SegmentationRequest):
    time.sleep(0.5)
    return SegmentationResponse(
        status="success",
        mask_url="https://placeholder.com/mask.png",
        parts=[{"id": 1, "label": "foreground"}]
    )

@router.post("/segment/3d", response_model=SegmentationResponse)
async def segment_3d(request: SegmentationRequest):
    """
    Calls the external Segmentation API to segment a 3D model.
    """
    try:
        if not request.glb_data:
             # Fallback mock for testing
             logger.warning("No GLB data provided for segmentation, returning mock.")
             time.sleep(1)
             return SegmentationResponse(
                status="success",
                parts=[
                    {"id": "node_1", "name": "Body"},
                    {"id": "node_2", "name": "Wheel_FL"},
                ]
             )

        # Decode Base64 GLB
        glb_bytes = base64.b64decode(request.glb_data)
        
        logger.info(f"Calling Segmentation API at {SEGMENTATION_API_URL}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Upload file
            files = {'file': ('input.glb', glb_bytes, 'model/gltf-binary')}
            response = await client.post(f"{SEGMENTATION_API_URL}/segment", files=files)
            response.raise_for_status()
            data = response.json()
            
            # Download Resulting GLB
            segmented_glb_path = data.get("segmented_glb")
            if not segmented_glb_path:
                raise ValueError("No segmented GLB path in response")
                
            glb_resp = await client.get(f"{SEGMENTATION_API_URL}{segmented_glb_path}")
            glb_resp.raise_for_status()
            
            encoded_glb = base64.b64encode(glb_resp.content).decode('utf-8')
            
            return SegmentationResponse(
                status="success",
                glb_data=encoded_glb,
                message="Segmentation Complete"
            )

    except Exception as e:
        logger.error(f"Segmentation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# SAM3D API Configuration
SAM3D_API_URL = os.getenv("SAM3D_API_URL", "http://localhost:8001")

@router.post("/generate/sam3d", response_model=GenerationResponse)
async def generate_sam3d(request: dict):
    """
    Proxies request to SAM3D API for image-to-3D generation.
    
    Expects:
    - original_image: Base64 encoded original image
    - masked_image: Base64 encoded RGBA image (alpha = mask)
    - seed: Random seed (default 42)
    """
    # Dry Run Check
    if DRY_RUN:
        logger.info("DRY RUN ACTIVE: Returning mock data for SAM3D request.")
        time.sleep(1)
        return GenerationResponse(
            status="success",
            glb_data=get_mock_glb_base64(),
            message="[DRY RUN] Mock 3D model from SAM3D"
        )

    try:
        original_b64 = request.get("original_image", "")
        masked_b64 = request.get("masked_image", "")
        seed = request.get("seed", 42)

        # Strip data URL prefix if present
        if "base64," in original_b64:
            original_b64 = original_b64.split("base64,")[1]
        if "base64," in masked_b64:
            masked_b64 = masked_b64.split("base64,")[1]

        # Decode images
        original_bytes = base64.b64decode(original_b64)
        masked_bytes = base64.b64decode(masked_b64)

        logger.info(f"Calling SAM3D API at {SAM3D_API_URL}")

        async with httpx.AsyncClient(timeout=300.0) as client:
            # Upload files to SAM3D API
            files = [
                ('image', ('image.png', original_bytes, 'image/png')),
                ('mask_image', ('mask.png', masked_bytes, 'image/png'))
            ]
            
            response = await client.post(
                f"{SAM3D_API_URL}/generate",
                files=files,
                params={"seed": seed}
            )
            response.raise_for_status()
            data = response.json()

            # Download GLB
            glb_path = data.get("glb_file")
            if not glb_path:
                raise ValueError("No GLB path in SAM3D response")

            glb_resp = await client.get(f"{SAM3D_API_URL}{glb_path}")
            glb_resp.raise_for_status()

            return GenerationResponse(
                status="success",
                glb_data=base64.b64encode(glb_resp.content).decode('utf-8'),
                message="SAM3D Generated from Image"
            )

    except Exception as e:
        logger.error(f"SAM3D Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# SAM3 2D Segmentation API Configuration
SAM3_API_URL = os.getenv("SAM3_API_URL", "http://localhost:8002")

@router.post("/segment/2d/set_image")
async def set_image_for_segmentation(image: UploadFile = File(...)):
    """Proxy to SAM3 /set_image endpoint"""
    try:
        logger.info(f"Proxying set_image to SAM3 API at {SAM3_API_URL}")
        logger.info(f"Received file: {image.filename}, content_type: {image.content_type}")
        
        file_content = await image.read()
        logger.info(f"File size: {len(file_content)} bytes")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {'image': ('image.png', file_content, 'image/png')}
            response = await client.post(f"{SAM3_API_URL}/set_image", files=files)
            
            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"SAM3 API returned {response.status_code}: {error_detail}")
                raise HTTPException(status_code=response.status_code, detail=f"SAM3 API error: {error_detail}")
            
            return response.json()
    except httpx.ConnectError as e:
        logger.error(f"Cannot connect to SAM3 API at {SAM3_API_URL}: {e}")
        raise HTTPException(status_code=503, detail=f"SAM3 API is not available at {SAM3_API_URL}. Make sure it's running: uvicorn sam3_api:app --port 8002")
    except Exception as e:
        logger.error(f"SAM3 set_image Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment/2d/predict")
async def predict_segmentation(
    session_id: str = Form(...),
    point_coords: str = Form(None),
    point_labels: str = Form(None),
    use_previous_mask: bool = Form(False),
    multimask_output: bool = Form(True)
):
    """Proxy to SAM3 /predict endpoint"""
    try:
        logger.info(f"Proxying predict to SAM3 API for session {session_id}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            data = {
                'session_id': session_id,
                'use_previous_mask': str(use_previous_mask).lower(),
                'multimask_output': str(multimask_output).lower()
            }
            if point_coords:
                data['point_coords'] = point_coords
            if point_labels:
                data['point_labels'] = point_labels
            
            response = await client.post(f"{SAM3_API_URL}/predict", data=data)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"SAM3 predict Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment/2d/predict_and_apply")
async def predict_and_apply_segmentation(
    session_id: str = Form(...),
    point_coords: str = Form(None),
    point_labels: str = Form(None),
    use_previous_mask: bool = Form(False),
    return_rgba: bool = Form(True)
):
    """Proxy to SAM3 /predict_and_apply endpoint"""
    try:
        logger.info(f"Proxying predict_and_apply to SAM3 API for session {session_id}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            data = {
                'session_id': session_id,
                'use_previous_mask': str(use_previous_mask).lower(),
                'return_rgba': str(return_rgba).lower()
            }
            if point_coords:
                data['point_coords'] = point_coords
            if point_labels:
                data['point_labels'] = point_labels
            
            response = await client.post(f"{SAM3_API_URL}/predict_and_apply", data=data)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"SAM3 predict_and_apply Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/segment/2d/session/{session_id}")
async def delete_segmentation_session(session_id: str):
    """Proxy to SAM3 session deletion endpoint"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.delete(f"{SAM3_API_URL}/session/{session_id}")
            if response.status_code == 404:
                return {"message": "Session already deleted or not found"}
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"SAM3 delete session Error: {e}")
        return {"message": "Session cleanup attempted"}


@router.get("/segment/2d/download/{session_id}/{file_name}")
async def download_segmentation_file(session_id: str, file_name: str):
    """Proxy to SAM3 file download endpoint"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{SAM3_API_URL}/download/{session_id}/{file_name}")
            response.raise_for_status()
            
            return Response(
                content=response.content,
                media_type="image/png",
                headers={"Content-Disposition": f'attachment; filename="{file_name}"'}
            )
    except Exception as e:
        logger.error(f"SAM3 download Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
