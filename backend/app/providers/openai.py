import httpx
from .base import LLMProvider
from ..config import settings


class OpenAIProvider(LLMProvider):
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY required")
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {self.api_key}"}
        )

    async def complete(self, prompt: str, max_tokens: int = 1000) -> str:
        response = await self.client.post(
            "https://api.openai.com/v1/chat/completions",
            json={
                "model": "gpt-3.5-turbo",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens
            }
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    async def translate(self, text: str, target_lang: str) -> str:
        prompt = f"Translate the following text to {target_lang}:\n\n{text}"
        return await self.complete(prompt, max_tokens=500)

    async def summarize(self, text: str) -> str:
        prompt = f"Summarize the following text in 2-3 sentences:\n\n{text}"
        return await self.complete(prompt, max_tokens=300)
