import time
import numpy as np
from typing import List, Optional
from loguru import logger
import google.generativeai as genai

from ..config import settings


class RAGEmbeddingService:
    """Service for generating text embeddings using Google's embedding models for RAG."""
    
    def __init__(self):
        self.model_name = settings.RAG_EMBEDDING_MODEL  # text-embedding-004
        self.batch_size = 128  # Google API batch limit
        self.max_retries = 3
        self.base_delay = 1.0  # Base delay for exponential backoff
        
        # Prefer Google AI embeddings if key provided; otherwise fall back to local embeddings
        api_key = settings.GOOGLE_API_KEY or settings.GEMINI_API_KEY
        self._use_google = bool(api_key)
        self._local_provider = None

        if self._use_google:
            try:
                genai.configure(api_key=api_key)
                logger.info("RAGEmbeddingService: Using Google embeddings")
            except Exception as e:
                logger.warning(f"Failed to configure Google embeddings, falling back to local: {e}")
                self._use_google = False
        if not self._use_google:
            try:
                from ..providers.embeddings import LocalEmbeddingProvider
                self._local_provider = LocalEmbeddingProvider()
                logger.info("RAGEmbeddingService: Using local embeddings provider")
            except Exception as e:
                logger.error(f"Failed to initialize local embedding provider: {e}")
                self._local_provider = None
    
    def _exponential_backoff(self, attempt: int) -> float:
        """Calculate exponential backoff delay."""
        return self.base_delay * (2 ** attempt)
    
    def _normalize_vector(self, vector: np.ndarray) -> np.ndarray:
        """Normalize vector to unit length."""
        norm = np.linalg.norm(vector)
        if norm == 0:
            return vector
        return vector / norm
    
    def _embed_batch(self, texts: List[str]) -> np.ndarray:
        """Embed a batch of texts with retry logic."""
        # Local fallback path
        if not self._use_google and self._local_provider is not None:
            try:
                import asyncio
                # Handle async call properly
                vecs = asyncio.run(self._local_provider.embed_texts(texts))
                # Normalize each embedding to unit length
                normalized = np.array([self._normalize_vector(v) for v in vecs], dtype=np.float32)
                return normalized
            except Exception as e:
                logger.error(f"Local embedding failed: {e}")
                raise

        for attempt in range(self.max_retries):
            try:
                # Use Google's embedding model
                result = genai.embed_content(
                    model=f"models/{self.model_name}",
                    content=texts,
                    task_type="retrieval_document"
                )
                
                # Extract embeddings
                embeddings = []
                if hasattr(result, 'embedding'):
                    # Single text case
                    embeddings = [result.embedding]
                elif hasattr(result, 'embeddings'):
                    # Batch case
                    embeddings = result.embeddings
                else:
                    # Try to access as dict
                    if isinstance(result, dict):
                        if 'embedding' in result:
                            embeddings = [result['embedding']]
                        elif 'embeddings' in result:
                            embeddings = result['embeddings']
                
                if not embeddings:
                    raise ValueError("No embeddings returned from API")
                
                # Handle the case where Google API returns [array_of_all_embeddings] instead of [emb1, emb2, ...]
                if len(embeddings) == 1 and len(texts) > 1:
                    # Google API returned all embeddings as a single array
                    embeddings_array = np.array(embeddings[0], dtype=np.float32)
                else:
                    # Normal case: list of individual embeddings
                    embeddings_array = np.array(embeddings, dtype=np.float32)
                
                # Normalize each embedding to unit length
                normalized_embeddings = np.array([
                    self._normalize_vector(emb) for emb in embeddings_array
                ])
                
                return normalized_embeddings
                
            except Exception as e:
                error_msg = str(e).lower()
                
                # Check for rate limiting
                if "429" in error_msg or "rate limit" in error_msg or "quota" in error_msg:
                    if attempt < self.max_retries - 1:
                        delay = self._exponential_backoff(attempt)
                        logger.warning(
                            f"Rate limited on attempt {attempt + 1}, "
                            f"retrying in {delay:.1f}s: {e}"
                        )
                        time.sleep(delay)
                        continue
                
                # Check for other retryable errors
                if attempt < self.max_retries - 1 and (
                    "timeout" in error_msg or 
                    "connection" in error_msg or
                    "503" in error_msg or
                    "502" in error_msg
                ):
                    delay = self._exponential_backoff(attempt)
                    logger.warning(
                        f"Retryable error on attempt {attempt + 1}, "
                        f"retrying in {delay:.1f}s: {e}"
                    )
                    time.sleep(delay)
                    continue
                
                # Non-retryable error or max retries reached
                logger.error(f"Embedding failed after {attempt + 1} attempts: {e}")
                raise e
        
        raise Exception(f"Failed to embed batch after {self.max_retries} attempts")
    
    def embed_texts(self, texts: List[str]) -> np.ndarray:
        """Embed multiple texts with batching and retry logic.
        
        Args:
            texts: List of texts to embed
        
        Returns:
            np.ndarray: Array of normalized embeddings with shape (n, EMBED_DIM)
        """
        if not texts:
            return np.array([], dtype=np.float32).reshape(0, settings.EMBED_DIM)
        
        try:
            all_embeddings = []
            
            # Process in batches
            for i in range(0, len(texts), self.batch_size):
                batch = texts[i:i + self.batch_size]
                
                logger.debug(f"Embedding batch {i//self.batch_size + 1}/{(len(texts)-1)//self.batch_size + 1} "
                           f"({len(batch)} texts)")
                
                batch_embeddings = self._embed_batch(batch)
                all_embeddings.append(batch_embeddings)
                
                # Small delay between batches to be respectful
                if i + self.batch_size < len(texts):
                    time.sleep(0.1)
            
            # Concatenate all embeddings
            if not all_embeddings:
                result = np.array([], dtype=np.float32).reshape(0, settings.EMBED_DIM)
            elif len(all_embeddings) == 1:
                result = all_embeddings[0]  # Single batch, no need to stack
            else:
                result = np.vstack(all_embeddings)  # Multiple batches, stack them
            
            logger.info(f"Successfully embedded {len(texts)} texts, output shape: {result.shape}")
            return result
            
        except Exception as e:
            logger.error(f"Error embedding {len(texts)} texts: {e}")
            raise e
    
    def embed_query(self, text: str) -> List[float]:
        """Embed a single query text.
        
        Args:
            text: Query text to embed
        
        Returns:
            List[float]: Normalized embedding vector
        """
        if not text:
            return [0.0] * settings.EMBED_DIM  # Return zero vector for empty text
        
        try:
            # Local fallback path
            if not self._use_google and self._local_provider is not None:
                import asyncio
                # Handle async call properly
                vecs = asyncio.run(self._local_provider.embed_texts([text]))
                vec = vecs[0]
                vec = self._normalize_vector(np.array(vec, dtype=np.float32))
                return vec.tolist()

            for attempt in range(self.max_retries):
                try:
                    # Use retrieval_query task type for queries
                    result = genai.embed_content(
                        model=f"models/{self.model_name}",
                        content=text,
                        task_type="retrieval_query"
                    )
                    
                    # Extract embedding
                    embedding = None
                    if hasattr(result, 'embedding'):
                        embedding = result.embedding
                    elif isinstance(result, dict) and 'embedding' in result:
                        embedding = result['embedding']
                    
                    if embedding is None:
                        raise ValueError("No embedding returned from API")
                    
                    # Convert to numpy array and normalize
                    embedding_array = np.array(embedding, dtype=np.float32)
                    normalized_embedding = self._normalize_vector(embedding_array)
                    
                    return normalized_embedding.tolist()
                    
                except Exception as e:
                    error_msg = str(e).lower()
                    
                    # Handle rate limiting and retryable errors
                    if ("429" in error_msg or "rate limit" in error_msg or 
                        "timeout" in error_msg or "connection" in error_msg) and attempt < self.max_retries - 1:
                        delay = self._exponential_backoff(attempt)
                        logger.warning(f"Query embedding retry {attempt + 1}, waiting {delay:.1f}s: {e}")
                        time.sleep(delay)
                        continue
                    
                    raise e
            
            raise Exception(f"Failed to embed query after {self.max_retries} attempts")
            
        except Exception as e:
            logger.error(f"Error embedding query text: {e}")
            raise e
    
    def get_embedding_dimension(self) -> int:
        """Get the dimension of embeddings produced by this service."""
        if self._local_provider is not None and not self._use_google:
            return self._local_provider.dimension
        # Fallback to configured dim (unknown for Google until first call)
        return settings.EMBED_DIM


# Global instance
rag_embedding_service = RAGEmbeddingService()
