from dataclasses import dataclass
from itertools import combinations
import math
from typing import Literal

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


@dataclass(frozen=True, slots=True)
class DocumentDetectionResult:
    status: Literal["detected", "not_found", "invalid_geometry"]
    corners: np.ndarray | None
    strategy: Literal["markers", "contour"] | None
    marker_centers: np.ndarray | None = None


def _valid_page_corners(corners: np.ndarray, image_shape: tuple[int, ...]) -> bool:
    points = np.asarray(corners, dtype=np.float32)
    if points.shape != (4, 2) or not np.isfinite(points).all():
        return False

    height, width = image_shape[:2]
    if width < 2 or height < 2:
        return False
    ordered = _order(points).reshape(4, 1, 2)
    if not cv2.isContourConvex(ordered):
        return False

    area = abs(float(cv2.contourArea(ordered)))
    image_area = float(width * height)
    if not image_area * 0.05 <= area <= image_area * 1.5:
        return False

    xs = ordered[:, 0, 0]
    ys = ordered[:, 0, 1]
    if (
        float(xs.min()) < -width * 0.25
        or float(xs.max()) > width * 1.25
        or float(ys.min()) < -height * 0.25
        or float(ys.max()) > height * 1.25
    ):
        return False

    edges = np.roll(ordered[:, 0, :], -1, axis=0) - ordered[:, 0, :]
    lengths = np.linalg.norm(edges, axis=1)
    if float(lengths.min()) < max(2.0, min(width, height) * 0.04):
        return False
    side_a = max(float(lengths[0]), float(lengths[2]))
    side_b = max(float(lengths[1]), float(lengths[3]))
    portrait_ratio = min(side_a, side_b) / max(side_a, side_b)
    return 0.30 <= portrait_ratio <= 1.10


