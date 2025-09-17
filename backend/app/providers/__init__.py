from .base import LLMProvider, EmbeddingProvider
from .ollama import OllamaProvider
from .openai import OpenAIProvider
from .gemini import GeminiProvider
from .embeddings import LocalEmbeddingProvider, OpenAIEmbeddingProvider
from ..config import settings

def get_llm_provider() -> LLMProvider:
    print(f"LLM_PROVIDER setting: {settings.LLM_PROVIDER}")
    if settings.LLM_PROVIDER == "openai":
        print("Using OpenAI provider")
        return OpenAIProvider()
    elif settings.LLM_PROVIDER == "ollama":
        print("Using Ollama provider")
        return OllamaProvider()
    elif settings.LLM_PROVIDER == "gemini":
        print("Using Gemini provider")
        return GeminiProvider()
    else:
        raise ValueError(f"Unknown LLM provider: {settings.LLM_PROVIDER}")


def get_embedding_provider() -> EmbeddingProvider:
    if settings.EMBEDDING_PROVIDER == "openai":
        return OpenAIEmbeddingProvider()
    elif settings.EMBEDDING_PROVIDER == "local":
        return LocalEmbeddingProvider()
    else:
        raise ValueError(f"Unknown embedding provider: {settings.EMBEDDING_PROVIDER}")
