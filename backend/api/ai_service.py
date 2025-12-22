import os
import httpx
import logging
import base64
import json
from typing import List, Dict, Optional, Union, Any

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

    async def call_vlm_analyze(
        self,
        image_b64: str,
        object_name: str,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: str = "gpt-4o"
    ) -> List[str]:
        """
        Analyzes the image and returns a list of potential parts (categories).
        """
        prompt = f"""
        Analyze this 2x2 grid of images showing a 3D model of a {object_name} from 4 different angles (Front, Right, Back, Left).
        The image shows the object in its natural state (no highlights, close-up view).
        Break it down into its constituent parts/components (e.g. for a Car: Wheels, Doors, Windows, Roof, Chassis).
        Return purely a JSON list of strings representing these part categories.
        Do not include "Background" or "Ground". Do not output single letters.
        Example: ["Wheel", "Body", "Glass", "Interior"]
        """
        
        # Reuse rename logic structure but with different processing
        content = await self.call_vlm_rename(image_b64, prompt, api_url, api_key, model)
        
        try:
            content = content.strip()
            
            # 1. Try to find a JSON list pattern: ["...", "..."]
            import re
            json_match = re.search(r'\[.*?\]', content, re.DOTALL)
            if json_match:
                try:
                    return [str(x).strip() for x in json.loads(json_match.group(0)) if str(x).strip()]
                except:
                    pass # Fallback to manual parsing if JSON load fails
            
            # 2. Manual Cleanup & Splitting
            # Remove Markdown code blocks
            clean_content = re.sub(r'```[a-z]*', '', content).replace('```', '')
            
            # Remove brackets and quotes
            clean_content = clean_content.replace('[', '').replace(']', '').replace('"', '').replace("'", "")
            
            # Split and clean items
            raw_items = clean_content.split(',')
            cleaned_items = []
            for item in raw_items:
                # Remove common hallucinated prefixes/suffixes and whitespace
                item = item.strip().lstrip('_').lstrip('-').strip()
                if item:
                    cleaned_items.append(item)
            
            if not cleaned_items:
                return ["Main"] # Fallback if empty
                
            return cleaned_items

        except Exception as e:
            logger.error(f"Failed to parse analysis result: {content}, Error: {e}")
            return ["Main"]

    async def call_vlm_classify(
        self,
        image_b64: str,
        categories: List[str],
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: str = "gpt-4o"
    ) -> str:
        """
        Classifies the highlighted part in the image into one of the provided categories.
        """
        cats_str = ", ".join(categories)
        prompt = f"""
        Look at the object highlighted with a RED OUTLINE in this 2x2 grid of images (showing 4 different view angles).
        Classify it into EXACTLY one of the following categories: [{cats_str}].
        If it doesn't fit well, pick the closest one or "Misc".
        Reply ONLY with the category name. Do not explain.
        """
        
        result = await self.call_vlm_rename(image_b64, prompt, api_url, api_key, model)
        
        # Simple cleanup
        result = result.strip().replace('"', '').replace('.', '')
        
        # Validation (fuzzy match could be added here)
        for cat in categories:
            if cat.lower() in result.lower():
                return cat
        
        return result 
            
            
    async def call_llm_group(
        self, 
        scene_graph_data: Any, 
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

        logger.info(f"LLM Data Type: {type(scene_graph_data)}")
        logger.info(f"LLM Data Preview: {str(scene_graph_data)[:200]}...")

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
        Your task is to organize a simplified list of 3D parts into logical groups based on their names.

        INPUT FORMAT:
        A list of objects: [{"id": "uuid", "name": "part_name"}, ...]

        OUTPUT FORMAT:
        Return a JSON object with a "groups" key containing a list of groups.
        Each group MUST have:
        - "name": string (Descriptive group name, e.g., "Wheels", "Body", "Interior")
        - "ids": list of strings (The UUIDs of parts that belong to this group)

        EXAMPLE OUTPUT:
        {
            "groups": [
                { "name": "Wheels", "ids": ["uuid1", "uuid2", "uuid3", "uuid4"] },
                { "name": "Body", "ids": ["uuid5", "uuid6"] }
            ]
        }

        RULES:
        1. Every input ID must be assigned to exactly one group.
        2. Do NOT invent new IDs. Use ONLY the IDs provided in the Input Data.
        3. Do NOT return the example data. Process the Input Data provided below.
        4. Group parts logically by their function or location (e.g. all tires together, all windows together).
        5. Return ONLY valid JSON.
        """

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{prompt}\n\nData:\n{json.dumps(scene_graph_data)}"}
            ],
            # "response_format": {"type": "json_object"} # Removed for broader compatibility with Llama/vLLM
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
                
                data = response.json()
                content = data['choices'][0]['message']['content']
                logger.info(f"LLM Response Content: {content}")
                
                # Parse JSON Robustly
                try:
                    # 1. Try direct parse
                    return json.loads(content)
                except json.JSONDecodeError:
                    # 2. Extract from markdown blocks
                    if "```" in content:
                        # Find the first block that looks like it contains our data
                        import re
                        matches = re.findall(r"```(?:json)?(.*?)```", content, re.DOTALL)
                        for match in matches:
                            try:
                                return json.loads(match.strip())
                            except:
                                continue
                    
                    # 3. Last ditch: Extract substring from first { to last }
                    try:
                        start_idx = content.find('{')
                        end_idx = content.rfind('}')
                        if start_idx != -1 and end_idx != -1:
                            json_str = content[start_idx : end_idx + 1]
                            return json.loads(json_str)
                    except:
                        pass
                        
                    logger.error(f"Failed to parse JSON from: {content}")
                    raise
                
        except Exception as e:
            logger.error(f"LLM Exception: {e}")
            raise e

ai_service = AIService()
