import numpy as np
from typing import List
from loguru import logger
from ..providers import get_embedding_provider
from ..repositories.embeddings import EmbeddingsRepository


class EmbeddingService:
    def __init__(self):
        self.embedding_provider = get_embedding_provider()
        self.embeddings_repo = EmbeddingsRepository()

    async def generate_document_embedding(self, doc_id: str, text: str) -> bool:
        """Generate and store embedding for a document"""
        try:
            # Split text into chunks if too long
            chunks = self._chunk_text(text, max_length=1000)
            
            # Generate embeddings for chunks
            embeddings = await self.embedding_provider.embed_texts(chunks)
            
            # Use mean of chunk embeddings as document embedding
            doc_embedding = np.mean(embeddings, axis=0)
            
            # Store embedding
            self.embeddings_repo.store_embedding(doc_id, doc_embedding)
            
            logger.info(f"Generated embedding for document {doc_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to generate embedding for {doc_id}: {e}")
            return False

    def _chunk_text(self, text: str, max_length: int = 1000) -> List[str]:
        """Split text into chunks of max_length"""
        words = text.split()
        chunks = []
        current_chunk = []
        current_length = 0
        
        for word in words:
            if current_length + len(word) + 1 > max_length:
                if current_chunk:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = [word]
                    current_length = len(word)
                else:
                    # Single word is too long, truncate it
                    chunks.append(word[:max_length])
                    current_chunk = []
                    current_length = 0
            else:
                current_chunk.append(word)
                current_length += len(word) + 1
        
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        
        return chunks
