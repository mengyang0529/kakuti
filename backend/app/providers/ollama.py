import httpx
from .base import LLMProvider
from ..config import settings


class OllamaProvider(LLMProvider):
    def __init__(self):
        self.endpoint = settings.OLLAMA_ENDPOINT
        self.client = httpx.AsyncClient()

    async def complete(self, prompt: str, max_tokens: int = 1000) -> str:
        response = await self.client.post(
            f"{self.endpoint}/api/generate",
            json={
                "model": "llama3.2:3b",
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": max_tokens}
            }
        )
        response.raise_for_status()
        return response.json()["response"]

    async def translate(self, text: str, target_lang: str) -> str:
        prompt = f"Translate the following text to {target_lang}:\n\n{text}\n\nTranslation:"
        return await self.complete(prompt, max_tokens=500)

    async def summarize(self, text: str) -> str:
        prompt = f"Summarize the following text in 2-3 sentences:\n\n{text}\n\nSummary:"
        return await self.complete(prompt, max_tokens=300)
