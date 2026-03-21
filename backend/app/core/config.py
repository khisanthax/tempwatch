from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="TEMPWATCH_",
        extra="ignore",
    )

    app_name: str = "TempWatch"
    env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    database_url: str = Field(default="sqlite:///./tempwatch.db")
    session_max_duration_hours: int = 96


@lru_cache
def get_settings() -> Settings:
    return Settings()
