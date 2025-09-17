import tiktoken
from typing import List, Dict, Any, Tuple
from loguru import logger

from ..config import settings


class PromptPacker:
    """Service for packing query and contexts into prompts with strict token budgets."""
    
    def __init__(self):
        # Use cl100k_base encoding (used by GPT-4 and similar models)
        try:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception:
            # Fallback to a simple character-based estimation
            self.tokenizer = None
            logger.warning("Failed to load tiktoken, using character-based token estimation")
        
        # Token budget configuration
        self.max_context_tokens = settings.RAG_MAX_CONTEXT_TOKENS  # 1800
        self.block_max_tokens = settings.RAG_BLOCK_MAX_TOKENS  # 300
        self.target_context_tokens = 1400  # Leave room for query and response
    
    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count for text.
        
        Args:
            text: Input text
        
        Returns:
            int: Estimated token count
        """
        if not text:
            return 0
        
        if self.tokenizer:
            try:
                return len(self.tokenizer.encode(text))
            except Exception:
                pass
        
        # Fallback: character-based estimation
        # For mixed CJK/English: CJK chars ≈ 1.25 tokens, English ≈ 0.25 tokens per char
        cjk_chars = sum(1 for char in text if ord(char) > 127)
        ascii_chars = len(text) - cjk_chars
        
        estimated_tokens = int(cjk_chars * 1.25 + ascii_chars * 0.25)
        return max(1, estimated_tokens)  # At least 1 token
    
    def _truncate_text(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within token limit.
        
        Args:
            text: Input text
            max_tokens: Maximum allowed tokens
        
        Returns:
            str: Truncated text
        """
        if not text or max_tokens <= 0:
            return ""
        
        current_tokens = self._estimate_tokens(text)
        if current_tokens <= max_tokens:
            return text
        
        # Binary search for optimal truncation point
        left, right = 0, len(text)
        best_text = ""
        
        while left <= right:
            mid = (left + right) // 2
            candidate = text[:mid]
            
            if self._estimate_tokens(candidate) <= max_tokens:
                best_text = candidate
                left = mid + 1
            else:
                right = mid - 1
        
        # Try to end at a word boundary
        if best_text and not best_text.endswith(' '):
            last_space = best_text.rfind(' ')
            if last_space > len(best_text) * 0.8:  # Only if we don't lose too much
                best_text = best_text[:last_space]
        
        return best_text.strip()
    
    def _format_citation(self, context: Dict[str, Any], index: int) -> str:
        """Format a citation for a context.
        
        Args:
            context: Context dict with page_start, page_end, score
            index: Citation index (1-based)
        
        Returns:
            str: Formatted citation
        """
        page_start = context.get('page_start', 1)
        page_end = context.get('page_end', page_start)
        score = context.get('score', 0.0)
        
        if page_start == page_end:
            return f"[{index}] Page {page_start} (relevance: {score:.2f})"
        else:
            return f"[{index}] Pages {page_start}-{page_end} (relevance: {score:.2f})"
    
    def pack(self, query: str, contexts: List[Dict[str, Any]], 
             config: Dict[str, Any] = None) -> Dict[str, Any]:
        """Pack query and contexts into a prompt with strict token budget.
        
        Args:
            query: User query
            contexts: List of context dicts with 'content', 'page_start', 'page_end', 'score'
            config: Optional configuration overrides
        
        Returns:
            Dict with 'prompt', 'citations', 'tokens_in_est', 'contexts_used'
        """
        if not query:
            return {
                'prompt': '',
                'citations': [],
                'tokens_in_est': 0,
                'contexts_used': 0
            }
        
        try:
            # Apply config overrides
            max_context_tokens = config.get('max_context_tokens', self.target_context_tokens) if config else self.target_context_tokens
            block_max_tokens = config.get('block_max_tokens', self.block_max_tokens) if config else self.block_max_tokens
            
            # Estimate query tokens
            query_tokens = self._estimate_tokens(query)
            
            # Calculate available tokens for contexts
            # Reserve tokens for prompt template and formatting
            template_overhead = 200  # Estimated tokens for prompt template
            available_tokens = max_context_tokens - query_tokens - template_overhead
            
            if available_tokens <= 0:
                logger.warning(f"Query too long ({query_tokens} tokens), no room for context")
                return {
                    'prompt': f"Query: {query}\n\nNo context available due to query length.",
                    'citations': [],
                    'tokens_in_est': query_tokens + template_overhead,
                    'contexts_used': 0
                }
            
            # Process contexts and fit within budget
            selected_contexts = []
            citations = []
            used_tokens = 0
            
            for i, context in enumerate(contexts):
                content = context.get('content', '').strip()
                if not content:
                    continue
                
                # Truncate content to block limit
                truncated_content = self._truncate_text(content, block_max_tokens)
                if not truncated_content:
                    continue
                
                content_tokens = self._estimate_tokens(truncated_content)
                
                # Check if we can fit this context
                if used_tokens + content_tokens <= available_tokens:
                    selected_contexts.append({
                        **context,
                        'content': truncated_content,
                        'tokens': content_tokens
                    })
                    
                    citation = self._format_citation(context, len(citations) + 1)
                    citations.append(citation)
                    
                    used_tokens += content_tokens
                else:
                    # Try to fit a smaller portion
                    remaining_tokens = available_tokens - used_tokens
                    if remaining_tokens > 50:  # Only if meaningful space left
                        partial_content = self._truncate_text(content, remaining_tokens)
                        if partial_content and len(partial_content) > 20:  # Minimum useful length
                            selected_contexts.append({
                                **context,
                                'content': partial_content,
                                'tokens': remaining_tokens
                            })
                            
                            citation = self._format_citation(context, len(citations) + 1)
                            citations.append(citation)
                            
                            used_tokens = available_tokens
                    break
            
            # Build the prompt
            if selected_contexts:
                context_section = "\n\n".join([
                    f"Context {i+1}:\n{ctx['content']}"
                    for i, ctx in enumerate(selected_contexts)
                ])
                
                prompt = f"""Based on the following context, please answer the user's question. If the question is in Chinese, answer in Chinese. If the question is in English, answer in English. Provide a concise and accurate response, and cite relevant sources using the reference numbers.

Context:
{context_section}

Question: {query}

Answer (be concise and cite sources):"""
            else:
                prompt = f"""No relevant context found for the question. Please provide a general response based on your knowledge. If the question is in Chinese, answer in Chinese. If the question is in English, answer in English.

Question: {query}

Answer:"""
            
            # Calculate final token estimate
            total_tokens = self._estimate_tokens(prompt)
            
            result = {
                'prompt': prompt,
                'citations': citations,
                'tokens_in_est': total_tokens,
                'contexts_used': len(selected_contexts)
            }
            
            logger.debug(
                f"Packed prompt: {total_tokens} tokens, {len(selected_contexts)} contexts, "
                f"{len(citations)} citations"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error packing prompt: {e}")
            # Fallback: simple prompt without context
            fallback_prompt = f"Question: {query}\n\nAnswer:"
            return {
                'prompt': fallback_prompt,
                'citations': [],
                'tokens_in_est': self._estimate_tokens(fallback_prompt),
                'contexts_used': 0
            }


# Global instance
prompt_packer = PromptPacker()