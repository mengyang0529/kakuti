import numpy as np
from sentence_transformers import SentenceTransformer
from .base import EmbeddingProvider
from ..config import settings


class LocalEmbeddingProvider(EmbeddingProvider):
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')  # 384d
        self._dim = self.model.get_sentence_embedding_dimension()

    async def embed_texts(self, texts: list[str]) -> np.ndarray:
        return self.model.encode(texts)

    @property
    def dimension(self) -> int:
        return self._dim


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self):
        import httpx
        self.api_key = settings.OPENAI_API_KEY
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY required")
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        # Determine model and corresponding dimension
        self.model = settings.OPENAI_EMBEDDING_MODEL
        dim_map = {
            "text-embedding-ada-002": 1536,
            "text-embedding-3-small": 1536,
            "text-embedding-3-large": 3072,
        }
        # Fallback to configured EMBED_DIM if model unknown
        self._dim = dim_map.get(self.model, settings.EMBED_DIM)

    async def embed_texts(self, texts: list[str]) -> np.ndarray:
        embeddings = []
        for text in texts:
            response = await self.client.post(
                "https://api.openai.com/v1/embeddings",
                json={"input": text, "model": self.model}
            )
            response.raise_for_status()
            embeddings.append(response.json()["data"][0]["embedding"])
        return np.array(embeddings)

    @property
    def dimension(self) -> int:
        return self._dim
