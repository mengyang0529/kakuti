from abc import ABC, abstractmethod
from typing import List, Optional
import numpy as np


class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, prompt: str, max_tokens: int = 1000) -> str:
        pass

    @abstractmethod
    async def translate(self, text: str, target_lang: str) -> str:
        pass

    @abstractmethod
    async def summarize(self, text: str) -> str:
        pass


class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed_texts(self, texts: List[str]) -> np.ndarray:
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        pass
