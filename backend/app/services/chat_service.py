from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Dict, Any

from loguru import logger

# Handle optional LLM provider
try:
    from ..providers import get_llm_provider
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False


@dataclass
class ChatResult:
    answer: str
    source: str
    metadata: Dict[str, Any]


class ChatService:
    def __init__(self):
        if LLM_AVAILABLE:
            try:
                self.llm = get_llm_provider()
                logger.info("LLM provider initialized for chat service: {}", self.llm)
            except Exception as exc:
                logger.error("Failed to initialize chat LLM provider: {}", exc)
                self.llm = None
        else:
            self.llm = None
            logger.warning("LLM provider unavailable for chat service")

    def _provider_name(self) -> str:
        if self.llm is None:
            return "No Provider"
        return self.llm.__class__.__name__

    def _build_prompt(self, question: str, context: Optional[str]) -> str:
        context_block = ""
        if context:
            context_block = (
                "Here is relevant reference text from the PDF. Use it to ground your answer when appropriate.\n"
                "Context:\n"
                f"{context}\n\n"
            )
        prompt = (
            "You are an expert assistant helping a user read a PDF document."
            " Provide a clear, direct answer using the supplied context when it is useful."
            " If the context does not contain the answer, rely on general knowledge but mention the limitation.\n\n"
            f"{context_block}"
            f"User question:\n{question}\n\n"
            "Respond in the same language as the question and keep the answer concise but helpful."
        )
        return prompt

    def _fallback(self, question: str, context: Optional[str], error: Optional[Exception] = None) -> ChatResult:
        if error:
            logger.warning("Returning fallback chat response due to error: {}", error)
        pieces = [
            "The AI service is currently unavailable, so here is the information we have:"
        ]
        if context:
            pieces.append("Context snippet:\n" + context)
        pieces.append("You can try again later for an AI-generated answer.")
        return ChatResult(
            answer="\n\n".join(pieces),
            source=f"Fallback ({self._provider_name()})",
            metadata={
                "provider": self._provider_name(),
                "fallback": True,
                "error": str(error) if error else None,
            },
        )

    async def ask(self, question: str, context: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> ChatResult:
        question = (question or "").strip()
        if not question:
            raise ValueError("Question cannot be empty")

        prompt = self._build_prompt(question, context)

        if not self.llm:
            logger.warning("No LLM provider configured; using fallback")
            return self._fallback(question, context)

        try:
            answer = await self.llm.complete(prompt)
            return ChatResult(
                answer=answer,
                source=self._provider_name(),
                metadata={
                    "provider": self._provider_name(),
                    "fallback": False,
                    "context_present": bool(context),
                    "extra": metadata or {},
                },
            )
        except Exception as exc:  # pragma: no cover - defensive guard
            return self._fallback(question, context, error=exc)
