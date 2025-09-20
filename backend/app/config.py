import os
import tempfile
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables with flexible file names
base_dir = os.path.join(os.path.dirname(__file__), '..')

# Allow override via ENV_FILE
env_file_override = os.getenv('ENV_FILE')
if env_file_override and not os.path.isabs(env_file_override):
    env_file_override = os.path.join(base_dir, env_file_override)

# Candidate files in priority order
candidates = [
    env_file_override,
    os.path.join(base_dir, '.env.engine'),  # Added .env.engine first
    os.path.join(base_dir, '.env'),
    os.path.join(base_dir, '.env.engine'),
    os.path.join(base_dir, 'env.engine'),
    os.path.join(base_dir, '.env.example'),
]

for path in [p for p in candidates if p]:
    if os.path.exists(path):
        load_dotenv(path)
        break


class Settings(BaseModel):
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")
    OLLAMA_ENDPOINT: str = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434")
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    # Embeddings (OpenAI): choose model and infer dim
    OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-ada-002")

    # Gemini API
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    GEMINI_REQUEST_TIMEOUT: float = float(os.getenv("GEMINI_REQUEST_TIMEOUT", "30"))

    # Google API for RAG
    GOOGLE_API_KEY: str | None = os.getenv("GOOGLE_API_KEY")

    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "local")  # local|openai
    SQLITE_VEC_ENABLE: bool = os.getenv("SQLITE_VEC_ENABLE", "false").lower() == "true"
    EMBED_DIM: int = int(os.getenv("EMBED_DIM", "768"))

    # Database configuration - support both SQLite and PostgreSQL
    DB_TYPE: str = os.getenv("DB_TYPE", "sqlite")  # sqlite|postgresql
    _RAW_DB: str | None = os.getenv("DOCMIND_DB")
    # DB_DIR: str = ""
    # SQLite vacuum settings
    DB_AUTOVACUUM_FULL: bool = os.getenv("DB_AUTOVACUUM_FULL", "true").lower() == "true"
    DB_VACUUM_ON_STARTUP: bool = os.getenv("DB_VACUUM_ON_STARTUP", "false").lower() == "true"

    # PostgreSQL configuration
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", "5432"))
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "docmind")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "")

    # RAG configuration
    RAG_EMBEDDING_MODEL: str = os.getenv("RAG_EMBEDDING_MODEL", "gemini-embedding-001")
    RAG_GENERATION_MODEL: str = os.getenv("RAG_GENERATION_MODEL", "gemini-1.5-flash")
    RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "6"))
    RAG_MAX_CONTEXT_TOKENS: int = int(os.getenv("RAG_MAX_CONTEXT_TOKENS", "1800"))
    RAG_BLOCK_MAX_TOKENS: int = int(os.getenv("RAG_BLOCK_MAX_TOKENS", "800"))
    RAG_BLOCK_TARGET_TOKENS: int = int(os.getenv("RAG_BLOCK_TARGET_TOKENS", "400"))
    RAG_BLOCK_OVERLAP_TOKENS: int = int(os.getenv("RAG_BLOCK_OVERLAP_TOKENS", "80"))
    RAG_MMR_LAMBDA: float = float(os.getenv("RAG_MMR_LAMBDA", "0.5"))
    RAG_SIMILARITY_THRESHOLD: float = float(os.getenv("RAG_SIMILARITY_THRESHOLD", "0.65"))

    ALLOW_CORS: bool = True
    REQUIRE_API_KEY: bool = os.getenv("REQUIRE_API_KEY", "false").lower() == "true"
    API_KEY: str | None = os.getenv("API_KEY")
    RAW_ALLOWED_ORIGINS: str | None = os.getenv("ALLOWED_ORIGINS")

    GCS_BUCKET: str | None = os.getenv("GCS_BUCKET")
    GCS_UPLOAD_PREFIX: str = os.getenv("GCS_UPLOAD_PREFIX", "uploads/")
    GCS_SIGNED_URL_EXPIRATION_SECONDS: int = int(os.getenv("GCS_SIGNED_URL_EXPIRATION_SECONDS", "600"))

    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
    RATE_LIMIT_BURST: int = int(os.getenv("RATE_LIMIT_BURST", "60"))

    @property
    def DB_PATH(self) -> str:
        """Dynamically compute DB_PATH based on DB_TYPE and other settings."""
        if self.DB_TYPE == "sqlite":
            if self._RAW_DB:
                resolved = (
                    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', self._RAW_DB))
                    if not os.path.isabs(self._RAW_DB)
                    else self._RAW_DB
                )
                return resolved
            else:
                return os.path.join(tempfile.gettempdir(), "docmind.db")
        else:
            return (
                os.path.abspath(os.path.join(os.path.dirname(__file__), '..', self._RAW_DB)) 
                if (self._RAW_DB and not os.path.isabs(self._RAW_DB))
                else (self._RAW_DB if self._RAW_DB else "")
            )

    @property
    def allowed_origins(self) -> list[str]:
        raw = self.RAW_ALLOWED_ORIGINS
        if not raw:
            return ["http://localhost:5173", "https://mengyang0529.github.io", "https://kakuti.xyz"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    # ADD THIS NEW METHOD
    @property
    def DB_DIR(self) -> str:
        """Dynamically compute the directory of the database file."""
        # self.DB_PATH already computes the full file path.
        # os.path.dirname() gets just the directory part of that path.
        return os.path.dirname(self.DB_PATH)

settings = Settings()