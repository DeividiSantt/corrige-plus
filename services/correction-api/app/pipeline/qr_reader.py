from __future__ import annotations

import re
from dataclasses import dataclass, replace
from typing import Literal

import cv2
import numpy as np

from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import rotate_quarter_turns

QR_TOKEN_PATTERN = re.compile(r"^[0-9a-f]{48}$")
QRStatus = Literal["decoded", "not_detected", "detected_not_decoded", "invalid_format"]


@dataclass(frozen=True, slots=True)
class QRReadResult:
    status: QRStatus
    token: str | None
    strategy: str | None
    detected: bool
    decoded: bool
    content_length: int | None
    bounding_box: list[list[float]] | None
    attempts: int
    rotation_degrees: int | None
    crop_coordinates: tuple[int, int, int, int] | None


@dataclass(slots=True)
class _ReadState:
    attempts: int = 0
    detected: bool = False
    invalid_content_length: int | None = None
    last_bounding_box: list[list[float]] | None = None


def _gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def _clahe(image: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(_gray(image))


def _otsu(image: np.ndarray) -> np.ndarray:
    return cv2.threshold(_gray(image), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]


def _adaptive(image: np.ndarray) -> np.ndarray:
    return cv2.adaptiveThreshold(
        _gray(image),
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        7,
    )


def _bounding_box(points: np.ndarray | None) -> list[list[float]] | None:
    if points is None:
        return None
    flattened = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    return [[round(float(x), 2), round(float(y), 2)] for x, y in flattened]


def _attempt(
    image: np.ndarray,
    strategy: str,
    state: _ReadState,
    *,
    rotation_degrees: int,
    crop_coordinates: tuple[int, int, int, int] | None = None,
) -> QRReadResult | None:
    state.attempts += 1
    detector = cv2.QRCodeDetector()
    try:
        content, points, _ = detector.detectAndDecode(image)
    except cv2.error:
        return None

    box = _bounding_box(points)
    if box:
        state.detected = True
        state.last_bounding_box = box
    content = content.strip()
    if not content:
        return None
    if not QR_TOKEN_PATTERN.fullmatch(content):
        state.invalid_content_length = len(content)
        return None
    return QRReadResult(
        status="decoded",
        token=content,
        strategy=strategy,
        detected=True,
        decoded=True,
        content_length=len(content),
        bounding_box=box,
        attempts=state.attempts,
        rotation_degrees=rotation_degrees,
        crop_coordinates=crop_coordinates,
    )


def _full_page_candidates(image: np.ndarray) -> list[tuple[str, np.ndarray]]:
    return [
        ("color", image),
        ("gray", _gray(image)),
        ("clahe", _clahe(image)),
    ]


def _crop_coordinates(image: np.ndarray, config: PipelineConfig) -> tuple[int, int, int, int] | None:
    height, width = image.shape[:2]
    geometry = config.geometry
    if width >= height:
        return None
    scale_x = width / geometry.page_width
    scale_y = height / geometry.page_height
    qr = geometry.qr
    x1 = max(0, round((qr.x - qr.padding) * scale_x))
    y1 = max(0, round((qr.y - qr.padding) * scale_y))
    x2 = min(width, round((qr.x + qr.width + qr.padding) * scale_x))
    y2 = min(height, round((qr.y + qr.height + qr.padding) * scale_y))
    if x2 - x1 < 20 or y2 - y1 < 20:
        return None
    return x1, y1, x2, y2


def qr_crop(image: np.ndarray, config: PipelineConfig) -> tuple[np.ndarray, tuple[int, int, int, int]] | None:
    # Algumas câmeras gravam a orientação no EXIF, mas o OpenCV recebe apenas
    # os pixels crus. Quando a folha está em paisagem, restaura-se a orientação
    # retrato antes de aplicar as coordenadas do layout oficial; isso permite
    # que as tentativas rotacionadas também usem o recorte do QR.
    if image.shape[1] >= image.shape[0]:
        image = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    coordinates = _crop_coordinates(image, config)
    if coordinates is None:
        return None
    x1, y1, x2, y2 = coordinates
    return image[y1:y2, x1:x2].copy(), coordinates


def _crop_candidates(crop: np.ndarray, config: PipelineConfig) -> list[tuple[str, np.ndarray]]:
    gray = _gray(crop)
    clahe = _clahe(crop)
    otsu = _otsu(crop)
    adaptive = _adaptive(crop)
    border = max(8, round(config.geometry.qr.white_border * crop.shape[1] / 400))
    bordered = cv2.copyMakeBorder(
        crop,
        border,
        border,
        border,
        border,
        cv2.BORDER_CONSTANT,
        value=(255, 255, 255),
    )
    return [
        ("color", crop),
        ("gray", gray),
        ("clahe", clahe),
        ("otsu", otsu),
        ("adaptive", adaptive),
        ("upscale-2x", cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)),
        ("upscale-4x", cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)),
        ("white-border", bordered),
        ("white-border-clahe", _clahe(bordered)),
    ]


def _read_stage(
    image: np.ndarray,
    stage: str,
    state: _ReadState,
    config: PipelineConfig,
    *,
    include_crop: bool,
    expected_token: str | None = None,
) -> QRReadResult | None:
    for degrees in (0, 90, 180, 270):
        rotated = rotate_quarter_turns(image, degrees)
        for variant, candidate in _full_page_candidates(rotated):
            result = _attempt(
                candidate,
                f"{stage}:full:{variant}:rot-{degrees}",
                state,
                rotation_degrees=degrees,
            )
            if result and (expected_token is None or result.token == expected_token):
                return result

        if not include_crop:
            continue
        cropped = qr_crop(rotated, config)
        if cropped is None:
            continue
        crop, coordinates = cropped
        for variant, candidate in _crop_candidates(crop, config):
            result = _attempt(
                candidate,
                f"{stage}:crop:{variant}:rot-{degrees}",
                state,
                rotation_degrees=degrees,
                crop_coordinates=coordinates,
            )
            if result and (expected_token is None or result.token == expected_token):
                return result
    return None


def read_qr_progressive(
    original: np.ndarray,
    normalized: np.ndarray | None,
    config: PipelineConfig,
) -> QRReadResult:
    state = _ReadState()
    original_result = _read_stage(original, "original", state, config, include_crop=False)
    if normalized is not None:
        normalized_result = _read_stage(
            normalized,
            "normalized",
            state,
            config,
            include_crop=True,
            expected_token=original_result.token if original_result else None,
        )
        if normalized_result:
            return normalized_result
    if original_result:
        return replace(original_result, attempts=state.attempts)

    if state.invalid_content_length is not None:
        status: QRStatus = "invalid_format"
    elif state.detected:
        status = "detected_not_decoded"
    else:
        status = "not_detected"
    return QRReadResult(
        status=status,
        token=None,
        strategy=None,
        detected=state.detected,
        decoded=False,
        content_length=state.invalid_content_length,
        bounding_box=state.last_bounding_box,
        attempts=state.attempts,
        rotation_degrees=None,
        crop_coordinates=None,
    )


def read_secure_token(image: np.ndarray, config: PipelineConfig | None = None) -> str | None:
    """Compatibility wrapper for callers that only need the validated token."""
    result = read_qr_progressive(image, None, config or PipelineConfig())
    return result.token
