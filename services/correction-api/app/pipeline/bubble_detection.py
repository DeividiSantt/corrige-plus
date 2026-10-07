from dataclasses import dataclass

import cv2
import numpy as np

from app.pipeline.config import PipelineConfig
from app.pipeline.layout_profiles import build_bubble_positions, get_layout_profile


@dataclass(frozen=True, slots=True)
class BubbleAnswer:
    question_number: int
    detected_answer: str | None
    classification: str
    confidence: float
    fill_percentages: dict[str, float]
    crop: tuple[int, int, int, int]


def _classify_fills(
    fills: dict[str, float], config: PipelineConfig, blank_threshold: float | None = None
) -> tuple[str, str | None, float]:
    ranked = sorted(fills.items(), key=lambda item: item[1], reverse=True)
    if len(ranked) < 2:
        return "uncertain", None, 0.0

    blank_threshold = (
        config.bubble_blank_threshold if blank_threshold is None else blank_threshold
    )
    (first_option, strongest), (_, runner_up) = ranked[:2]
    if strongest < blank_threshold:
        confidence = 1.0 - strongest / max(blank_threshold, 0.001)
        return "blank", None, round(max(0.0, min(1.0, confidence)), 4)

    if (
        strongest >= config.bubble_multiple_threshold
        and runner_up >= config.bubble_multiple_threshold
    ):
        confidence = min(strongest, runner_up)
        return "multiple", None, round(max(0.0, min(1.0, confidence)), 4)

    margin = strongest - runner_up
    if strongest >= config.bubble_mark_threshold and margin >= config.dominance_margin:
        strength_confidence = (strongest - config.bubble_mark_threshold) / max(
            1.0 - config.bubble_mark_threshold, 0.001
        )
        margin_confidence = margin / max(config.dominance_margin * 2.0, 0.001)
        confidence = min(1.0, strength_confidence, margin_confidence)
        return "answered", first_option, round(confidence, 4)

    # Keep a candidate out of detected_answer until the reviewer confirms it.
    uncertainty = min(1.0, max(strongest, margin))
    return "uncertain", None, round(uncertainty, 4)


def _circle_masks(
    radius_px: int, option: str, scale: float, profile
) -> tuple[np.ndarray, np.ndarray]:
    size = radius_px * 2 + 1
    yy, xx = np.ogrid[:size, :size]
    center = radius_px
    distance = np.sqrt((xx - center) ** 2 + (yy - center) ** 2)

    # Sample the interior but exclude the printed option glyph, whose location
    # is fixed by the PDF renderer (the letter sits to the lower-left).
    inner = distance <= radius_px * 0.68
    label_left = center + int(round((profile.bubble_label_offset_x_mm - 0.15) * scale))
    label_right = center + int(round((profile.bubble_label_offset_x_mm + 1.35) * scale))
    label_top = center + int(round((profile.bubble_label_baseline_y_mm - 2.6) * scale))
    label_bottom = center + int(round((profile.bubble_label_baseline_y_mm + 0.2) * scale))
    if option in "ABCDE":
        inner[label_top:label_bottom, label_left:label_right] = False

    # The paper baseline comes from just outside the printed circle outline.
    # The annulus is wide enough to tolerate small residual page warp.
    background = (distance >= radius_px * 1.12) & (distance <= radius_px * 1.62)
    return inner.astype(bool), background.astype(bool)


