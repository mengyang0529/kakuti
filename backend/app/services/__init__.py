from .translate_service import TranslateService

# Handle optional PyMuPDF dependency
try:
    from .doc_parse_service import DocParseService
    __all__ = ["TranslateService", "DocParseService"]
except ImportError:
    __all__ = ["TranslateService"]
