from .translate_service import TranslateService
from .ocr_service import OCRService

# Handle optional PyMuPDF dependency
try:
    from .doc_parse_service import DocParseService
    __all__ = ["TranslateService", "OCRService", "DocParseService"]
except ImportError:
    __all__ = ["TranslateService", "OCRService"]
