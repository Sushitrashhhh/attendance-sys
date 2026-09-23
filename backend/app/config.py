from pathlib import Path
from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine project root directory (.env location)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATHS = [str(ROOT_DIR / ".env"), ".env"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_PATHS,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="",
        alias="DATABASE_URL",
        description="Neon PostgreSQL pooled connection URL",
    )
    database_url_unpooled: str | None = Field(
        default=None,
        alias="DATABASE_URL_UNPOOLED",
        description="Neon PostgreSQL direct/unpooled connection URL for migrations",
    )
    cors_origins_raw: str = Field(
        default="http://localhost:5173",
        alias="CORS_ORIGINS",
        description="Comma-separated allowed CORS origins",
    )
    recognition_threshold: float = Field(
        default=0.65,
        alias="RECOGNITION_THRESHOLD",
        description="Cosine similarity threshold for face recognition",
    )
    liveness_threshold: float = Field(
        default=0.70,
        alias="LIVENESS_THRESHOLD",
        description="Threshold score for liveness anti-spoofing verification",
    )
    app_env: str = Field(
        default="development",
        alias="APP_ENV",
        description="Application environment (development, test, production)",
    )

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def migration_database_url(self) -> str:
        """Returns the unpooled URL for migrations if available, otherwise DATABASE_URL."""
        return self.database_url_unpooled or self.database_url

    def validate_database_url(self) -> None:
        """Fails fast with a clear explanation if DATABASE_URL is missing or empty."""
        if not self.database_url or self.database_url.strip() == "":
            raise ValueError(
                "DATABASE_URL is not set. Please set DATABASE_URL in your .env file "
                "with your Neon PostgreSQL connection string (e.g. postgresql://user:pass@ep-xyz.region.aws.neon.tech/neondb?sslmode=require)."
            )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
