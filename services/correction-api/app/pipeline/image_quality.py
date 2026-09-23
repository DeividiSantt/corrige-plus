from dataclasses import dataclass

import cv2
import numpy as np

from app.pipeline.config import PipelineConfig


@dataclass(frozen=True, slots=True)
class QualityResult:
    brightness: float
    contrast: float
    blur_variance: float
    problems: tuple[str, ...]


def decode_image(content: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("invalid_image")
    return image


def analyze_quality(image: np.ndarray, config: PipelineConfig) -> QualityResult:
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = float(gray.mean())
    contrast = float(gray.std())
    blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    problems: list[str] = []
    if (
        (config.min_width is not None and width < config.min_width)
        or (config.min_height is not None and height < config.min_height)
    ):
        problems.append("low_resolution")
    if brightness < config.min_brightness:
        problems.append("too_dark")
    if brightness > config.max_brightness:
        problems.append("too_bright")
    if blur_variance < config.min_blur_variance:
        problems.append("blurred")
    return QualityResult(brightness, contrast, blur_variance, tuple(problems))
