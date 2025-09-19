import sys
import os
import threading
import time
# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Request, Depends, HTTPException, status, Response
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.config import settings
from app import db

app = FastAPI(title="KAKUTI Backend", version="0.1.0")


class _TokenBucket:
    def __init__(self, rate_per_minute: int, capacity: int) -> None:
        self.capacity = max(capacity, 1)
        self.tokens = float(self.capacity)
        self.refill_rate = max(rate_per_minute, 1) / 60.0
        self.updated = time.monotonic()
        self.lock = threading.Lock()

    def allow(self, amount: int = 1) -> bool:
        now = time.monotonic()
        with self.lock:
            delta = now - self.updated
            self.updated = now
            self.tokens = min(self.capacity, self.tokens + delta * self.refill_rate)
            if self.tokens >= amount:
                self.tokens -= amount
                return True
            return False


_rate_limit_buckets: dict[str, _TokenBucket] = {}
_bucket_lock = threading.Lock()


def _rate_limit_identity(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = request.client
    return client.host if client else "unknown"


@app.middleware("http")
async def rate_limiter(request: Request, call_next):
    # ✅ 预检直接放行
    if request.method == "OPTIONS":
        return Response(status_code=204)

    if settings.RATE_LIMIT_PER_MINUTE <= 0:
        return await call_next(request)
    path = request.url.path
    if path.startswith("/health") or path.startswith("/healthz"):
        return await call_next(request)

    identity = _rate_limit_identity(request)
    with _bucket_lock:
        bucket = _rate_limit_buckets.get(identity)
        if bucket is None:
            bucket = _TokenBucket(settings.RATE_LIMIT_PER_MINUTE, settings.RATE_LIMIT_BURST)
            _rate_limit_buckets[identity] = bucket
    if not bucket.allow():
        logger.warning("Rate limit exceeded for %s %s", identity, path)
        return PlainTextResponse("Rate limit exceeded", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    return await call_next(request)

# --- CORS 中间件（建议放宽 headers） ---
if settings.ALLOW_CORS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,  # ['https://mengyang0529.github.io'] 之类
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],  # ✅ 含 X-API-Key/Content-Type 等
    )

# --- 放行预检：API key 依赖 ---
async def api_key_guard(request: Request):
    # ✅ 预检不做鉴权
    if request.method == "OPTIONS":
        return
    logger.info(f"API key guard called for {request.method} {request.url.path}")
    if not settings.REQUIRE_API_KEY:
        return
    key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    logger.info(f"API key from request: {key}, expected: {settings.API_KEY}")
    if not key or key != settings.API_KEY:
        logger.error("API key validation failed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


@app.on_event("startup")
async def bootstrap():
    if settings.DB_TYPE == "sqlite":
        logger.info("Bootstrapping SQLite database at {}", settings.DB_PATH)
        if settings._RAW_DB:
            os.makedirs(settings.DB_DIR, exist_ok=True)
        else:
            logger.warning("SQLite running in ephemeral temp directory; data will not persist across restarts.")
        with open(os.path.join(os.path.dirname(__file__), "schema.sql"), "r", encoding="utf-8") as f:
            db.executescript(f.read())
    else:
        logger.info("Running in {} mode; database migrations should be handled externally.", settings.DB_TYPE)
    # Optional vacuum on startup to compact DB if requested
    if settings.DB_VACUUM_ON_STARTUP:
        try:
            db.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            db.execute("VACUUM;")
            logger.info("Database vacuumed on startup")
        except Exception as e:
            logger.warning("VACUUM on startup failed: {}", e)
    # If sqlite-vec enabled, try create vector table
    if settings.DB_TYPE == "sqlite" and settings.SQLITE_VEC_ENABLE:
        try:
            db.execute(
                f"""
                CREATE VIRTUAL TABLE IF NOT EXISTS doc_vectors USING vec0(embedding({settings.EMBED_DIM}));
                """
            )
            db.CONN.commit()
            logger.info("Vector table doc_vectors ready (sqlite-vec)")
        except Exception as e:
            logger.warning("Failed to create vec table: {}. Fallback to doc_embeddings.", e)
            settings.SQLITE_VEC_ENABLE = False


@app.get("/health")
async def health():
    return {"ok": True, "vec": settings.SQLITE_VEC_ENABLE}


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


# Routers
from app.routes import translate, images, search, tags, highlights  # noqa: E402
from app.routes import workspaces  # noqa: E402
from app.routes import simulate  # noqa: E402
from app.routes import rag  # noqa: E402
from app.routes import explain  # noqa: E402

# Import and register routes
from app.routes import documents
app.include_router(documents.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(workspaces.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(simulate.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])

app.include_router(translate.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(images.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(search.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(tags.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(highlights.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(rag.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
app.include_router(explain.router, prefix="/api/v1", dependencies=[Depends(api_key_guard)])
