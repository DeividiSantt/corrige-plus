from pathlib import Path

import cv2
import numpy as np
import pytest

from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective
from app.pipeline.qr_reader import read_qr_progressive

VALID_TOKEN = "0123456789abcdef" * 3


def qr_image(content: str, size: int = 280) -> np.ndarray:
    encoded = cv2.QRCodeEncoder_create().encode(content)
    with_quiet_zone = cv2.copyMakeBorder(
        encoded,
        1,
        1,
        1,
        1,
        cv2.BORDER_CONSTANT,
        value=255,
    )
    return cv2.cvtColor(
        cv2.resize(with_quiet_zone, (size, size), interpolation=cv2.INTER_NEAREST),
        cv2.COLOR_GRAY2BGR,
    )


def card_with_qr(content: str, config: PipelineConfig) -> np.ndarray:
    page = np.full((config.normalized_height, config.normalized_width, 3), 255, dtype=np.uint8)
    cv2.rectangle(page, (8, 8), (config.normalized_width - 8, config.normalized_height - 8), (0, 0, 0), 12)
    region = config.geometry.qr
    page[region.y : region.y + region.height, region.x : region.x + region.width] = qr_image(content)
    return page


def test_decodes_valid_secure_token_from_known_crop() -> None:
    config = PipelineConfig()
    page = card_with_qr(VALID_TOKEN, config)
    low_resolution = cv2.resize(page, (794, 1123), interpolation=cv2.INTER_AREA)
    blank_original = np.full((160, 120, 3), 255, dtype=np.uint8)

    result = read_qr_progressive(blank_original, low_resolution, config)

    assert result.status == "decoded"
    assert result.token == VALID_TOKEN
    assert result.strategy is not None
    assert result.attempts > 0


def test_rejects_decoded_content_outside_secure_token_format() -> None:
    config = PipelineConfig()
    page = card_with_qr("student-name-and-personal-data", config)
    blank_original = np.full((160, 120, 3), 255, dtype=np.uint8)

    result = read_qr_progressive(blank_original, page, config)

    assert result.status == "invalid_format"
    assert result.token is None
    assert result.content_length == len("student-name-and-personal-data")


def test_distinguishes_detected_but_not_decoded(monkeypatch: pytest.MonkeyPatch) -> None:
    class Detector:
        def detectAndDecode(self, image: np.ndarray):
            del image
            points = np.array([[[2, 2], [20, 2], [20, 20], [2, 20]]], dtype=np.float32)
            return "", points, None

    monkeypatch.setattr(cv2, "QRCodeDetector", Detector)
    image = np.full((160, 120, 3), 255, dtype=np.uint8)

    result = read_qr_progressive(image, None, PipelineConfig())

    assert result.status == "detected_not_decoded"
    assert result.detected is True
    assert result.decoded is False


@pytest.mark.parametrize("rotation", [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE])
def test_landscape_photo_is_normalized_before_qr_reading(rotation: int) -> None:
    config = PipelineConfig()
    photographed = cv2.rotate(card_with_qr(VALID_TOKEN, config), rotation)
    corners = detect_document(photographed)
    assert corners is not None

    normalized = normalize_perspective(photographed, corners, config)
    result = read_qr_progressive(photographed, normalized, config)

    assert normalized.shape[:2] == (config.normalized_height, config.normalized_width)
    assert result.status == "decoded"
    assert result.token == VALID_TOKEN


def test_real_qr_fixture_when_available() -> None:
    fixture = Path(__file__).parent / "fixtures" / "real" / "qr-failure-01.png"
    if not fixture.exists():
        pytest.skip("Foto real local não está disponível.")
    config = PipelineConfig()
    image = cv2.imdecode(np.fromfile(fixture, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert image is not None
    corners = detect_document(image, config)
    assert corners is not None

    normalized = normalize_perspective(image, corners, config)
    qr_result = read_qr_progressive(image, normalized, config)

    assert qr_result.status == "decoded"
    assert qr_result.token is not None
    assert len(qr_result.token) == 48
