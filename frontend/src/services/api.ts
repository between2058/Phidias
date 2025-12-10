import { ModelType } from "@/store/useAppStore";

const API_BASE_URL = 'http://localhost:8000';

interface GenerationResponse {
    status: string;
    glb_data?: string;
    message?: string;
    debug?: any;
    // For segmentation
    mask_url?: string;
    parts?: any[];
}

export const api = {
    generateText3D: async (prompt: string, modelId: string, params?: any): Promise<GenerationResponse> => {
        const body = {
            prompt,
            model_id: modelId,
            ...params
        }

        const response = await fetch(`${API_BASE_URL}/generate/text3d`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Generation failed');
        return response.json();
    },

    generateImage3D: async (imageUrl: string, modelId: string, params?: any, images?: string[]): Promise<GenerationResponse> => {
        const body = {
            image_url: imageUrl,
            model_id: modelId,
            images: images,
            ...params
        }

        const response = await fetch(`${API_BASE_URL}/generate/image3d`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Image Generation failed');
        return response.json();
    }
};

export function base64ToBlob(base64: string, type = 'model/gltf-binary'): Blob {
    const binStr = atob(base64);
    const len = binStr.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = binStr.charCodeAt(i);
    }
    return new Blob([arr], { type });
}
