from dataclasses import asdict
import logging
from pathlib import Path
import tempfile

import cv2
import httpx

from app.pipeline.bubble_detection import read_bubbles_with_orientation_fallback
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective
from app.pipeline.image_quality import analyze_quality, decode_image
from app.pipeline.qr_reader import QRReadResult, qr_crop, read_qr_progressive
from app.pipeline.version import PIPELINE_VERSION

logger = logging.getLogger(__name__)


QR_ERROR_CODES = {
    "not_detected": "qr_not_detected",
    "detected_not_decoded": "qr_detected_not_decoded",
    "invalid_format": "qr_invalid_format",
}


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
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(signed_url)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Unable to download signed answer-sheet image status=%s",
            exc.response.status_code,
        )
        raise ValueError("signed_image_download_failed") from exc
    except httpx.RequestError as exc:
        logger.warning("Unable to reach signed answer-sheet image error_type=%s", type(exc).__name__)
        raise ValueError("signed_image_download_unavailable") from exc
    image = decode_image(response.content)
    quality = analyze_quality(image, config)
    initial_qr = read_qr_progressive(image, None, config)
    blocking = {"invalid_image", "low_resolution", "too_dark", "too_bright"}
    blocking_problem = next((problem for problem in quality.problems if problem in blocking), None)
    blur_blocks = "blurred" in quality.problems and initial_qr.token is None
    if blocking_problem or blur_blocks:
        return {
            "status": "resubmission_required",
            "secure_token": initial_qr.token,
            "error_code": blocking_problem or "blurred",
            "review_required": False,
            "quality": asdict(quality),
            "qr_read": asdict(initial_qr),
            "answers": [],
        }
    corners = detect_document(image, config)
    if corners is None:
        return {
            "status": "resubmission_required",
            "secure_token": initial_qr.token,
            "error_code": "document_not_found",
            "review_required": False,
            "quality": asdict(quality),
            "qr_read": asdict(initial_qr),
            "answers": [],
        }
    normalized = normalize_perspective(image, corners, config)
    qr_result = read_qr_progressive(image, normalized, config)
    # Veja o comentário na pré-leitura: a rotação do QR não deve girar a
    # página normalizada, pois um QR pode ser lido após uma rotação auxiliar.
    oriented = normalized
    if oriented.shape[:2] != (config.normalized_height, config.normalized_width):
        oriented = cv2.resize(
            oriented,
            (config.normalized_width, config.normalized_height),
            interpolation=cv2.INTER_AREA,
        )
    answers, bubble_rotation_degrees = read_bubbles_with_orientation_fallback(
        oriented,
        total_questions,
        alternatives_count,
        config,
        subject_blocks,
    )
    qr_error = QR_ERROR_CODES.get(qr_result.status)
    review_required = qr_result.token is None or any(
        item.classification in {"multiple", "low_confidence", "unreadable"} for item in answers
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
        "algorithm_version": PIPELINE_VERSION,
        "bubble_rotation_degrees": bubble_rotation_degrees,
        "answers": [asdict(item) for item in answers],
    }
