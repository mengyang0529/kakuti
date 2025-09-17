import numpy as np
from typing import List, Dict, Any
from loguru import logger


class MMRService:
    """Service for Maximum Marginal Relevance (MMR) selection.
    
    MMR balances relevance and diversity when selecting documents/chunks.
    """
    
    def __init__(self):
        pass
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors.
        
        Args:
            vec1: First vector
            vec2: Second vector
        
        Returns:
            float: Cosine similarity score
        """
        # Ensure vectors are normalized (they should be from embedding service)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        # For normalized vectors, dot product equals cosine similarity
        return float(np.dot(vec1, vec2))
    
    def _calculate_max_similarity(self, candidate_embedding: np.ndarray, 
                                selected_embeddings: List[np.ndarray]) -> float:
        """Calculate maximum similarity between candidate and selected items.
        
        Args:
            candidate_embedding: Embedding of candidate item
            selected_embeddings: List of embeddings of already selected items
        
        Returns:
            float: Maximum similarity score
        """
        if not selected_embeddings:
            return 0.0
        
        similarities = [
            self._cosine_similarity(candidate_embedding, selected_emb)
            for selected_emb in selected_embeddings
        ]
        
        return max(similarities)
    
    def mmr(self, candidates: List[Dict[str, Any]], k: int, lambda_: float = 0.5) -> List[int]:
        """Select k items using Maximum Marginal Relevance.
        
        Args:
            candidates: List of candidate items, each must have 'embedding' and 'score' keys
            k: Number of items to select
            lambda_: Balance parameter (0.0 = pure diversity, 1.0 = pure relevance)
        
        Returns:
            List[int]: Indices of selected candidates in order of selection
        """
        if not candidates:
            return []
        
        if k <= 0:
            return []
        
        if k >= len(candidates):
            # Return all candidates in order of relevance score
            return list(range(len(candidates)))
        
        try:
            # Validate input
            for i, candidate in enumerate(candidates):
                if 'embedding' not in candidate or 'score' not in candidate:
                    raise ValueError(f"Candidate {i} missing 'embedding' or 'score' key")
                
                if not isinstance(candidate['embedding'], (list, np.ndarray)):
                    raise ValueError(f"Candidate {i} embedding must be list or numpy array")
            
            # Convert embeddings to numpy arrays
            embeddings = []
            for candidate in candidates:
                emb = candidate['embedding']
                if isinstance(emb, list):
                    emb = np.array(emb, dtype=np.float32)
                embeddings.append(emb)
            
            # Get relevance scores
            relevance_scores = [candidate['score'] for candidate in candidates]
            
            # Normalize relevance scores to [0, 1] range
            min_score = min(relevance_scores)
            max_score = max(relevance_scores)
            if max_score > min_score:
                normalized_scores = [
                    (score - min_score) / (max_score - min_score)
                    for score in relevance_scores
                ]
            else:
                normalized_scores = [1.0] * len(relevance_scores)
            
            selected_indices = []
            selected_embeddings = []
            remaining_indices = list(range(len(candidates)))
            
            # Select k items iteratively
            for _ in range(k):
                if not remaining_indices:
                    break
                
                best_score = float('-inf')
                best_idx = None
                best_remaining_pos = None
                
                # Calculate MMR score for each remaining candidate
                for pos, idx in enumerate(remaining_indices):
                    relevance = normalized_scores[idx]
                    
                    # Calculate maximum similarity to already selected items
                    max_sim = self._calculate_max_similarity(
                        embeddings[idx], selected_embeddings
                    )
                    
                    # MMR score: λ * relevance - (1-λ) * max_similarity
                    mmr_score = lambda_ * relevance - (1 - lambda_) * max_sim
                    
                    if mmr_score > best_score:
                        best_score = mmr_score
                        best_idx = idx
                        best_remaining_pos = pos
                
                # Select the best candidate
                if best_idx is not None:
                    selected_indices.append(best_idx)
                    selected_embeddings.append(embeddings[best_idx])
                    remaining_indices.pop(best_remaining_pos)
                else:
                    # Fallback: select by relevance
                    best_idx = remaining_indices[0]
                    selected_indices.append(best_idx)
                    selected_embeddings.append(embeddings[best_idx])
                    remaining_indices.pop(0)
            
            logger.debug(
                f"MMR selected {len(selected_indices)} items from {len(candidates)} candidates "
                f"(k={k}, lambda={lambda_})"
            )
            
            return selected_indices
            
        except Exception as e:
            logger.error(f"Error in MMR selection: {e}")
            # Fallback: return top-k by relevance score
            sorted_indices = sorted(
                range(len(candidates)), 
                key=lambda i: candidates[i]['score'], 
                reverse=True
            )
            return sorted_indices[:k]
    
    def mmr_with_page_grouping(self, candidates: List[Dict[str, Any]], k: int, 
                              lambda_: float = 0.5) -> List[int]:
        """MMR selection with optional page-adjacent chunk merging consideration.
        
        This is a placeholder for future enhancement where adjacent chunks
        from the same page could be merged after MMR selection.
        
        Args:
            candidates: List of candidate items with 'embedding', 'score', 
                       'page_start', 'page_end' keys
            k: Number of items to select
            lambda_: Balance parameter
        
        Returns:
            List[int]: Indices of selected candidates
        """
        # For now, just use regular MMR
        # Future enhancement: group adjacent chunks from same page
        return self.mmr(candidates, k, lambda_)


# Global instance
mmr_service = MMRService()