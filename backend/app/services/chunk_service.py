import re
from typing import List, Dict, Any
from loguru import logger

from ..config import settings


class ChunkService:
    """Service for chunking document text into manageable pieces for RAG."""
    
    def __init__(self):
        self.target_tokens = settings.RAG_BLOCK_TARGET_TOKENS  # 400
        self.max_tokens = settings.RAG_BLOCK_MAX_TOKENS  # 800 (hard limit)
        self.overlap_tokens = settings.RAG_BLOCK_OVERLAP_TOKENS  # 80
    
    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text.
        
        For CJK languages: tokens ≈ characters × 1.25 / 4
        For English: tokens ≈ words × 1.3
        """
        if not text:
            return 0
        
        # Check if text contains CJK characters
        cjk_pattern = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff]')
        has_cjk = bool(cjk_pattern.search(text))
        
        if has_cjk:
            # CJK token estimation
            return int(len(text) * 1.25 / 4)
        else:
            # English token estimation
            words = len(text.split())
            return int(words * 1.3)
    
    def split_text_by_sentences(self, text: str) -> List[str]:
        """Split text into sentences while preserving structure."""
        if not text:
            return []
        
        # Enhanced sentence splitting pattern
        # Handles periods, exclamation marks, question marks, and CJK punctuation
        sentence_pattern = re.compile(
            r'([.!?。！？]+)\s*',
            re.MULTILINE | re.DOTALL
        )
        
        sentences = sentence_pattern.split(text)
        
        # Reconstruct sentences with their punctuation
        result = []
        for i in range(0, len(sentences) - 1, 2):
            sentence = sentences[i]
            if i + 1 < len(sentences):
                punctuation = sentences[i + 1]
                sentence += punctuation
            
            sentence = sentence.strip()
            if sentence:
                result.append(sentence)
        
        # Handle the last part if it doesn't end with punctuation
        if len(sentences) % 2 == 1 and sentences[-1].strip():
            result.append(sentences[-1].strip())
        
        return result
    
    def create_chunk(self, sentences: List[str], start_idx: int, target_tokens: int) -> tuple[str, int]:
        """Create a chunk from sentences starting at start_idx.
        
        Returns:
            tuple: (chunk_text, end_idx)
        """
        if start_idx >= len(sentences):
            return "", start_idx
        
        chunk_text = ""
        current_tokens = 0
        end_idx = start_idx
        
        for i in range(start_idx, len(sentences)):
            sentence = sentences[i]
            sentence_tokens = self.estimate_tokens(sentence)
            
            # Check if adding this sentence would exceed limits
            if current_tokens + sentence_tokens > target_tokens and chunk_text:
                break
            
            # Hard limit check
            if sentence_tokens > self.max_tokens:
                # Split long sentence
                words = sentence.split()
                if words:
                    # Take as many words as possible within max_tokens
                    partial_sentence = ""
                    for word in words:
                        test_sentence = partial_sentence + (" " if partial_sentence else "") + word
                        if self.estimate_tokens(test_sentence) <= self.max_tokens:
                            partial_sentence = test_sentence
                        else:
                            break
                    
                    if partial_sentence:
                        if chunk_text:
                            chunk_text += " " + partial_sentence
                        else:
                            chunk_text = partial_sentence
                        current_tokens = self.estimate_tokens(chunk_text)
                break
            
            # Add sentence to chunk
            if chunk_text:
                chunk_text += " " + sentence
            else:
                chunk_text = sentence
            
            current_tokens += sentence_tokens
            end_idx = i + 1
        
        return chunk_text, end_idx
    
    def calculate_overlap_start(self, sentences: List[str], end_idx: int, overlap_tokens: int) -> int:
        """Calculate the starting index for the next chunk considering overlap."""
        if end_idx <= 0:
            return end_idx
        
        # Work backwards from end_idx to find overlap start
        current_tokens = 0
        overlap_start = end_idx
        
        for i in range(end_idx - 1, -1, -1):
            sentence_tokens = self.estimate_tokens(sentences[i])
            if current_tokens + sentence_tokens > overlap_tokens:
                break
            current_tokens += sentence_tokens
            overlap_start = i
        
        return overlap_start
    
    def make_chunks(self, document_id: str, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create chunks from document pages.
        
        Args:
            document_id: The document ID
            pages: List of page dictionaries with keys: page_num, text
        
        Returns:
            List of chunk dictionaries with keys: chunk_index, content, page_start, page_end
        """
        if not pages:
            return []
        
        try:
            chunks = []
            chunk_index = 0
            
            for page in pages:
                page_num = page.get('page_num', 1)
                page_text = page.get('text', '').strip()
                
                if not page_text:
                    continue
                
                # Split page text into sentences
                sentences = self.split_text_by_sentences(page_text)
                if not sentences:
                    continue
                
                # Create chunks from this page
                sentence_idx = 0
                
                while sentence_idx < len(sentences):
                    chunk_text, next_idx = self.create_chunk(
                        sentences, sentence_idx, self.target_tokens
                    )
                    
                    if not chunk_text:
                        break
                    
                    # Create chunk record
                    chunk = {
                        'chunk_index': chunk_index,
                        'content': chunk_text,
                        'page_start': page_num,
                        'page_end': page_num  # Single page for now
                    }
                    
                    chunks.append(chunk)
                    chunk_index += 1
                    
                    # Calculate next starting position with overlap
                    if next_idx >= len(sentences):
                        break
                    
                    overlap_start = self.calculate_overlap_start(
                        sentences, next_idx, self.overlap_tokens
                    )
                    sentence_idx = max(overlap_start, sentence_idx + 1)
            
            logger.info(f"Created {len(chunks)} chunks for document {document_id}")
            
            # Log chunk statistics
            if chunks:
                token_counts = [self.estimate_tokens(chunk['content']) for chunk in chunks]
                avg_tokens = sum(token_counts) / len(token_counts)
                max_tokens = max(token_counts)
                min_tokens = min(token_counts)
                
                logger.info(
                    f"Chunk statistics - Avg: {avg_tokens:.1f}, "
                    f"Max: {max_tokens}, Min: {min_tokens} tokens"
                )
            
            return chunks
            
        except Exception as e:
            logger.error(f"Error creating chunks for document {document_id}: {e}")
            raise e


# Global instance
chunk_service = ChunkService()