def _detect_marker_centers(
    image: np.ndarray,
    config: PipelineConfig | None = None,
) -> np.ndarray | None:
    pipeline_config = config or PipelineConfig()
    # Fiducial detection only needs enough pixels to recognize the printed
    # squares. Work on a bounded copy for phone photos; the returned centers
    # are mapped back to the untouched source image for the perspective warp.
    detection_scale = min(1.0, 1800.0 / max(image.shape[:2]))
    detection_image = (
        cv2.resize(
            image,
            None,
            fx=detection_scale,
            fy=detection_scale,
            interpolation=cv2.INTER_AREA,
        )
        if detection_scale < 1.0
        else image
    )
    gray = cv2.cvtColor(detection_image, cv2.COLOR_BGR2GRAY)
    image_area = detection_image.shape[0] * detection_image.shape[1]
    height, width = detection_image.shape[:2]
    corner_targets = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    quadrants = (
        lambda point: point[0] < width / 2 and point[1] < height / 2,
        lambda point: point[0] >= width / 2 and point[1] < height / 2,
        lambda point: point[0] >= width / 2 and point[1] >= height / 2,
        lambda point: point[0] < width / 2 and point[1] >= height / 2,
    )
    # O papel colorido/sombreado pode deslocar o nivel de cinza dos marcadores.
    # Preservamos os limiares globais conhecidos e acrescentamos mascaras locais
    # para recuperar marcadores fracos sem mudar a imagem usada nas bolhas.
    masks = [
        cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)[1]
        for threshold in (115, 125, 75, 105, 135, 165)
    ]
    local_gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    masks.extend(
        cv2.threshold(local_gray, threshold, 255, cv2.THRESH_BINARY_INV)[1]
        for threshold in (95, 125, 155, 185)
    )
    for block_size, offset in ((31, 5), (51, 7)):
        if min(height, width) > block_size:
            masks.append(
                cv2.adaptiveThreshold(
                    gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY_INV, block_size, offset,
                )
            )

    expected_marker_aspect = 1770.0 / 2680.0
    minimum_side = max(6.0, min(width, height) * 0.004)
    maximum_side = min(width, height) * 0.08
    candidates: list[tuple[np.ndarray, float, float]] = []
    for mask in masks:
        contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            area = cv2.contourArea(contour)
            if not max(25.0, image_area * 0.00001) <= area <= image_area * 0.003:
                continue
            x, y, marker_width, marker_height = cv2.boundingRect(contour)
            if (
                marker_height == 0
                or min(marker_width, marker_height) < minimum_side
                or max(marker_width, marker_height) > maximum_side
                or not 0.65 <= marker_width / marker_height <= 1.55
            ):
                continue
            perimeter = cv2.arcLength(contour, True)
            polygon = cv2.approxPolyDP(contour, 0.08 * perimeter, True)
            if not 4 <= len(polygon) <= 6 or area / max(marker_width * marker_height, 1) < 0.35:
                continue
            candidates.append(
                (
                    np.array([x + marker_width / 2, y + marker_height / 2], dtype=np.float32),
                    float(area),
                    float(area / max(marker_width * marker_height, 1)),
                )
            )
    # Merge nested contours from every threshold. A marker that is faint under
    # one threshold can then join the other three markers found under another.
    unique: list[tuple[np.ndarray, float, float]] = []
    for candidate in sorted(candidates, key=lambda item: (item[2], item[1]), reverse=True):
        point = candidate[0]
        if all(
            float(np.linalg.norm(point - existing[0]))
            > max(8.0, min(width, height) * 0.006)
            for existing in unique
        ):
            unique.append(candidate)
    if len(unique) < 4:
        return None
    unique = unique[:24]
    best_points: np.ndarray | None = None
    best_score = -float("inf")
    for quartet in combinations(unique, 4):
        points = np.asarray([item[0] for item in quartet], dtype=np.float32)
        sums = points.sum(axis=1)
        differences = np.diff(points, axis=1).ravel()
        ordered = np.array(
            [
                points[np.argmin(sums)],
                points[np.argmin(differences)],
                points[np.argmax(sums)],
                points[np.argmax(differences)],
            ],
            dtype=np.float32,
        )
        if len({tuple(point) for point in ordered}) != 4:
            continue
        contour = ordered.reshape(4, 1, 2)
        if not cv2.isContourConvex(contour):
            continue
        page_fits_frame = False
        for rotation in range(4):
            page_corners = _page_corners_from_markers(
                np.roll(ordered, rotation, axis=0), pipeline_config
            )
            if (
                _valid_page_corners(page_corners, detection_image.shape)
                and float(page_corners[:, 0].min()) >= -width * 0.02
                and float(page_corners[:, 0].max()) <= width * 1.02
                and float(page_corners[:, 1].min()) >= -height * 0.02
                and float(page_corners[:, 1].max()) <= height * 1.02
            ):
                page_fits_frame = True
                break
        if not page_fits_frame:
            continue
        area = abs(float(cv2.contourArea(contour)))
        if not image_area * 0.10 <= area <= image_area * 0.95:
            continue
        edges = np.linalg.norm(np.roll(ordered, -1, axis=0) - ordered, axis=1)
        if float(edges.min()) < min(width, height) * 0.10:
            continue
        ratio = float((edges[0] + edges[2]) / max(edges[1] + edges[3], 1.0))
        if not 0.35 <= ratio <= 2.85:
            continue
        horizontal_balance = max(edges[0], edges[2]) / max(min(edges[0], edges[2]), 1.0)
        vertical_balance = max(edges[1], edges[3]) / max(min(edges[1], edges[3]), 1.0)
        if horizontal_balance > 1.8 or vertical_balance > 1.8:
            continue
        ratio_penalty = min(
            abs(math.log(max(ratio, 0.001) / expected_marker_aspect)),
            abs(math.log(max(ratio, 0.001) * expected_marker_aspect)),
        )
        marker_quality = sum(item[2] for item in quartet) / 4
        score = math.log(area / image_area) - 0.7 * ratio_penalty + 0.1 * math.log(max(marker_quality, 1e-9))
        if score > best_score:
            best_score = score
            best_points = ordered
    if best_points is None:
        return None
    return best_points * np.float32(
        [image.shape[1] / detection_image.shape[1], image.shape[0] / detection_image.shape[0]]
    )


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


