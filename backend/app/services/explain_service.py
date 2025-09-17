from typing import List, Dict, Optional, Any
from loguru import logger
from .. import db
from ..repositories.documents import DocumentsRepository as DocumentRepository

# Handle optional LLM provider
try:
    from ..providers import get_llm_provider
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False


class ExplainService:
    def __init__(self):
        if LLM_AVAILABLE:
            try:
                self.llm = get_llm_provider()
                logger.info(f"LLM provider initialized for explain service: {self.llm}")
            except Exception as e:
                logger.error(f"Error initializing LLM provider: {e}")
                self.llm = None
        else:
            self.llm = None
            logger.warning("LLM not available for explain service")
        
        self.document_repo = DocumentRepository()
        self._init_cache_table()

    def _init_cache_table(self):
        """Initialize the explanation cache table if it doesn't exist."""
        try:
            db.execute("""
                CREATE TABLE IF NOT EXISTS explanation_cache (
                    cache_key TEXT PRIMARY KEY,
                    explanation TEXT NOT NULL,
                    explanation_type TEXT NOT NULL,
                    metadata TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            db.CONN.commit()
            logger.info("Explanation cache table initialized")
        except Exception as e:
            logger.error(f"Error initializing explanation cache table: {e}")

    def get_provider_name(self) -> str:
        """
        Get the name of the current LLM provider.
        """
        if self.llm:
            return getattr(self.llm, 'name', 'Unknown')
        return 'No LLM Provider'

    def _generate_cache_key(self, text: str, explanation_type: str, context: Optional[Dict] = None) -> str:
        """
        Generate a cache key for explanation requests.
        """
        import hashlib
        
        # Create a string representation of the request
        cache_data = {
            'text': text.strip(),
            'type': explanation_type,
            'context': context or {}
        }
        
        # Create hash
        cache_str = str(sorted(cache_data.items()))
        return hashlib.md5(cache_str.encode()).hexdigest()

    def _get_cached_explanation(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """
        Get cached explanation if available.
        """
        try:
            result = db.execute(
                "SELECT explanation, metadata FROM explanation_cache WHERE cache_key = ?",
                (cache_key,)
            ).fetchone()
            
            if result:
                import json
                return {
                    'explanation': result[0],
                    'metadata': json.loads(result[1]) if result[1] else {}
                }
        except Exception as e:
            logger.error(f"Error getting cached explanation: {e}")
        
        return None

    def _cache_explanation(self, cache_key: str, explanation: str, explanation_type: str, metadata: Optional[Dict] = None):
        """
        Cache explanation result.
        """
        try:
            import json
            db.execute(
                "INSERT OR REPLACE INTO explanation_cache (cache_key, explanation, explanation_type, metadata) VALUES (?, ?, ?, ?)",
                (cache_key, explanation, explanation_type, json.dumps(metadata or {}))
            )
            db.CONN.commit()
        except Exception as e:
            logger.error(f"Error caching explanation: {e}")

    async def explain_text(self, text: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Explain the given text using AI.
        """
        if not self.llm:
            raise Exception("LLM provider not available")
        
        # Check cache first
        cache_key = self._generate_cache_key(text, "explain", context)
        cached_result = self._get_cached_explanation(cache_key)
        if cached_result:
            logger.info("Using cached explanation")
            return cached_result
        
        try:
            # Build context information
            context_info = ""
            if context:
                if context.get('document_id'):
                    context_info += f"Document ID: {context['document_id']}\n"
                if context.get('page_index') is not None:
                    context_info += f"Page: {context['page_index'] + 1}\n"
                if context.get('source'):
                    context_info += f"Source: {context['source']}\n"
            
            # Create explanation prompt
            prompt = f"""Please provide a clear and detailed explanation of the following text. 
Focus on:
1. Key concepts and their meanings
2. Context and significance
3. Any technical terms or specialized language
4. Practical implications or applications

{context_info}
Text to explain:
{text}

Provide a comprehensive but accessible explanation:"""
            
            # Get explanation from LLM
            explanation = await self.llm.complete(prompt)
            
            result = {
                'explanation': explanation,
                'metadata': {
                    'provider': self.get_provider_name(),
                    'context': context or {},
                    'cached': False
                }
            }
            
            # Cache the result
            self._cache_explanation(cache_key, explanation, "explain", result['metadata'])
            
            return result
            
        except Exception as e:
            logger.error(f"Error explaining text: {e}")
            raise Exception(f"Failed to explain text: {str(e)}")

    async def highlight_text(self, text: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Highlight the given text using AI.
        """
        if not self.llm:
            raise Exception("LLM provider not available")
        
        # Check cache first
        cache_key = self._generate_cache_key(text, "highlight", context)
        cached_result = self._get_cached_explanation(cache_key)
        if cached_result:
            logger.info("Using cached highlight")
            return {'highlight': cached_result['explanation'], 'metadata': cached_result['metadata']}
        
        try:
            # Build context information
            context_info = ""
            if context:
                if context.get('document_id'):
                    context_info += f"Document ID: {context['document_id']}\n"
                if context.get('page_index') is not None:
                    context_info += f"Page: {context['page_index'] + 1}\n"
                if context.get('source'):
                    context_info += f"Source: {context['source']}\n"
            
            # Create highlight prompt
            prompt = f"""Please provide concise highlights for the following text.
Focus on:
1. Key points and main ideas
2. Important terms and definitions
3. Notable insights or implications
4. Brief summary of significance

Keep highlights brief but informative, suitable for quick reference.

{context_info}
Text to highlight:
{text}

Provide clear, concise highlights:"""
            
            # Get highlight from LLM
            highlight = await self.llm.complete(prompt)
            
            result = {
                'highlight': highlight,
                'metadata': {
                    'provider': self.get_provider_name(),
                    'context': context or {},
                    'cached': False
                }
            }
            
            # Cache the result
            self._cache_explanation(cache_key, highlight, "highlight", result['metadata'])
            
            return result
            
        except Exception as e:
            logger.error(f"Error highlighting text: {e}")
            raise Exception(f"Failed to highlight text: {str(e)}")

    async def get_available_models(self) -> List[str]:
        """
        Get list of available AI models.
        """
        if not self.llm:
            return []
        
        try:
            # Try to get models from provider
            if hasattr(self.llm, 'get_available_models'):
                return await self.llm.get_available_models()
            else:
                # Return provider name as fallback
                return [self.get_provider_name()]
        except Exception as e:
            logger.error(f"Error getting available models: {e}")
            return []