from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} precisa ser um número inteiro.") from exc
    if value <= 0:
        raise ValueError(f"{name} precisa ser maior que zero.")
    return value


def _boolean(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class Settings:
    app_env: str
    log_level: str
    temp_storage_path: Path
    file_retention_hours: int
    result_retention_hours: int
    max_image_size_mb: int
    allowed_origins: tuple[str, ...]
    correction_api_key: str | None
    correction_debug_artifacts: bool = False
    answer_reader: str = "opencv"
    openai_api_key: str | None = None
    openai_model: str = "gpt-6.1-sol"
    openai_timeout_seconds: int = 90

    @classmethod
    def from_env(cls) -> "Settings":
        origins = tuple(
            origin.strip()
            for origin in os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:3000").split(",")
            if origin.strip()
        )
        return cls(
            app_env=os.getenv("APP_ENV", "development"),
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
            temp_storage_path=Path(
                os.getenv("TEMP_STORAGE_PATH", ".tmp/corrige-plus")
            ).expanduser(),
            file_retention_hours=_positive_int("FILE_RETENTION_HOURS", 24),
            result_retention_hours=_positive_int("RESULT_RETENTION_HOURS", 24),
            max_image_size_mb=_positive_int("MAX_IMAGE_SIZE_MB", 15),
            allowed_origins=origins,
            correction_api_key=os.getenv("CORRECTION_API_KEY") or None,
            correction_debug_artifacts=_boolean("CORRECTION_DEBUG_ARTIFACTS"),
            answer_reader=os.getenv("ANSWER_READER", "opencv").strip().lower(),
            openai_api_key=os.getenv("OPENAI_API_KEY") or None,
            openai_model=os.getenv("OPENAI_MODEL", "gpt-6.1-sol").strip(),
            openai_timeout_seconds=_positive_int("OPENAI_TIMEOUT_SECONDS", 90),
        )
