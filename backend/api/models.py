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

class RenameRequest(BaseModel):
    image: str # Base64
    prompt: Optional[str] = "This is the Image of Bridge Crane. What is the name of this highlighted green object? Only reply with a short name using snake_case, e.g. wheel_front_left."
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = "gpt-4o"

class RenameResponse(BaseModel):
    name: str

class GroupRequest(BaseModel):
    scene_graph: Any # JSON structure of the scene graph or relevant list
    prompt: Optional[str] = "Group these parts logically."
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = "gpt-4o"

class GroupResponse(BaseModel):
    hierarchy: Optional[Dict] = None # Legacy/Recursive
    groups: Optional[List[Dict[str, Any]]] = None # Flat list of groups
