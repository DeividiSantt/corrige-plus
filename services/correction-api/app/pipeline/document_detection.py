import cv2
import numpy as np

from app.pipeline.config import PipelineConfig


def _order(points: np.ndarray) -> np.ndarray:
    ordered = np.zeros((4, 2), dtype=np.float32)
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).ravel()
    ordered[0] = points[np.argmin(sums)]
    ordered[2] = points[np.argmax(sums)]
    ordered[1] = points[np.argmin(differences)]
    ordered[3] = points[np.argmax(differences)]
    return ordered


def _detect_marker_centers(image: np.ndarray) -> np.ndarray | None:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    image_area = image.shape[0] * image.shape[1]
    height, width = image.shape[:2]
    corner_targets = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    quadrants = (
        lambda point: point[0] < width / 2 and point[1] < height / 2,
        lambda point: point[0] >= width / 2 and point[1] < height / 2,
        lambda point: point[0] >= width / 2 and point[1] >= height / 2,
        lambda point: point[0] < width / 2 and point[1] >= height / 2,
    )
    # Fotos comprimidas ou superexpostas podem transformar os marcadores em
    # cinza claro. Tentamos limiares progressivos, mas preservamos o filtro
    # geométrico e a escolha por quadrantes para não aceitar bolhas como canto.
    for threshold in (75, 105, 135, 165):
        mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)[1]
        contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        candidates: list[np.ndarray] = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if not image_area * 0.00001 <= area <= image_area * 0.003:
                continue
            x, y, marker_width, marker_height = cv2.boundingRect(contour)
            if marker_height == 0 or not 0.30 <= marker_width / marker_height <= 3.00:
                continue
            perimeter = cv2.arcLength(contour, True)
            polygon = cv2.approxPolyDP(contour, 0.08 * perimeter, True)
            if not 4 <= len(polygon) <= 6 or area / max(marker_width * marker_height, 1) < 0.35:
                continue
            candidates.append(np.array([x + marker_width / 2, y + marker_height / 2], dtype=np.float32))
        if len(candidates) < 4:
            continue
        selected: list[np.ndarray] = []
        for predicate, target in zip(quadrants, corner_targets, strict=True):
            quadrant_candidates = [point for point in candidates if predicate(point)]
            if not quadrant_candidates:
                selected = []
                break
            selected.append(min(quadrant_candidates, key=lambda point: float(np.linalg.norm(point - target))))
        if len(selected) == 4:
            return np.array(selected, dtype=np.float32)
    return None


def _page_corners_from_markers(
    marker_centers: np.ndarray,
    config: PipelineConfig,
) -> np.ndarray:
    canonical_markers = np.array(config.geometry.marker_centers, dtype=np.float32)
    canonical_page = np.array(
        [
            [0, 0],
            [config.normalized_width - 1, 0],
            [config.normalized_width - 1, config.normalized_height - 1],
            [0, config.normalized_height - 1],
        ],
        dtype=np.float32,
    ).reshape(-1, 1, 2)
    canonical_to_photo = cv2.getPerspectiveTransform(canonical_markers, marker_centers)
    return cv2.perspectiveTransform(canonical_page, canonical_to_photo).reshape(4, 2)


def detect_document(image: np.ndarray, config: PipelineConfig | None = None) -> np.ndarray | None:
    # Os marcadores pertencem ao modelo oficial do cartão e são mais confiáveis
    # que contornos externos em fotos sobre pisos, mesas ou azulejos.
    pipeline_config = config or PipelineConfig()
    marker_centers = _detect_marker_centers(image)
    if marker_centers is not None:
        return _page_corners_from_markers(marker_centers, pipeline_config)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    minimum_area = image.shape[0] * image.shape[1] * 0.25
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(contour) < minimum_area:
            break
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(polygon) == 4:
            return _order(polygon.reshape(4, 2).astype(np.float32))
    return None


def normalize_perspective(image: np.ndarray, corners: np.ndarray, config: PipelineConfig) -> np.ndarray:
    top_left, top_right, bottom_right, bottom_left = _order(corners)
    measured_width = int(
        max(
            np.linalg.norm(top_right - top_left),
            np.linalg.norm(bottom_right - bottom_left),
        )
    )
    measured_height = int(
        max(
            np.linalg.norm(bottom_left - top_left),
            np.linalg.norm(bottom_right - top_right),
        )
    )
    if measured_width < 2 or measured_height < 2:
        raise ValueError("INVALID_DOCUMENT_GEOMETRY")

    natural_target = np.array(
        [
            [0, 0],
            [measured_width - 1, 0],
            [measured_width - 1, measured_height - 1],
            [0, measured_height - 1],
        ],
        dtype=np.float32,
    )
    natural_matrix = cv2.getPerspectiveTransform(
        np.array([top_left, top_right, bottom_right, bottom_left], dtype=np.float32),
        natural_target,
    )
    normalized = cv2.warpPerspective(image, natural_matrix, (measured_width, measured_height))
    if measured_width > measured_height:
        normalized = cv2.rotate(normalized, cv2.ROTATE_90_CLOCKWISE)

    return cv2.resize(
        normalized,
        (config.normalized_width, config.normalized_height),
        interpolation=cv2.INTER_AREA if normalized.shape[1] > config.normalized_width else cv2.INTER_CUBIC,
    )


def rotate_quarter_turns(image: np.ndarray, degrees: int) -> np.ndarray:
    normalized_degrees = degrees % 360
    if normalized_degrees == 0:
        return image
    if normalized_degrees == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    if normalized_degrees == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    if normalized_degrees == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    raise ValueError("Rotation must be a multiple of 90 degrees.")
