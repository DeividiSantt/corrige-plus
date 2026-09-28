from __future__ import annotations

from datetime import UTC, datetime
import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, HttpUrl
import cv2

from app.core.config import Settings
from app.services.storage import LocalTemporaryStorage
from app.pipeline.config import PipelineConfig
from app.pipeline.pipeline import process_signed_image
from app.pipeline.version import PIPELINE_VERSION

logger = logging.getLogger(__name__)


PROCESSING_INPUT_MESSAGES = {
    "signed_image_download_unavailable": "Não foi possível baixar a foto temporária. Tente reprocessar o cartão.",
    "signed_image_download_failed": "O link temporário da foto não está mais disponível. Envie uma nova foto.",
}


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str
    checked_at: datetime
    storage_backend: Literal["local"]
    retention_hours: int
    pipeline_version: str
    opencv_version: str


class StageError(BaseModel):
    code: str
    message: str
    planned_stage: int


class ProcessSheetRequest(BaseModel):
    processing_file_id: UUID
    batch_id: UUID
    exam_id: UUID
    owner_id: UUID
    storage_key: str = Field(min_length=10, max_length=500)
    signed_url: HttpUrl
    layout_version: str = "corrige-plus-v1"
    total_questions: int = Field(ge=1, le=50)
    alternatives_count: int = Field(ge=2, le=5)
    subject_blocks: list[dict[str, int | str]] = Field(default_factory=list)


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_env()
    storage = LocalTemporaryStorage(
        app_settings.temp_storage_path,
        retention_hours=app_settings.file_retention_hours,
    )

    application = FastAPI(
        title="CORRIGE+ Correction API",
        version="0.1.0",
        description="Processamento temporário de cartões-resposta.",
    )
    application.state.settings = app_settings
    application.state.storage = storage
    logger.info(
        "Correction API initialized pipeline_version=%s opencv_version=%s",
        PIPELINE_VERSION,
        cv2.__version__,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    @application.get("/health", response_model=HealthResponse, tags=["system"])
    def health() -> HealthResponse:
        storage.cleanup_expired()
        return HealthResponse(
            status="ok",
            service="corrige-plus-correction-api",
            version="0.1.0",
            environment=app_settings.app_env,
            checked_at=datetime.now(UTC),
            storage_backend="local",
            retention_hours=app_settings.file_retention_hours,
            pipeline_version=PIPELINE_VERSION,
            opencv_version=cv2.__version__,
        )

    def require_api_key(
        x_api_key: Annotated[str | None, Header()] = None,
    ) -> None:
        expected = app_settings.correction_api_key
        if not expected or x_api_key != expected:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_API_KEY", "message": "Credencial da API inválida."},
            )

    def not_implemented() -> None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=StageError(
                code="NOT_IMPLEMENTED_STAGE_6",
                message="O motor de visão computacional será implementado na etapa 6.",
                planned_stage=6,
            ).model_dump(),
        )

    @application.post("/v1/process-sheet", tags=["correction"])
    async def process_sheet(payload: ProcessSheetRequest, _: None = Depends(require_api_key)) -> dict:
        if payload.layout_version not in {"corrige-plus-v1", "corrige-plus-v2-subject-blocks"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "UNSUPPORTED_LAYOUT", "message": "Versão do cartão não suportada."},
            )
        try:
            return await process_signed_image(
                str(payload.signed_url),
                payload.total_questions,
                payload.alternatives_count,
                PipelineConfig(
                    layout_version=payload.layout_version,
                    debug_artifacts=(
                        app_settings.correction_debug_artifacts
                        and app_settings.app_env.lower() == "development"
                    ),
                ),
                subject_blocks=payload.subject_blocks,
                diagnostic_id=str(payload.processing_file_id),
            )
        except ValueError as exc:
            error_code = str(exc)
            logger.warning(
                "Correction rejected input processing_file_id=%s code=%s",
                payload.processing_file_id,
                error_code,
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": error_code,
                    "message": PROCESSING_INPUT_MESSAGES.get(
                        error_code,
                        "A imagem enviada não pôde ser lida.",
                    ),
                },
            ) from exc
        except Exception as exc:
            logger.exception(
                "Correction pipeline failed processing_file_id=%s error_type=%s",
                payload.processing_file_id,
                type(exc).__name__,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "PROCESSING_ERROR",
                    "message": "Falha ao processar a imagem.",
                    "diagnostic_id": str(payload.processing_file_id),
                },
            ) from exc

    @application.post("/v1/process-batch", tags=["correction"])
    def process_batch(_: None = Depends(require_api_key)) -> None:
        not_implemented()

    @application.get("/v1/jobs/{job_id}", tags=["correction"])
    def get_job(job_id: UUID, _: None = Depends(require_api_key)) -> None:
        del job_id
        not_implemented()

    @application.post("/v1/validate-layout", tags=["correction"])
    def validate_layout(_: None = Depends(require_api_key)) -> None:
        not_implemented()

    return application


app = create_app()
