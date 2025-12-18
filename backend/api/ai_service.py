import os
import httpx
import logging
import base64
import json
from typing import List, Dict, Optional, Union

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        # Default fallback keys from env
        self.default_openai_key = os.getenv("OPENAI_API_KEY")
        self.default_openai_base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        
        # We can also support Gemini if needed, but for "self-hosted" users usually want 
        # OpenAI compatible endpoints (like vLLM, Ollama, etc.)
        
    async def call_vlm_rename(
        self, 
        image_b64: str, 
        prompt: str,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: str = "gpt-4o" 
    ) -> str:
        """
        Calls a VLM to rename a part based on its image.
        Uses OpenAI Chat Completions API format which is standard for most self-hosted VLMs.
        """
        base_url = api_url if api_url else self.default_openai_base
        key = api_key if api_key else self.default_openai_key
        
        if not key:
            # If no key is provided and we are hitting the real OpenAI API, it will fail.
            # But for self-hosted (e.g. Ollama), key might be optional/dummy.
            key = "dummy" 

        # Ensure base_url ends correctly for chat completions
        if not base_url.endswith("/v1"):
             # Simple heuristic: if user gave "http://localhost:11434", treat as base
             # But standard is usually /v1. Let's assume user provides base.
             pass
        
        endpoint = f"{base_url}/chat/completions"
        if base_url.endswith("/chat/completions"):
            endpoint = base_url

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}"
        }

        # Normalize image string
        if "base64," in image_b64:
            image_b64 = image_b64.split("base64,")[1]

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_b64}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 50
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                logger.info(f"Calling VLM at {endpoint} with model {model}")
                response = await client.post(endpoint, headers=headers, json=payload)
                
                if response.status_code != 200:
                    logger.error(f"VLM Error {response.status_code}: {response.text}")
                    return f"Error_{response.status_code}"
                
                data = response.json()
                content = data['choices'][0]['message']['content']
                return content.strip().replace(" ", "_").replace("\n", "")
                
        except Exception as e:
            logger.error(f"VLM Exception: {e}")
            return "Unknown_Part"

    async def call_llm_group(
        self, 
        scene_graph_data: Dict, 
        prompt: str,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: str = "gpt-4o"
    ) -> Dict:
        """
        Calls an LLM to group parts based on scene graph structure.
        Expects user to return a valid JSON structure.
        """
        base_url = api_url if api_url else self.default_openai_base
        key = api_key if api_key else self.default_openai_key
        
        if not key: key = "dummy"

        endpoint = f"{base_url}/chat/completions"
        # Handle trailing slash or full path issues roughly
        if base_url.endswith("/chat/completions"):
             endpoint = base_url
        elif base_url.endswith("/"):
             endpoint = f"{base_url}chat/completions"
        elif not base_url.endswith("/v1") and "api" not in base_url:
             # Heuristic for neat URLs like http://localhost:8000
             endpoint = f"{base_url}/v1/chat/completions"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}"
        }

        system_prompt = """
        You are an expert 3D model organizer. 
        Your task is to organize a flat list of 3D parts into a logical hierarchy.
        
        You MUST return a JSON object with a single key "hierarchy" containing a list of node objects.
        Each node object MUST have:
        - "name": string (the name of the group or part)
        - "type": "Group" | "Mesh"
        - "children": list of node objects (can be empty)
        - "ids": list of strings (ONLY if type is Mesh, listing the UUIDs of the parts in this leaf node)

        Example structure:
        {
            "hierarchy": [
                {
                    "name": "Car",
                    "type": "Group",
                    "children": [
                        {
                            "name": "Wheels",
                            "type": "Group",
                            "children": [
                                { "name": "Wheel_FL", "type": "Mesh", "ids": ["uuid1"] },
                                { "name": "Wheel_FR", "type": "Mesh", "ids": ["uuid2"] }
                            ]
                        },
                        {
                            "name": "Body",
                            "type": "Mesh",
                            "ids": ["uuid3", "uuid4"]
                        }
                    ]
                }
            ]
        }
        
        Do not change the specific UUIDs provided in the input. Just organize them.
        Return ONLY valid JSON.
        """

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{prompt}\n\nData:\n{json.dumps(scene_graph_data)}"}
            ],
            "response_format": {"type": "json_object"}
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                logger.info(f"Calling LLM at {endpoint} with model {model}")
                response = await client.post(endpoint, headers=headers, json=payload)
                
                if response.status_code != 200:
                    logger.error(f"LLM Error {response.status_code}: {response.text}")
                    raise Exception(f"LLM Provider Error: {response.text}")
                
                data = response.json()
                content = data['choices'][0]['message']['content']
                
                # Parse JSON
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    # Fallback to simple extraction if markdown ticks included
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0]
                        return json.loads(content)
                    raise
                
        except Exception as e:
            logger.error(f"LLM Exception: {e}")
            raise e

ai_service = AIService()
