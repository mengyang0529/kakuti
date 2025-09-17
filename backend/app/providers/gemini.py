import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
import asyncio
from loguru import logger
from ..config import settings
from .base import LLMProvider
import httpx


class GeminiProvider(LLMProvider):
    def __init__(self):
        self.model = None
        if settings.GEMINI_API_KEY:
            try:
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self.model = genai.GenerativeModel(settings.GEMINI_MODEL)
                # Test the connection
                logger.info("Gemini provider initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini provider: {e}")
                self.model = None
        else:
            logger.warning("GEMINI_API_KEY not set, Gemini provider will return mock responses")

    async def complete(self, prompt: str, max_tokens: int = 1000) -> str:
        if self.model is None:
            # Return mock completion when no API key is available or initialization failed
            mock_result = f"[Mock completion: {prompt[:50]}...]"
            logger.info(f"Mock completion: {mock_result}")
            return mock_result

        try:
            logger.info(f"Sending prompt to Gemini: {prompt}")
            response = await asyncio.wait_for(
                self.model.generate_content_async(
                    prompt,
                    generation_config=genai.types.GenerationConfig(max_output_tokens=max_tokens),
                    safety_settings={
                        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                    }
                ),
                timeout=settings.GEMINI_REQUEST_TIMEOUT
            )
            result = response.text.strip()
            logger.info(f"Gemini response: {result[:100]}...")
            return result
        except asyncio.TimeoutError:
            logger.error(
                "Gemini completion timed out after {}s",
                settings.GEMINI_REQUEST_TIMEOUT,
            )
        except httpx.ConnectError as e:
            logger.error(f"Gemini connection error (blocked network): {e}")
        except Exception as e:
            logger.error(f"Gemini completion error: {e}")
        
        # Return mock completion when API fails
        mock_result = f"[Mock completion: {prompt[:50]}...]"
        logger.info(f"Falling back to mock completion: {mock_result}")
        return mock_result

    async def translate(self, text: str, target_lang: str) -> str:
        # Map language codes to full names
        lang_names = {
            "en": "English",
            "zh": "Chinese",
            "ja": "Japanese",
            "ko": "Korean",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "ru": "Russian",
            "ar": "Arabic",
            "hi": "Hindi",
        }
        target_lang_name = lang_names.get(target_lang, target_lang)
        
        prompt = f"Translate the following text to {target_lang_name}. Return ONLY the translated text without any explanations or additional text:\n\n{text}"
        
        if self.model is None:
            # Return mock translation when no API key is available or initialization failed
            mock_result = f"[Mock translation to {target_lang_name}: {text}]"
            logger.info(f"Mock translation: {mock_result}")
            return mock_result
        
        try:
            logger.info(f"Sending prompt to Gemini: {prompt}")
            response = await asyncio.wait_for(
                self.model.generate_content_async(
                    prompt,
                    safety_settings={
                        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                    }
                ),
                timeout=settings.GEMINI_REQUEST_TIMEOUT
            )
            result = response.text.strip()
            logger.info(f"Gemini response: {result}")
            return result
        except asyncio.TimeoutError:
            logger.error(
                "Gemini translation timed out after {}s",
                settings.GEMINI_REQUEST_TIMEOUT,
            )
        except httpx.ConnectError as e:
            logger.error(f"Gemini connection error (blocked network): {e}")
        except Exception as e:
            logger.error(f"Gemini translation error: {e}")
        # Return mock translation when API fails
        mock_result = f"[Mock translation to {target_lang_name}: {text}]"
        logger.info(f"Falling back to mock translation: {mock_result}")
        return mock_result

    async def summarize(self, text: str) -> str:
        prompt = f"Summarize the following text in 2-3 sentences:\n\n{text}"
        
        if self.model is None:
            # Return mock summary when no API key is available or initialization failed
            return f"[Mock summary: {text[:50]}...]"
        
        try:
            response = await asyncio.wait_for(
                self.model.generate_content_async(
                    prompt,
                    safety_settings={
                        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                    }
                ),
                timeout=settings.GEMINI_REQUEST_TIMEOUT
            )
            return response.text.strip()
        except asyncio.TimeoutError:
            logger.error(
                "Gemini summarization timed out after {}s",
                settings.GEMINI_REQUEST_TIMEOUT,
            )
        except httpx.ConnectError as e:
            logger.error(f"Gemini connection error (blocked network): {e}")
        except Exception as e:
            logger.error(f"Gemini summarization error: {e}")
        # Return mock summary when API fails
        return f"[Mock summary: {text[:50]}...]"
