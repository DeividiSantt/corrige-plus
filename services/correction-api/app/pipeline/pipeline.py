from dataclasses import asdict
import asyncio
import logging
from pathlib import Path
import tempfile

import cv2
import httpx
import numpy as np

from app.pipeline.bubble_detection import read_bubbles
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document_detailed, normalize_perspective
from app.pipeline.image_quality import analyze_quality, decode_image
from app.pipeline.qr_reader import QRReadResult, qr_crop, read_qr_progressive
from app.pipeline.version import PIPELINE_VERSION

logger = logging.getLogger(__name__)


QR_ERROR_CODES = {
    "not_detected": "qr_not_detected",
    "detected_not_decoded": "qr_detected_not_decoded",
    "invalid_format": "qr_invalid_format",
}

# Links assinados do Supabase são válidos por cinco minutos. Em instâncias
# gratuitas, a primeira conexão entre Render e Storage pode oscilar ou demorar
# mais que o normal. Mantemos as tentativas abaixo dentro do tempo total da
# chamada feita pelo site (180 segundos) e não confundimos essa oscilação com
# uma foto inválida.
SIGNED_IMAGE_DOWNLOAD_ATTEMPTS = 3
SIGNED_IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 50.0
SIGNED_IMAGE_DOWNLOAD_RETRY_DELAYS_SECONDS = (2.0, 4.0)


