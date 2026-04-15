import secrets
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings
from cryptography.fernet import Fernet


def _find_env_file() -> list[str]:
    """Walk up from this file's directory to find the monorepo-root .env."""
    current = Path(__file__).resolve().parent
    for _ in range(6):
        candidate = current / ".env"
        if candidate.exists():
            return [str(candidate)]
        current = current.parent
    return [".env"]  # fallback to cwd


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./gravel.db"

    # ── Redis (optional) ──────────────────────────────────────────────────────
    REDIS_URL: str = ""

    # ── JWT ───────────────────────────────────────────────────────────────────
    SECRET_KEY: str = secrets.token_hex(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Encryption ────────────────────────────────────────────────────────────
    ENCRYPTION_KEY: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # ── Misc ──────────────────────────────────────────────────────────────────
    SHOW_DOCS: bool = True
    DEBUG: bool = False
    UPLOAD_DIR: str = "./uploads"

    # ── Git integrations ──────────────────────────────────────────────────────
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITLAB_CLIENT_ID: str = ""
    GITLAB_CLIENT_SECRET: str = ""
    GITLAB_BASE_URL: str = "https://gitlab.com"
    BITBUCKET_CLIENT_ID: str = ""
    BITBUCKET_CLIENT_SECRET: str = ""
    GITEA_BASE_URL: str = "http://localhost:3001"
    GITEA_ADMIN_TOKEN: str = ""

    # ── Deploy environments ───────────────────────────────────────────────────
    AWS_DEFAULT_REGION: str = "us-east-1"
    GCP_PROJECT_ID: str = ""
    AZURE_SUBSCRIPTION_ID: str = ""

    model_config = {
        "env_file": _find_env_file(),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.DATABASE_URL

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def fernet(self) -> Fernet:
        key = self.ENCRYPTION_KEY or Fernet.generate_key().decode()
        return Fernet(key.encode() if isinstance(key, str) else key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
