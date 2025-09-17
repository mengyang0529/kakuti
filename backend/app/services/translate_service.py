from typing import List, Dict, Optional
from loguru import logger
from .. import db
from ..repositories.translations import TranslationRepository
from ..repositories.documents import DocumentsRepository as DocumentRepository

# Handle optional LLM provider
try:
    from ..providers import get_llm_provider
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False


class TranslateService:
    def __init__(self):
        self.llm = None
        if LLM_AVAILABLE:
            try:
                self.llm = get_llm_provider()
                logger.info(f"LLM provider initialized: {self.llm}")
            except Exception as e:
                logger.error(f"Error initializing LLM provider: {e}")
        else:
            logger.warning("LLM not available")
        
        self.translation_repo = TranslationRepository()
        self.document_repo = DocumentRepository()
        self._init_cache_table()

    def _init_cache_table(self):
        """Initialize the translation cache table if it doesn't exist."""
        try:
            db.execute("""
                CREATE TABLE IF NOT EXISTS translation_cache (
                    cache_key TEXT PRIMARY KEY,
                    translations TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            db.CONN.commit()
            logger.info("Translation cache table initialized")
        except Exception as e:
            logger.error(f"Error initializing cache table: {e}")

    def get_provider_name(self) -> str:
        """
        Get the name of the current translation provider.
        """
        if self.llm is None:
            return "Mock Provider"
        return self.llm.__class__.__name__

    async def translate_document(self, doc_id: str, target_lang: str) -> Optional[dict]:
        """
        Translate a document to the target language.
        Returns the translation if successful, None if document not found.
        """
        # Check if translation already exists
        existing_translation = self.translation_repo.get_document_translation_by_language(
            doc_id, target_lang
        )
        if existing_translation:
            logger.info(f"Found existing translation for document {doc_id} in {target_lang}")
            existing_translation["source"] = "Database Cache"
            return existing_translation

        # Get document content
        document = self.document_repo.get(doc_id)
        if not document:
            logger.error(f"Document {doc_id} not found")
            return None

        # Get document body
        doc_body = self.document_repo.get_document_body(doc_id)
        if not doc_body:
            logger.error(f"Document body for {doc_id} not found")
            return None

        # Translate title and body
        try:
            title_translation = await self._translate_text(document["title"], target_lang) if document["title"] else {"text": None, "source": None}
            body_translation = await self._translate_text(doc_body["body"], target_lang) if doc_body["body"] else {"text": None, "source": None}
            
            # Create translation record
            translation_id = self.translation_repo.create_translation(
                doc_id=doc_id,
                target_language=target_lang,
                title=title_translation["text"],
                body=body_translation["text"],
            )
            
            return self.translation_repo.get_translation(translation_id)
            
        except Exception as e:
            logger.error(f"Translation failed for document {doc_id}: {e}")
            return None

    async def _translate_text(self, text: str, target_lang: str) -> Dict:
        """
        Translate a single piece of text to the target language.
        Returns a dictionary containing the translated text and its source.
        """
        if not text:
            return {"text": "", "source": "Empty Input"}
            
        # Generate a cache key for the text
        cache_key = f"{text}_{target_lang}"
        
        # Check translation cache
        cached_translation = db.query_one(
            "SELECT translations FROM translation_cache WHERE cache_key = ?",
            (cache_key,)
        )
        
        if cached_translation:
            logger.info("Found cached translation")
            return {
                "text": cached_translation["translations"],
                "source": "Database Cache"
            }
            
        if not self.llm:
            logger.warning("No LLM provider available, returning original text")
            return {"text": text, "source": "No Provider Available"}
            
        try:
            translated = await self.llm.translate(text, target_lang)

            try:
                db.execute(
                    "INSERT OR REPLACE INTO translation_cache (cache_key, translations) VALUES (?, ?)",
                    (cache_key, translated)
                )
                db.CONN.commit()
            except Exception as cache_error:
                logger.warning(
                    "Skipping translation cache write for key {} due to error: {}",
                    cache_key,
                    cache_error,
                )

            return {
                "text": translated,
                "source": self.get_provider_name()
            }
        except Exception as e:
            # Check if it's a network connection error
            if "httpx.ConnectError" in str(type(e)) or "ConnectError" in str(type(e)):
                logger.error(f"Network connection error during translation: {e}")
                fallback_text = text or ""
                return {
                    "text": fallback_text,
                    "source": f"Fallback (Network Error)"
                }
            else:
                logger.error(f"Translation failed: {e}")
                fallback_text = text or ""
                return {
                    "text": fallback_text,
                    "source": f"Fallback ({self.get_provider_name()} error)"
                }
