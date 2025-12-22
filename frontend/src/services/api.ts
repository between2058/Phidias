import { ModelType } from "@/store/useAppStore";

export const API_BASE_URL = 'http://localhost:8000';

interface GenerationResponse {
    status: string;
    glb_data?: string;
    message?: string;
    debug?: any;
    // For segmentation
    mask_url?: string;
    parts?: any[];
    // For Rename/Group
    name?: string;
    hierarchy?: any;
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
    },

    segment3D: async (glbData: string): Promise<GenerationResponse> => {
        const body = {
            glb_data: glbData
        }

        const response = await fetch(`${API_BASE_URL}/segment/3d`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Segmentation failed');
        return response.json();
    },

    generateSam3D: async (originalImage: string, maskedImage: string, seed: number = 42): Promise<GenerationResponse> => {
        const body = {
            original_image: originalImage,
            masked_image: maskedImage,
            seed: seed
        }

        const response = await fetch(`${API_BASE_URL}/generate/sam3d`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('SAM3D Generation failed');
        return response.json();
    },

    generateTrellisMulti: async (images: string[], params?: any): Promise<GenerationResponse> => {
        const body = {
            images: images,
            seed: params?.seed ?? 1,
            simplify: params?.simplify ?? 0.95,
            ss_sampling_steps: params?.ss_sampling_steps ?? 12,
            ss_guidance_strength: params?.ss_guidance_strength ?? 7.5,
            slat_sampling_steps: params?.slat_sampling_steps ?? 12,
            slat_guidance_strength: params?.slat_guidance_strength ?? 3.0
        };

        const response = await fetch(`${API_BASE_URL}/generate/trellis/multi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Trellis Multi-Image Generation failed');
        return response.json();
    },

    // SAM3 2D Segmentation APIs
    sam3SetImage: async (imageBlob: Blob): Promise<{ session_id: string; image_size: { width: number; height: number } }> => {
        const formData = new FormData();
        formData.append('image', imageBlob, 'image.png');

        const response = await fetch(`${API_BASE_URL}/segment/2d/set_image`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) throw new Error('Failed to set image');
        return response.json();
    },

    sam3Predict: async (
        sessionId: string,
        pointCoords: number[][] | null,
        pointLabels: number[] | null,
        usePreviousMask: boolean = false,
        multimaskOutput: boolean = true
    ): Promise<{ masks_base64: string[]; scores: number[]; best_mask_base64: string | null }> => {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        if (pointCoords) formData.append('point_coords', JSON.stringify(pointCoords));
        if (pointLabels) formData.append('point_labels', JSON.stringify(pointLabels));
        formData.append('use_previous_mask', String(usePreviousMask));
        formData.append('multimask_output', String(multimaskOutput));

        const response = await fetch(`${API_BASE_URL}/segment/2d/predict`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) throw new Error('Prediction failed');
        return response.json();
    },

    sam3PredictAndApply: async (
        sessionId: string,
        pointCoords: number[][] | null,
        pointLabels: number[] | null,
        usePreviousMask: boolean = false
    ): Promise<{ rgba_base64: string | null; mask_base64: string | null; score: number }> => {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        if (pointCoords) formData.append('point_coords', JSON.stringify(pointCoords));
        if (pointLabels) formData.append('point_labels', JSON.stringify(pointLabels));
        formData.append('use_previous_mask', String(usePreviousMask));
        formData.append('return_rgba', 'true');

        const response = await fetch(`${API_BASE_URL}/segment/2d/predict_and_apply`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) throw new Error('Predict and apply failed');
        return response.json();
    },

    sam3DeleteSession: async (sessionId: string): Promise<void> => {
        await fetch(`${API_BASE_URL}/segment/2d/session/${sessionId}`, {
            method: 'DELETE',
        });
    },

    enhanceRename: async (image: string, prompt?: string, settings?: any): Promise<{ name: string }> => {
        const body = {
            image,
            prompt,
            api_url: settings?.vlmBaseUrl,
            api_key: settings?.vlmApiKey,
            model: settings?.vlmModel
        }

        const response = await fetch(`${API_BASE_URL}/enhance/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Rename failed');
        return response.json();
    },

    enhanceGroup: async (sceneGraph: any, prompt?: string, settings?: any): Promise<{ hierarchy?: any, groups?: any[] }> => {
        const body = {
            scene_graph: sceneGraph,
            prompt,
            api_url: settings?.llmBaseUrl,
            api_key: settings?.llmApiKey,
            model: settings?.llmModel
        }

        const response = await fetch(`${API_BASE_URL}/enhance/group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Group failed');
        return response.json();
    },

    analyzeModel: async (image: string, objectName: string, settings?: any): Promise<{ categories: string[] }> => {
        const body = {
            image,
            object_name: objectName,
            api_url: settings?.vlmBaseUrl,
            api_key: settings?.vlmApiKey,
            model: settings?.vlmModel
        }

        const response = await fetch(`${API_BASE_URL}/enhance/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Analysis failed');
        return response.json();
    },

    classifyPart: async (image: string, categories: string[], settings?: any): Promise<{ category: string }> => {
        const body = {
            image,
            categories,
            api_url: settings?.vlmBaseUrl,
            api_key: settings?.vlmApiKey,
            model: settings?.vlmModel
        }

        const response = await fetch(`${API_BASE_URL}/enhance/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Classification failed');
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
