import asyncio

import cv2
import numpy as np
import pytest

from app.pipeline.bubble_detection import _classify_fills, read_bubbles, read_bubbles_with_orientation_fallback
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import (
    DocumentDetectionResult,
    detect_document,
    detect_document_detailed,
    normalize_perspective,
)
from app.pipeline.image_quality import QualityResult, analyze_quality, decode_image
from app.pipeline.qr_reader import QRReadResult


def synthetic_card(config: PipelineConfig) -> np.ndarray:
    image = np.full((config.normalized_height, config.normalized_width, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (8, 8), (config.normalized_width - 8, config.normalized_height - 8), (0, 0, 0), 12)
    return image


def marker_card(config: PipelineConfig, marker_value: int = 170) -> np.ndarray:
    image = np.full((config.normalized_height, config.normalized_width, 3), 215, dtype=np.uint8)
    for x, y in config.geometry.marker_centers:
        cv2.rectangle(image, (x - 20, y - 20), (x + 20, y + 20), (marker_value,) * 3, -1)
    return image


def mark(image: np.ndarray, question: int, option: int, config: PipelineConfig) -> None:
    scale = config.px_per_mm
    x = int((config.first_bubble_x_mm + option * config.bubble_spacing_x_mm) * scale)
    y = int((config.question_start_y_mm + (question - 1) * config.question_spacing_y_mm) * scale)
    cv2.circle(image, (x, y), int(config.bubble_radius_mm * scale) - 4, (0, 0, 0), -1)


def test_valid_image_quality_and_decode() -> None:
    config = PipelineConfig()
    image = synthetic_card(config)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    decoded = decode_image(encoded.tobytes())
    quality = analyze_quality(decoded, config)
    assert "low_resolution" not in quality.problems
    assert "blurred" not in quality.problems


def test_document_detection_and_perspective() -> None:
    config = PipelineConfig()
    image = synthetic_card(config)
    corners = detect_document(image)
    assert corners is not None
    normalized = normalize_perspective(image, corners, config)
    assert normalized.shape[:2] == (config.normalized_height, config.normalized_width)


def test_weak_corner_markers_are_detected_without_a_dark_page_border() -> None:
    config = PipelineConfig()
    result = detect_document_detailed(marker_card(config), config)

    assert result.status == "detected"
    assert result.strategy == "markers"
    assert result.corners is not None


@pytest.mark.parametrize(
    "rotation",
    [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE],
)
def test_corner_markers_align_quarter_turn_photos(rotation: int) -> None:
    config = PipelineConfig()
    photographed = cv2.rotate(marker_card(config), rotation)
    result = detect_document_detailed(photographed, config)

    assert result.status == "detected"
    assert result.strategy == "markers"
    assert normalize_perspective(photographed, result.corners, config).shape[:2] == (
        config.normalized_height,
        config.normalized_width,
    )


def test_perspective_corner_markers_produce_validated_page_alignment() -> None:
    config = PipelineConfig()
    source = marker_card(config, marker_value=105)
    source_points = np.float32(
        [
            [0, 0],
            [config.normalized_width - 1, 0],
            [config.normalized_width - 1, config.normalized_height - 1],
            [0, config.normalized_height - 1],
        ]
    )
    photo_points = np.float32([[145, 110], [2050, 40], [2140, 3420], [65, 3510]])
    transform = cv2.getPerspectiveTransform(source_points, photo_points)
    photographed = cv2.warpPerspective(source, transform, (2200, 3600), borderValue=(230, 230, 230))

    result = detect_document_detailed(photographed, config)

    assert result.status == "detected"
    assert result.strategy == "markers"
    normalized = normalize_perspective(photographed, result.corners, config)
    assert normalized.shape[:2] == (config.normalized_height, config.normalized_width)


def test_missing_markers_and_page_contour_reports_document_not_found() -> None:
    config = PipelineConfig()
    image = np.full((config.normalized_height, config.normalized_width, 3), 215, dtype=np.uint8)

    result = detect_document_detailed(image, config)

    assert result.status == "not_found"
    assert result.corners is None


def test_bad_marker_candidate_can_fall_back_to_valid_page_contour(monkeypatch) -> None:
    import app.pipeline.document_detection as detection

    config = PipelineConfig()
    image = synthetic_card(config)
    monkeypatch.setattr(
        detection,
        "_detect_marker_centers",
        lambda _: np.zeros((4, 2), dtype=np.float32),
    )

    result = detection.detect_document_detailed(image, config)

    assert result.status == "detected"
    assert result.strategy == "contour"


def test_invalid_geometry_is_rejected_before_bubble_reading(monkeypatch) -> None:
    from app.pipeline import pipeline

    config = PipelineConfig()
    image = synthetic_card(config)
    ok, encoded = cv2.imencode(".png", image)
    assert ok

    async def download(_: str) -> bytes:
        return encoded.tobytes()

    monkeypatch.setattr(pipeline, "_download_signed_image", download)
    monkeypatch.setattr(
        pipeline,
        "read_qr_progressive",
        lambda *_: pytest.fail("QR reading must wait until geometry is validated"),
    )
    monkeypatch.setattr(
        pipeline,
        "detect_document_detailed",
        lambda *_: DocumentDetectionResult("invalid_geometry", None, "markers"),
    )

    result = asyncio.run(
        pipeline.process_signed_image("https://example.invalid/photo", 10, 5, config)
    )

    assert result["status"] == "resubmission_required"
    assert result["error_code"] == "invalid_document_geometry"
    assert result["answers"] == []
    assert result["qr_read"] is None
    assert result["processing_stages"]["qr"] == "not_attempted"
    assert result["processing_stages"]["document_detection"] == "invalid_geometry"


def test_process_reads_bubbles_when_qr_is_missing_and_document_is_aligned(monkeypatch) -> None:
    from app.pipeline import pipeline

    config = PipelineConfig()
    image = synthetic_card(config)
    ok, encoded = cv2.imencode(".png", image)
    assert ok

    async def download(_: str) -> bytes:
        return encoded.tobytes()

    qr = QRReadResult(
        status="not_detected", token=None, strategy=None, detected=False,
        decoded=False, content_length=None, bounding_box=None, attempts=1,
        rotation_degrees=None, crop_coordinates=None,
    )
    monkeypatch.setattr(pipeline, "_download_signed_image", download)
    monkeypatch.setattr(pipeline, "read_qr_progressive", lambda *args: qr)

    result = asyncio.run(
        pipeline.process_signed_image("https://example.invalid/photo", 10, 5, config)
    )

    assert result["status"] == "review_required"
    assert result["error_code"] == "qr_not_detected"
    assert len(result["answers"]) == 10
    assert result["secure_token"] is None
    assert result["processing_stages"]["document_detection"] == "detected"
    assert result["processing_stages"]["normalization"] == "completed"


def test_blur_warning_does_not_prevent_bubble_reading_when_qr_is_missing(monkeypatch) -> None:
    from app.pipeline import pipeline

    config = PipelineConfig()
    image = synthetic_card(config)
    ok, encoded = cv2.imencode(".png", image)
    assert ok

    async def download(_: str) -> bytes:
        return encoded.tobytes()

    qr = QRReadResult(
        status="not_detected", token=None, strategy=None, detected=False,
        decoded=False, content_length=None, bounding_box=None, attempts=1,
        rotation_degrees=None, crop_coordinates=None,
    )
    monkeypatch.setattr(pipeline, "_download_signed_image", download)
    monkeypatch.setattr(pipeline, "read_qr_progressive", lambda *args: qr)
    monkeypatch.setattr(
        pipeline,
        "analyze_quality",
        lambda *_: QualityResult(180.0, 20.0, 5.0, ("blurred",)),
    )

    result = asyncio.run(
        pipeline.process_signed_image("https://example.invalid/photo", 10, 5, config)
    )

    assert len(result["answers"]) == 10
    assert result["processing_stages"]["image_quality"] == "warning"


def test_blank_single_and_double_answers() -> None:
    config = PipelineConfig()
    blank = synthetic_card(config)
    blank_result = read_bubbles(blank, 10, 5, config)
    assert blank_result[0].classification == "blank"

    single = synthetic_card(config)
    mark(single, 1, 1, config)
    single_result = read_bubbles(single, 10, 5, config)
    assert single_result[0].classification == "answered"
    assert single_result[0].detected_answer == "B"

    double = synthetic_card(config)
    mark(double, 1, 0, config)
    mark(double, 1, 1, config)
    double_result = read_bubbles(double, 10, 5, config)
    assert double_result[0].classification == "multiple"


def test_answer_safety_policy_accepts_clear_marks_and_flags_uncertain_ones() -> None:
    config = PipelineConfig()

    clear_classification, clear_answer, _ = _classify_fills(
        {"A": 0.60, "B": 0.38, "C": 0.02, "D": 0.01, "E": 0.01}, config
    )
    assert (clear_classification, clear_answer) == ("answered", "A")

    ambiguous_classification, ambiguous_answer, _ = _classify_fills(
        {"A": 0.51, "B": 0.47, "C": 0.02, "D": 0.01, "E": 0.01}, config
    )
    assert (ambiguous_classification, ambiguous_answer) == ("low_confidence", "A")

    double_classification, double_answer, _ = _classify_fills(
        {"A": 0.66, "B": 0.63, "C": 0.01, "D": 0.01, "E": 0.01}, config
    )
    assert (double_classification, double_answer) == ("multiple", None)

    blank_classification, blank_answer, _ = _classify_fills(
        {"A": 0.12, "B": 0.10, "C": 0.08, "D": 0.06, "E": 0.04}, config
    )
    assert (blank_classification, blank_answer) == ("blank", None)


def test_dark_and_blurred_images_are_rejected() -> None:
    config = PipelineConfig()
    dark = np.full((1400, 1000, 3), 20, dtype=np.uint8)
    quality = analyze_quality(dark, config)
    assert "too_dark" in quality.problems
    assert "blurred" in quality.problems


def test_controlled_answer_sequence() -> None:
    config = PipelineConfig()
    image = synthetic_card(config)
    expected = ["B", "B", "C", "E", "E", "A", "B", "C", "D", "E"]
    for question, answer in enumerate(expected, start=1):
        mark(image, question, "ABCDE".index(answer), config)

    answers = read_bubbles(image, 10, 5, config)

    assert [answer.detected_answer for answer in answers] == expected
    assert all(answer.classification == "answered" for answer in answers)


def test_answer_orientation_fallback_recovers_landscape_card() -> None:
    config = PipelineConfig()
    image = synthetic_card(config)
    expected = ["A", "B", "C", "D", "E", "A", "C", "D", "B", "C"]
    for question, answer in enumerate(expected, start=1):
        mark(image, question, "ABCDE".index(answer), config)

    landscape = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    answers, rotation = read_bubbles_with_orientation_fallback(landscape, 10, 5, config)

    assert rotation == 90
    assert [answer.detected_answer for answer in answers] == expected


def test_orientation_fallback_does_not_fail_when_the_rotated_grid_is_too_tall() -> None:
    config = PipelineConfig()
    image = synthetic_card(config)
    for question in range(1, 51):
        mark(image, question, (question - 1) % 5, config)

    answers, _ = read_bubbles_with_orientation_fallback(image, 50, 5, config)

    assert len(answers) == 50
