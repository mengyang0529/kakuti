import time
import asyncio
from typing import Dict, Any, Optional
from loguru import logger
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from ..config import settings
from ..repositories.documents import DocumentsRepository
from ..repositories.chunks import ChunksRepository


class GeminiDirectService:
    """Service for direct Gemini queries when RAG fails to find relevant information."""
    
    def __init__(self):
        self.documents_repo = DocumentsRepository()
        self.chunks_repo = ChunksRepository()
        
        # Configure Gemini
        api_key = settings.GOOGLE_API_KEY or settings.GEMINI_API_KEY
        self._gemini_enabled = bool(api_key)
        if self._gemini_enabled:
            try:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel(settings.GEMINI_MODEL)
                logger.info("Gemini direct service initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini direct service: {e}")
                self._gemini_enabled = False
                self.model = None
        else:
            logger.warning("Gemini API key not configured, direct service will return fallback responses")
            self.model = None
    
    def _get_full_document_content(self, document_id: str) -> Optional[str]:
        """Retrieve the full text content of a document from its chunks."""
        try:
            # Get all chunks for the document
            chunks = self.chunks_repo.get_all_chunks(document_id)
            
            if not chunks:
                logger.warning(f"No chunks found for document {document_id}")
                return None
            
            # Sort chunks by their order/position
            sorted_chunks = sorted(chunks, key=lambda x: x.get('chunk_index', 0))
            
            # Combine all chunk content
            full_content = '\n\n'.join(chunk.get('content', '') for chunk in sorted_chunks)
            
            logger.debug(f"Retrieved {len(chunks)} chunks for document {document_id}, total length: {len(full_content)}")
            return full_content
            
        except Exception as e:
            logger.error(f"Failed to retrieve full document content for {document_id}: {e}")
            return None
    
    def query_with_full_document(self, query: str, document_id: str) -> Dict[str, Any]:
        """Query Gemini with the full document content when RAG fails."""
        start_time = time.time()
        
        try:
            if not self._gemini_enabled:
                return {
                    'answer': 'Gemini API is not configured. Please configure GEMINI_API_KEY to use direct document queries.',
                    'citations': [],
                    'latency_ms': int((time.time() - start_time) * 1000),
                    'fallback': True,
                    'method': 'gemini_direct_disabled'
                }
            
            # Get document info
            document = self.documents_repo.get(document_id)
            if not document:
                return {
                    'answer': 'Document not found.',
                    'citations': [],
                    'latency_ms': int((time.time() - start_time) * 1000),
                    'fallback': True,
                    'method': 'gemini_direct_doc_not_found'
                }
            
            # Get full document content
            full_content = self._get_full_document_content(document_id)
            if not full_content:
                return {
                    'answer': 'Unable to retrieve document content for direct query.',
                    'citations': [],
                    'latency_ms': int((time.time() - start_time) * 1000),
                    'fallback': True,
                    'method': 'gemini_direct_no_content'
                }
            
            # Create prompt for Gemini
            document_title = document.get('title', 'Untitled Document')
            prompt = f"""You are an AI assistant helping to answer questions about a document. The user asked a question that couldn't be answered using the standard search method, so I'm providing you with the full document content to analyze.

Document Title: {document_title}
User Question: {query}

Please analyze the full document content below and provide a helpful answer to the user's question. 

IMPORTANT: You MUST respond in the SAME LANGUAGE as the user's question. If the question is in Chinese, respond in Chinese. If the question is in English, respond in English. If the question is in Japanese, respond in Japanese, etc.

Guidelines:
- If the question is a simple greeting (like "你好", "hello", "hi"), respond naturally and briefly in the same language
- If the question is about the document content, provide a relevant answer based on the content in the same language
- If the answer is not in the document, give a brief, friendly response in the same language
- Keep responses concise and natural, not overly formal
- ALWAYS maintain language consistency with the user's question

Document Content:
{full_content}

Please provide a helpful and natural response in the same language as the user's question."""

            logger.info(f"Sending full document query to Gemini for document {document_id}")
            
            # Query Gemini
            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=2000,
                    temperature=0.1
                ),
                safety_settings={
                    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                }
            )
            
            answer = response.text.strip()
            
            # Create a citation for the full document
            citation = {
                'content': f"Full document: {document_title}",
                'text': f"Full document: {document_title}",
                'page_number': 1,
                'similarity_score': 1.0,  # High score since we used the full document
                'chunk_index': 0,
                'document_title': document_title,
                'document_id': document_id
            }
            
            result = {
                'answer': answer,
                'citations': [citation],
                'latency_ms': int((time.time() - start_time) * 1000),
                'fallback': False,  # This is a successful direct query, not a fallback
                'method': 'gemini_direct',
                'contexts_used': 1,
                'tokens_in_est': len(prompt.split()) + len(answer.split())
            }
            
            logger.info(
                f"Gemini direct query completed: {result['latency_ms']}ms, "
                f"method={result['method']}, tokens_est={result['tokens_in_est']}"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error in Gemini direct query for document {document_id}: {e}")
            
            return {
                'answer': f'An error occurred while querying the full document: {str(e)}',
                'citations': [],
                'latency_ms': int((time.time() - start_time) * 1000),
                'fallback': True,
                'method': 'gemini_direct_error',
                'error': str(e)
            }


# Global instance
gemini_direct_service = GeminiDirectService()
