from fastapi import APIRouter, HTTPException
from .models import (
    GenerationRequest, GenerationResponse, 
    SegmentationRequest, SegmentationResponse
)
import base64
import time

router = APIRouter()

# Mock GLB data
# Load the 'Emma' character GLB from the specified path
GLB_PATH = "/Users/between2058/Desktop/code/phidias/emma-stylized-adventure-character/source/1.glb"

def get_mock_glb_base64():
    try:
        with open(GLB_PATH, "rb") as f:
            return base64.b64encode(f.read()).decode('utf-8')
    except FileNotFoundError:
        # Fallback to minimal GLB if file not found
        print(f"Warning: Mock GLB not found at {GLB_PATH}")
        return base64.b64encode(b'\x67\x6C\x54\x46\x02\x00\x00\x00\x14\x00\x00\x00\x0C\x00\x00\x00\x4A\x53\x4F\x4E\x7B\x7D\x20\x20').decode('utf-8')

@router.post("/generate/text3d", response_model=GenerationResponse)
async def generate_text_3d(request: GenerationRequest):
    time.sleep(1) # Simulate processing
    return GenerationResponse(
        status="success",
        glb_data=get_mock_glb_base64(),
        message=f"Generated 3D model for: {request.prompt} using {request.model_id}"
    )

@router.post("/generate/image3d", response_model=GenerationResponse)
async def generate_image_3d(request: GenerationRequest):
    time.sleep(1)
    return GenerationResponse(
        status="success",
        glb_data=get_mock_glb_base64(),
        message=f"Generated 3D model from image using {request.model_id}"
    )

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
    time.sleep(1)
    return SegmentationResponse(
        status="success",
        parts=[
            {"id": "node_1", "name": "Body"},
            {"id": "node_2", "name": "Wheel_FL"},
            {"id": "node_3", "name": "Wheel_FR"}
        ]
    )
