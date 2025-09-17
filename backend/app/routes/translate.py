from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger
from ..services.translate_service import TranslateService
import httpx

router = APIRouter(tags=["translate"])
translate_service = TranslateService()

class TranslationRequest(BaseModel):
    text: str
    target_langs: List[str]

class TranslationResponse(BaseModel):
    text: str
    source: str

class TranslationsResponse(BaseModel):
    translations: dict[str, TranslationResponse]

@router.post("/translate")
async def translate_text(request: TranslationRequest):
    """
    Translate text to the specified target languages.
    """
    logger.info("Translation request received: text='{}', target_langs={}", 
                request.text[:50] + "..." if len(request.text) > 50 else request.text, 
                request.target_langs)
    try:
        translations = {}
        for lang in request.target_langs:
            translation_result = await translate_service._translate_text(request.text, lang)
            translations[lang] = translation_result
        logger.info("Translation completed successfully: {}", translations)
        return {"translations": translations}
    except httpx.ConnectError as e:
        logger.error("Network connection error during translation: {}", str(e))
        # Return a more user-friendly error message
        raise HTTPException(status_code=503, detail="Translation service temporarily unavailable due to network issues. Please try again later or check your network configuration.")
    except Exception as e:
        logger.error("Translation failed with error: {}", str(e))
        raise HTTPException(status_code=500, detail="Translation service error. Please try again later.")

@router.post("/documents/{doc_id}/translate/{target_lang}")
async def translate_document(doc_id: str, target_lang: str):
    """
    Translate a document to the specified target language.
    If a translation already exists, returns the existing translation.
    Otherwise, creates a new translation using the configured LLM provider.
    """
    try:
        translation = await translate_service.translate_document(doc_id, target_lang)
        if translation is None:
            raise HTTPException(status_code=404, detail="Document not found or translation failed")
        return translation
    except httpx.ConnectError as e:
        logger.error("Network connection error during document translation: {}", str(e))
        raise HTTPException(status_code=503, detail="Translation service temporarily unavailable due to network issues. Please try again later or check your network configuration.")
    except Exception as e:
        logger.error(f"Error translating document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail="Document translation service error. Please try again later.")

@router.get("/documents/{doc_id}/translations")
def get_document_translations(doc_id: str) -> List[dict]:
    """
    Get all available translations for a document.
    """
    try:
        translations = translate_service.translation_repo.get_document_translations(doc_id)
        return translations
    except Exception as e:
        logger.error(f"Error getting translations for document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents/{doc_id}/translations/{target_lang}")
def get_document_translation(doc_id: str, target_lang: str):
    """
    Get a specific translation for a document.
    """
    try:
        translation = translate_service.translation_repo.get_document_translation_by_language(doc_id, target_lang)
        if translation is None:
            raise HTTPException(status_code=404, detail="Translation not found")
        return translation
    except Exception as e:
        logger.error(f"Error getting translation for document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
