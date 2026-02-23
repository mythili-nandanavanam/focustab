import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/focustab")
    llm_provider: str = os.getenv("LLM_PROVIDER", "openai").strip().lower()
    llm_api_key: str = os.getenv("LLM_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")


settings = Settings()

