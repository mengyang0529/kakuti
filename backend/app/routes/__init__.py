from . import translate, images, search, tags

# Handle optional documents route (depends on PyMuPDF)
try:
    from . import documents
    __all__ = ["translate", "images", "documents", "search", "tags"]
except ImportError:
    __all__ = ["translate", "images", "search", "tags"]