async def _download_signed_image(signed_url: str) -> bytes:
    last_error: httpx.RequestError | None = None
    timeout = httpx.Timeout(SIGNED_IMAGE_DOWNLOAD_TIMEOUT_SECONDS, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for attempt in range(SIGNED_IMAGE_DOWNLOAD_ATTEMPTS):
            try:
                response = await client.get(signed_url)
                response.raise_for_status()
                return response.content
            except httpx.HTTPStatusError as exc:
                # Erros de autorização ou URL expirado não melhoram com uma
                # nova tentativa; devolvemos o código específico ao site.
                logger.warning(
                    "Unable to download signed answer-sheet image status=%s",
                    exc.response.status_code,
                )
                raise ValueError("signed_image_download_failed") from exc
            except httpx.RequestError as exc:
                last_error = exc
                if attempt == SIGNED_IMAGE_DOWNLOAD_ATTEMPTS - 1:
                    break
                delay = SIGNED_IMAGE_DOWNLOAD_RETRY_DELAYS_SECONDS[attempt]
                logger.warning(
                    "Signed answer-sheet image download failed attempt=%s/%s error_type=%s; retrying in %ss",
                    attempt + 1,
                    SIGNED_IMAGE_DOWNLOAD_ATTEMPTS,
                    type(exc).__name__,
                    delay,
                )
                await asyncio.sleep(delay)
    logger.warning(
        "Unable to reach signed answer-sheet image after retries error_type=%s",
        type(last_error).__name__ if last_error else "unknown",
    )
    raise ValueError("signed_image_download_unavailable") from last_error


def _save_debug_artifacts(
    original,
    normalized,
    qr_result: QRReadResult,
    config: PipelineConfig,
    diagnostic_id: str | None,
) -> None:
    if not config.debug_artifacts or not diagnostic_id:
        return
    directory = Path(tempfile.gettempdir()) / "corrige-plus" / "qr-debug" / diagnostic_id
    directory.mkdir(parents=True, exist_ok=True)
    original_preview = original
    if original.shape[1] > 1600:
        ratio = 1600 / original.shape[1]
        original_preview = cv2.resize(original, None, fx=ratio, fy=ratio, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(directory / "01-original-preview.jpg"), original_preview)
    cv2.imwrite(str(directory / "02-normalized.jpg"), normalized)
    # A rotação usada para decodificar o QR é a orientação do símbolo, não
    # necessariamente a da página. A perspectiva já deixa a folha em retrato;
    # as rotações restantes são avaliadas pelo leitor de bolhas abaixo.
    oriented = normalized
    cropped = qr_crop(oriented, config)
    if cropped:
        cv2.imwrite(str(directory / "03-qr-crop.png"), cropped[0])


async def process_signed_image(
    signed_url: str,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict] | None = None,
    diagnostic_id: str | None = None,
) -> dict:
    image = decode_image(await _download_signed_image(signed_url))
    quality = analyze_quality(image, config)
    detection = detect_document_detailed(image, config)
    stages = {
        "image_quality": "warning" if quality.problems else "passed",
        "document_detection": detection.status,
        "normalization": "not_attempted",
        "qr": "not_attempted",
        "answers": "not_attempted",
    }
    if (
        detection.status != "detected"
        or detection.corners is None
        or detection.strategy != "markers"
    ):
        fiducials_missing = detection.status == "detected" and detection.strategy != "markers"
        return {
            "status": "resubmission_required",
            "secure_token": None,
            "error_code": (
                "invalid_document_geometry"
                if detection.status == "invalid_geometry"
                else "fiducials_not_found" if fiducials_missing else "document_not_found"
            ),
            "review_required": False,
            "quality": asdict(quality),
            "qr_read": None,
            "answers": [],
            "processing_stages": stages,
        }
    try:
        normalized = normalize_perspective(
            image,
            detection.corners,
            config,
            marker_centers=detection.marker_centers,
        )
    except ValueError:
        stages["document_detection"] = "invalid_geometry"
        stages["normalization"] = "failed"
        return {
            "status": "resubmission_required",
            "secure_token": None,
            "error_code": "invalid_document_geometry",
            "review_required": False,
            "quality": asdict(quality),
            "qr_read": None,
            "answers": [],
            "processing_stages": stages,
        }
    stages["normalization"] = "completed"
    qr_result = read_qr_progressive(image, normalized, config)
    stages["qr"] = qr_result.status
    oriented = normalized
    bubble_rotation_degrees = 0
    if config.profile_id == "corrige-plus-v2-subject-blocks":
        # The fiducials remove perspective but cannot distinguish the two
        # 180-degree orientations. The CHS QR is printed in the upper-right;
        # use its detected location (not the QR decoder's trial rotation) to
        # choose the bubble grid orientation.
        detector = cv2.QRCodeDetector()
        try:
            detected_qr, qr_points = detector.detect(oriented)
        except cv2.error:
            detected_qr, qr_points = False, None
        if detected_qr and qr_points is not None:
            qr_center = np.asarray(qr_points, dtype=np.float32).reshape(-1, 2).mean(axis=0)
            if qr_center[0] < oriented.shape[1] / 2 and qr_center[1] >= oriented.shape[0] / 2:
                oriented = cv2.rotate(oriented, cv2.ROTATE_180)
                bubble_rotation_degrees = 180
    if oriented.shape[:2] != (config.normalized_height, config.normalized_width):
        oriented = cv2.resize(
            oriented,
            (config.normalized_width, config.normalized_height),
            interpolation=cv2.INTER_AREA,
        )
    answers = read_bubbles(
        oriented,
        total_questions,
        alternatives_count,
        config,
        subject_blocks,
    )
    stages["answers"] = "read"
    qr_error = QR_ERROR_CODES.get(qr_result.status)
    review_required = qr_result.token is None or any(
        item.classification in {"multiple", "uncertain", "low_confidence", "unreadable"} for item in answers
    )
    _save_debug_artifacts(image, normalized, qr_result, config, diagnostic_id)
    logger.info(
        "QR processing pipeline_version=%s status=%s strategy=%s attempts=%s detected=%s content_length=%s",
        PIPELINE_VERSION,
        qr_result.status,
        qr_result.strategy,
        qr_result.attempts,
        qr_result.detected,
        qr_result.content_length,
    )
    return {
        "status": "review_required" if review_required else "processed",
        "secure_token": qr_result.token,
        "error_code": qr_error,
        "review_required": review_required,
        "quality": asdict(quality),
        "qr_read": asdict(qr_result),
        "layout_version": config.layout_version,
        "layout_profile_id": config.profile_id,
        "algorithm_version": PIPELINE_VERSION,
        "bubble_rotation_degrees": bubble_rotation_degrees,
        "answers": [asdict(item) for item in answers],
        "processing_stages": stages,
    }
