import sys
import os

sys.path.append("notebook")

from inference import Inference, load_image, load_masks, make_scene

tag = "hf"
config_path = f"checkpoints/{tag}/pipeline.yaml"
inference = Inference(config_path, compile=False)

image_path = "notebook/images/shutterstock_stylish_kidsroom_1640806567/image.png"
image_dir = os.path.dirname(image_path)

image = load_image(image_path)

masks = load_masks(image_dir, extension=".png")

print(f"Running inference on {len(masks)} objects...")
outputs = [inference(image, mask, seed=42) for mask in masks]

# 匯出 GLB
output_dir = "./output"
os.makedirs(output_dir, exist_ok=True) # 確保輸出資料夾存在

print(f"Saving GLB files to {output_dir}...")

for i, output in enumerate(outputs):
    # 檔名命名為 object_0.glb, object_1.glb ...
    glb_path = os.path.join(output_dir, f"object_{i}.glb")
    
    # 呼叫 export 儲存
    output["glb"].export(glb_path)
    print(f"Saved: {glb_path}")

print("All GLB files have been saved.")
# scene_gs = make_scene(*outputs)
# scene_gs.save_ply("multi_splat.ply")
# print("Your multi-object reconstruction has been saved to multi_splat.ply")
