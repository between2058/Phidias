from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class GenerationRequest(BaseModel):
    prompt: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None # List of Base64 strings for multi-image
    model_id: str
    # Trellis Parameters
    seed: int = 1
    simplify: float = 0.95
    ss_sampling_steps: int = 12
    ss_guidance_strength: float = 7.5
    slat_sampling_steps: int = 12
    slat_guidance_strength: float = 7.5

class GenerationResponse(BaseModel):
    status: str
    glb_data: Optional[str] = None # Base64 string
    message: Optional[str] = None
    debug: Optional[Dict[str, Any]] = None

class SegmentationRequest(BaseModel):
    image_url: Optional[str] = None
    glb_data: Optional[str] = None

class SegmentationResponse(BaseModel):
    status: str
    mask_url: Optional[str] = None
    parts: Optional[List[Dict[str, Any]]] = None
    glb_data: Optional[str] = None # Base64 of segmented model


class Sam3DRequest(BaseModel):
    original_image: str  # Base64 encoded original image
    masked_image: str    # Base64 encoded RGBA image (alpha = mask)
    seed: int = 42


class TrellisMultiRequest(BaseModel):
    images: List[str]  # List of Base64 encoded images
    seed: int = 1
    simplify: float = 0.95
    ss_sampling_steps: int = 12
    ss_guidance_strength: float = 7.5
    slat_sampling_steps: int = 12
    slat_guidance_strength: float = 3.0