def detect_document_detailed(
    image: np.ndarray,
    config: PipelineConfig | None = None,
) -> DocumentDetectionResult:
    # Os marcadores pertencem ao modelo oficial do cartão e são mais confiáveis
    # que contornos externos em fotos sobre pisos, mesas ou azulejos.
    pipeline_config = config or PipelineConfig()
    marker_centers = _detect_marker_centers(image)
    invalid_marker_geometry = False
    if marker_centers is not None:
        # A photo may have any quarter-turn orientation. The marker grid is
        # rectangular and its four corners are cyclically equivalent, so test
        # the four rotations before deciding the geometry is invalid.
        for rotation in range(4):
            ordered_markers = np.roll(marker_centers, rotation, axis=0)
            corners = _page_corners_from_markers(ordered_markers, pipeline_config)
            height, width = image.shape[:2]
            if (
                _valid_page_corners(corners, image.shape)
                and float(corners[:, 0].min()) >= -width * 0.02
                and float(corners[:, 0].max()) <= width * 1.02
                and float(corners[:, 1].min()) >= -height * 0.02
                and float(corners[:, 1].max()) <= height * 1.02
            ):
                return DocumentDetectionResult(
                    "detected", corners, "markers", ordered_markers.copy()
                )
        # Marcadores espúrios/ambíguos não devem impedir uma segunda estratégia
        # independente baseada no contorno completo e geometricamente validado.
        invalid_marker_geometry = True

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    minimum_area = image.shape[0] * image.shape[1] * 0.25
    invalid_contour_geometry = False
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(contour) < minimum_area:
            break
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(polygon) == 4:
            corners = _order(polygon.reshape(4, 2).astype(np.float32))
            if _valid_page_corners(corners, image.shape):
                return DocumentDetectionResult("detected", corners, "contour")
            invalid_contour_geometry = True
    if invalid_marker_geometry or invalid_contour_geometry:
        return DocumentDetectionResult(
            "invalid_geometry",
            None,
            "markers" if invalid_marker_geometry else "contour",
        )
    return DocumentDetectionResult("not_found", None, None)


def detect_document(image: np.ndarray, config: PipelineConfig | None = None) -> np.ndarray | None:
    """Compatibility wrapper returning only the detected page corners."""
    return detect_document_detailed(image, config).corners


def normalize_perspective(
    image: np.ndarray,
    corners: np.ndarray,
    config: PipelineConfig,
    marker_centers: np.ndarray | None = None,
) -> np.ndarray:
    if not _valid_page_corners(corners, image.shape):
        raise ValueError("INVALID_DOCUMENT_GEOMETRY")

    profile = None
    try:
        from app.pipeline.layout_profiles import get_layout_profile

        profile = get_layout_profile(config.profile_id)
    except ValueError:
        raise
    if profile.normalized_geometry_size is not None:
        if marker_centers is None:
            # Compatibility for diagnostics and callers that kept only the
            # extrapolated page corners: project the known fiducial locations
            # back into the photo, then use the same direct fiducial warp.
            page_points = np.float32(
                [
                    [0, 0],
                    [config.normalized_width - 1, 0],
                    [config.normalized_width - 1, config.normalized_height - 1],
                    [0, config.normalized_height - 1],
                ]
            )
            page_to_photo = cv2.getPerspectiveTransform(
                page_points,
                _order(np.asarray(corners, dtype=np.float32)),
            )
            marker_centers = cv2.perspectiveTransform(
                np.asarray(config.geometry.marker_centers, dtype=np.float32).reshape(1, 4, 2),
                page_to_photo,
            ).reshape(4, 2)
        markers = np.asarray(marker_centers, dtype=np.float32)
        if markers.shape != (4, 2) or not np.isfinite(markers).all():
            raise ValueError("INVALID_DOCUMENT_GEOMETRY")
        target = np.float32(
            [
                [0, 0],
                [config.normalized_width - 1, 0],
                [config.normalized_width - 1, config.normalized_height - 1],
                [0, config.normalized_height - 1],
            ]
        )
        matrix = cv2.getPerspectiveTransform(markers, target)
        return cv2.warpPerspective(
            image,
            matrix,
            (config.normalized_width, config.normalized_height),
            flags=cv2.INTER_CUBIC,
        )

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
