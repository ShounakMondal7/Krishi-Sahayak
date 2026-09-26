"""
config.py — Application settings loaded from .env via pydantic-settings.

All configuration is centralized here. Import `settings` from this module
everywhere you need a config value. Never read os.environ directly.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────
    app_name: str = "AI Farmer Advisory System"
    app_version: str = "1.0.0"
    env: str = "development"

    # ── CORS ─────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:8081"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str) -> str:
        return v  # Keep as string; parsed in main.py

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    # ── Database ─────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./farmer.db"

    # ── ChromaDB ─────────────────────────────────────────────────────
    chroma_persist_path: str = "./chroma_store"
    collection_name: str = "agri_knowledge"

    # ── OpenAI ───────────────────────────────────────────────────────
    openai_api_key: str = "your_openai_api_key_here"
    llm_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.2
    llm_max_tokens: int = 300

    # ── Google Cloud ─────────────────────────────────────────────────
    google_application_credentials: str = "./google-credentials.json"

    # ── Embedding / RAG ───────────────────────────────────────────────
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    rag_top_k: int = 4
    chunk_size: int = 500
    chunk_overlap: int = 50

    # ── Cache ─────────────────────────────────────────────────────────
    cache_ttl_seconds: int = 300

    # ── Feature Flags ─────────────────────────────────────────────────
    use_indictrans2: bool = True
    use_voice: bool = True

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def is_development(self) -> bool:
        return self.env.lower() == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings singleton — instantiated once per process."""
    return Settings()


# Module-level alias for convenience
settings = get_settings()
