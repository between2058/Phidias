from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class GenerationRequest(BaseModel):
    prompt: Optional[str] = None
    image_url: Optional[str] = None
    model_id: str

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
