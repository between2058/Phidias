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
    generateText3D: async (prompt: string, modelId: string): Promise<GenerationResponse> => {
        const response = await fetch(`${API_BASE_URL}/generate/text3d`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model_id: modelId }),
        });
        if (!response.ok) throw new Error('Generation failed');
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
