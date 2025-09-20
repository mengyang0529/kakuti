from . import translate, search, tags

# Handle optional documents route (depends on PyMuPDF)
try:
    from . import documents
    __all__ = ["translate", "documents", "search", "tags"]
except ImportError:
    __all__ = ["translate", "search", "tags"]
