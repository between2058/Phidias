# Copyright (c) Meta Platforms, Inc. and affiliates.
# SAM-3D API - FastAPI wrapper for SAM3D inference

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import uuid
import shutil
import tempfile
import numpy as np
from PIL import Image

# Add notebook path for inference imports
sys.path.append("notebook")

app = FastAPI(title="SAM-3D API", description="Image-to-3D generation using SAM3D")

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 臨時輸出目錄
OUTPUT_DIR = tempfile.mkdtemp()
print(f"SAM-3D 輸出目錄: {OUTPUT_DIR}")

# 全域模型實例
inference = None

@app.on_event("startup")
async def load_model():
    global inference
    try:
        from inference import Inference
        tag = "hf"
        config_path = f"checkpoints/{tag}/pipeline.yaml"
        inference = Inference(config_path, compile=False)
        print("✅ SAM-3D 模型載入成功")
    except Exception as e:
        print(f"❌ SAM-3D 模型載入失敗: {str(e)}")
        raise RuntimeError(f"SAM-3D 模型載入失敗: {str(e)}")


def load_image(path):
    """與 SAM3D 完全相同的 load_image"""
    image = Image.open(path)
    image = np.array(image)
    image = image.astype(np.uint8)
    return image


def load_mask(path):
    """與 SAM3D 完全相同的 load_mask"""
    mask = load_image(path)
    mask = mask > 0
    if mask.ndim == 3:
        mask = mask[..., -1]  # 取最後一個通道 (alpha)
    return mask


@app.post("/generate")
async def generate_3d(
    image: UploadFile = File(..., description="原圖 (RGBA)"),
    mask_image: UploadFile = File(..., description="去背圖 (RGBA，透明背景)"),
    seed: int = 42
):
    """
    從原圖 + 去背圖生成 3D 模型
    
    - image: 原圖 (RGBA)
    - mask_image: 去背的 RGBA 圖片
    - seed: 隨機種子
    """
    global inference
    
    if inference is None:
        raise HTTPException(status_code=503, detail="模型尚未載入")
    
    try:
        request_id = str(uuid.uuid4())
        print(f"SAM-3D 請求 ID: {request_id}")
        
        # 建立工作目錄
        work_dir = os.path.join(OUTPUT_DIR, request_id)
        os.makedirs(work_dir, exist_ok=True)
        
        # 儲存上傳圖片
        image_path = os.path.join(work_dir, "image.png")
        mask_image_path = os.path.join(work_dir, "mask.png")
        
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        with open(mask_image_path, "wb") as buffer:
            shutil.copyfileobj(mask_image.file, buffer)
        
        # 使用與 SAM3D 完全相同的載入方式
        img = load_image(image_path)
        mask = load_mask(mask_image_path)
        
        # 執行推論
        output = inference(img, mask, seed=seed)
        
        # 匯出 GLB
        glb_path = os.path.join(work_dir, "output.glb")
        output["glb"].export(glb_path)
        
        return {
            "request_id": request_id,
            "glb_file": f"/download/{request_id}/output.glb"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-batch")
async def generate_batch(
    image: UploadFile = File(..., description="原圖 (RGBA)"),
    mask_images: list[UploadFile] = File(..., description="多張去背圖 (RGBA，透明背景)"),
    seed: int = 42
):
    """
    從原圖 + 多張去背圖批次生成多個 3D 模型
    
    - image: 原圖 (RGBA)
    - mask_images: 多張去背的 RGBA 圖片
    - seed: 隨機種子
    
    每張 mask 會生成一個獨立的 GLB 檔案
    """
    global inference
    
    if inference is None:
        raise HTTPException(status_code=503, detail="模型尚未載入")
    
    try:
        request_id = str(uuid.uuid4())
        print(f"SAM-3D 批次請求 ID: {request_id}, 共 {len(mask_images)} 個 masks")
        
        # 建立工作目錄
        work_dir = os.path.join(OUTPUT_DIR, request_id)
        os.makedirs(work_dir, exist_ok=True)
        
        # 儲存原圖
        image_path = os.path.join(work_dir, "image.png")
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        # 載入原圖
        img = load_image(image_path)
        
        # 儲存並載入所有 masks
        masks = []
        for i, mask_file in enumerate(mask_images):
            mask_path = os.path.join(work_dir, f"{i}.png")
            with open(mask_path, "wb") as buffer:
                shutil.copyfileobj(mask_file.file, buffer)
            masks.append(load_mask(mask_path))
        
        # 批次執行推論 (與原始 SAM3D 相同的方式)
        outputs = [inference(img, mask, seed=seed) for mask in masks]
        
        # 匯出所有 GLB
        glb_files = []
        for i, output in enumerate(outputs):
            glb_path = os.path.join(work_dir, f"output_{i}.glb")
            output["glb"].export(glb_path)
            glb_files.append(f"/download/{request_id}/output_{i}.glb")
        
        return {
            "request_id": request_id,
            "count": len(glb_files),
            "glb_files": glb_files
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/download/{request_id}/{file_name}")
async def download_file(request_id: str, file_name: str):
    """下載生成的檔案"""
    file_path = os.path.join(OUTPUT_DIR, request_id, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="找不到檔案")
    return FileResponse(file_path, media_type='application/octet-stream', filename=file_name)


@app.get("/health")
async def health_check():
    """健康檢查"""
    return {
        "status": "ok",
        "model_loaded": inference is not None
    }


@app.on_event("shutdown")
async def cleanup():
    """清理臨時檔案"""
    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    print("🧹 SAM-3D 臨時檔案已清理")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