def _bubble_fill(
    image: np.ndarray,
    center_x: int,
    center_y: int,
    radius_px: int,
    option: str,
    config: PipelineConfig,
) -> float:
    outer = int(np.ceil(radius_px * 1.65))
    x1, x2 = center_x - outer, center_x + outer + 1
    y1, y2 = center_y - outer, center_y + outer + 1
    if x1 < 0 or y1 < 0 or x2 > image.shape[1] or y2 > image.shape[0]:
        return 0.0

    patch = image[y1:y2, x1:x2]
    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    offset = outer - radius_px
    profile = get_layout_profile(config.profile_id)
    inner_mask, background_mask = _circle_masks(radius_px, option, config.px_per_mm, profile)
    sample_inner = np.zeros(gray.shape, dtype=bool)
    sample_background = np.zeros(gray.shape, dtype=bool)
    sample_inner[offset:offset + inner_mask.shape[0], offset:offset + inner_mask.shape[1]] = inner_mask
    sample_background[offset:offset + background_mask.shape[0], offset:offset + background_mask.shape[1]] = background_mask

    paper_gray = float(np.median(gray[sample_background]))
    paper_hsv = np.median(hsv[sample_background], axis=0)
    ink_dark = gray <= paper_gray - max(24.0, paper_gray * 0.27)

    hue_delta = np.abs(hsv[:, :, 0].astype(np.float32) - float(paper_hsv[0]))
    hue_delta = np.minimum(hue_delta, 180.0 - hue_delta)
    ink_color = (
        (hsv[:, :, 1] >= max(85.0, float(paper_hsv[1]) + 30.0))
        & (hue_delta >= 14.0)
        & (hsv[:, :, 2] <= min(238.0, float(paper_hsv[2]) + 8.0))
    )
    ink = ink_dark | ink_color
    ink_interior = ink & sample_inner
    return round(float(np.count_nonzero(ink_interior)) / max(1, int(np.count_nonzero(sample_inner))), 4)


def read_bubbles(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict] | None = None,
) -> list[BubbleAnswer]:
    """Read only the option ROIs specified by the selected printed layout."""
    if image is None or image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("INVALID_IMAGE")
    profile = get_layout_profile(config.profile_id)
    positions = build_bubble_positions(
        total_questions,
        alternatives_count,
        config,
        subject_blocks,
    )
    scale = config.px_per_mm
    if profile.normalized_bubble_radius is not None:
        radius_x = profile.normalized_bubble_radius[0] * config.normalized_width
        radius_y = profile.normalized_bubble_radius[1] * config.normalized_height
        radius_px = max(4, int(round((radius_x + radius_y) / 2)))
    else:
        radius_px = max(4, int(round(profile.bubble_radius_mm * scale)))
    options = tuple("ABCDE"[:alternatives_count])
    answers: list[BubbleAnswer] = []

    for question_position, option_centers in positions:
        fills = {
            option: _bubble_fill(
                image,
                int(round(option_centers[option][0] * scale)),
                int(round(option_centers[option][1] * scale)),
                radius_px,
                option,
                config,
            )
            for option in options
        }
        # Fotos reais de cartões CHS vazios têm pequenos resíduos (letras,
        # contorno impresso e compressão) de até ~0,13. Trate essa faixa como
        # branco sem alterar o limiar dos demais layouts.
        blank_threshold = (
            max(config.bubble_blank_threshold, 0.15)
            if profile.normalized_bubble_radius is not None
            else config.bubble_blank_threshold
        )
        classification, detected_answer, confidence = _classify_fills(
            fills, config, blank_threshold
        )
        first_x = int(round(option_centers[options[0]][0] * scale))
        last_x = int(round(option_centers[options[-1]][0] * scale))
        center_y = int(round(question_position.center_y_mm * scale))
        padding = radius_px + int(round(1.5 * scale))
        crop = (
            max(0, first_x - padding),
            max(0, center_y - padding),
            min(image.shape[1], last_x + padding),
            min(image.shape[0], center_y + padding),
        )
        answers.append(
            BubbleAnswer(
                question_position.question_number,
                detected_answer,
                classification,
                confidence,
                fills,
                crop,
            )
        )

    return answers


def read_bubbles_with_orientation_fallback(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict] | None = None,
) -> tuple[list[BubbleAnswer], int]:
    """Compatibility wrapper: orient by page shape, then perform one fixed-ROI read.

    Production normalizes orientation from the four page fiducials before this
    step. This wrapper remains for diagnostic scripts and does not score several
    layouts or choose whichever rotation happens to produce more answers.
    """
    if image.shape[1] > image.shape[0]:
        image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
        rotation = 90
    else:
        rotation = 0
    return read_bubbles(image, total_questions, alternatives_count, config, subject_blocks), rotation
