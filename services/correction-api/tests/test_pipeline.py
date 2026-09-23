import cv2
import numpy as np

from app.pipeline.bubble_detection import read_bubbles, read_bubbles_with_orientation_fallback
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective
from app.pipeline.image_quality import analyze_quality, decode_image


def synthetic_card(config: PipelineConfig) -> np.ndarray:
    image = np.full((config.normalized_height, config.normalized_width, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (8, 8), (config.normalized_width - 8, config.normalized_height - 8), (0, 0, 0), 12)
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
