from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from trellis.pipelines import TrellisImageTo3DPipeline, TrellisTextTo3DPipeline
from trellis.utils import render_utils, postprocessing_utils
import os
import uuid
import numpy as np
import imageio
from PIL import Image
import shutil
import tempfile
import asyncio

app = FastAPI()

# 設定允許跨域請求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 環境變量設定
os.environ['SPCONV_ALGO'] = 'native'

# 建立臨時目錄存儲結果
OUTPUT_DIR = tempfile.mkdtemp()
print(f"Output directory: {OUTPUT_DIR}")

# 初始化模型
pipeline = None

@app.on_event("startup")
async def load_model():
    global pipeline
    try:
        pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
        pipeline.cuda()
    except Exception as e:
        raise RuntimeError(f"Failed to load model: {str(e)}")

# 在現有 load_model 函數旁新增
@app.on_event("startup")
async def load_text_model():
    global text_pipeline
    try:
        text_pipeline = TrellisTextTo3DPipeline.from_pretrained("microsoft/TRELLIS-text-xlarge")
        text_pipeline.cuda()
        print("✅ 文字生成模型載入成功")
    except Exception as e:
        print(f"❌ 文字生成模型載入失敗: {str(e)}")
        raise RuntimeError(f"文字生成模型載入失敗: {str(e)}")


@app.post("/generate-text")
async def generate_text_model(
    prompt: str,
    seed: int = 1,
    simplify: float = 0.95,
    texture_size: int = 1024,
    sparse_steps: int = 12,
    sparse_cfg: float = 7.5,
    slat_steps: int = 12,
    slat_cfg: float = 7.5
):
    try:
        # 建立請求ID
        request_id = str(uuid.uuid4())
        print(f"文字生成請求 ID: {request_id}")
        
        # 執行文字生成
        outputs = text_pipeline.run(
            prompt,
            seed=seed,
            sparse_structure_sampler_params={
                "steps": sparse_steps,
                "cfg_strength": sparse_cfg
            },
            slat_sampler_params={
                "steps": slat_steps,
                "cfg_strength": slat_cfg
            }
        )
        
        # 處理輸出
        return await _process_outputs(outputs, request_id, simplify, texture_size)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-single")
async def generate_single_image(
    file: UploadFile = File(...),
    seed: int = 1,
    simplify: float = 0.95,
    texture_size: int = 1024
):
    try:
        # 建立獨特的請求ID
        request_id = str(uuid.uuid4())
        print(request_id)
        input_path = os.path.join(OUTPUT_DIR, f"{request_id}_input.png")
        
        # 保存上傳的圖片
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 開始處理
        image = Image.open(input_path)
        outputs = pipeline.run(
            image,
            seed=seed
        )
        
        return await _process_outputs(outputs, request_id, simplify, texture_size)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-multi")
async def generate_multi_image(
    files: list[UploadFile] = File(...),
    seed: int = 1,
    simplify: float = 0.95,
    texture_size: int = 1024,
    sparse_steps: int = 12,
    sparse_cfg: float = 7.5,
    slat_steps: int = 12,
    slat_cfg: float = 3.0
):
    try:
        if len(files) < 8:
            raise HTTPException(status_code=400, detail="需要至少8張圖片")
            
        request_id = str(uuid.uuid4())
        input_dir = os.path.join(OUTPUT_DIR, request_id)
        os.makedirs(input_dir, exist_ok=True)
        
        # 保存所有上傳的圖片
        image_paths = []
        for i, file in enumerate(files):
            file_path = os.path.join(input_dir, f"{i}.png")
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            image_paths.append(file_path)
        
        # 讀取圖片
        images = [Image.open(p) for p in image_paths]
        
        # 執行多圖處理
        outputs = pipeline.run_multi_image(
            images,
            seed=seed,
            sparse_structure_sampler_params={
                "steps": sparse_steps,
                "cfg_strength": sparse_cfg
            },
            slat_sampler_params={
                "steps": slat_steps,
                "cfg_strength": slat_cfg
            }
        )
        
        return await _process_outputs(outputs, request_id, simplify, texture_size)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _process_outputs(outputs, request_id, simplify, texture_size):
    output_dir = os.path.join(OUTPUT_DIR, request_id)
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # 生成視頻
        video_gs = render_utils.render_video(outputs['gaussian'][0])['color']
        video_gs_path = os.path.join(output_dir, "gs.mp4")
        imageio.mimsave(video_gs_path, video_gs, fps=30)
        
        video_rf = render_utils.render_video(outputs['radiance_field'][0])['color']
        video_rf_path = os.path.join(output_dir, "rf.mp4")
        imageio.mimsave(video_rf_path, video_gs, fps=30)
        
        video_mesh = render_utils.render_video(outputs['mesh'][0])['normal']
        video_mesh_path = os.path.join(output_dir, "mesh.mp4")
        imageio.mimsave(video_mesh_path, video_mesh, fps=30)
        
        # 生成GLB
        glb = postprocessing_utils.to_glb(
            outputs['gaussian'][0],
            outputs['mesh'][0],
            simplify=simplify,
            texture_size=texture_size
        )
        glb_path = os.path.join(output_dir, "output.glb")
        glb.export(glb_path)
        
        # 生成PLY
        ply_path = os.path.join(output_dir, "output.ply")
        outputs['gaussian'][0].save_ply(ply_path)
        
        # 建立下載連結
        return {
            "gaussian_video": f"/download/{request_id}/gs.mp4",
            "radiance_video": f"/download/{request_id}/rf.mp4",
            "mesh_video": f"/download/{request_id}/mesh.mp4",
            "glb_file": f"/download/{request_id}/output.glb",
            "ply_file": f"/download/{request_id}/output.ply"
        }
    except Exception as e:
        # 清理臨時文件
        shutil.rmtree(output_dir, ignore_errors=True)
        raise e

@app.get("/download/{request_id}/{file_name}")
async def download_file(request_id: str, file_name: str):
    file_path = os.path.join(OUTPUT_DIR, request_id, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="找不到文件")
    return FileResponse(file_path, media_type='application/octet-stream', filename=file_name)

@app.on_event("shutdown")
async def cleanup():
    # 清理所有臨時文件
    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
