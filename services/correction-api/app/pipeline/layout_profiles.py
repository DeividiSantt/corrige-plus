from dataclasses import dataclass

from app.pipeline.config import PipelineConfig


@dataclass(frozen=True, slots=True)
class BubblePosition:
    question_number: int
    column: int
    center_x_mm: float
    center_y_mm: float


@dataclass(frozen=True, slots=True)
class LayoutProfile:
    profile_id: str
    question_start_y_mm: float = 92.0
    question_spacing_y_mm: float = 7.2
    first_bubble_x_mm: float = 28.0
    column_spacing_mm: float = 94.0
    bubble_spacing_x_mm: float = 14.0
    bubble_radius_mm: float = 3.3
    bubble_label_offset_x_mm: float = -1.6
    bubble_label_baseline_y_mm: float = 1.2
    subject_heading_spacing_mm: float = 10.0
    column_start_y_mm: tuple[float, ...] = (92.0, 92.0)
    subject_block_positions_mm: tuple[tuple[int, float, float], ...] = ()
    supports_subject_blocks: bool = False
    normalized_x_columns: tuple[tuple[float, ...], ...] = ()
    normalized_y_rows: tuple[tuple[float, ...], ...] = ()
    normalized_bubble_radius: tuple[float, float] | None = None
    normalized_geometry_size: tuple[int, int] | None = None


LAYOUT_PROFILES = {
    "corrige-plus-v1": LayoutProfile("corrige-plus-v1"),
    "corrige-plus-v2-subject-blocks": LayoutProfile(
        "corrige-plus-v2-subject-blocks",
        column_spacing_mm=94.0,
        column_start_y_mm=(99.2, 92.0),
        subject_block_positions_mm=(
            (1, 28.0, 109.2),
            (11, 28.0, 191.2),
            (21, 128.0, 102.0),
            (31, 122.0, 184.0),
        ),
        supports_subject_blocks=True,
        # Calibrated from corrige_geometry.json / corrige_geometry_overlay.jpg.
        # Coordinates are fractions of the marker-to-marker canonical canvas,
        # not measurements in the original camera image.
        normalized_x_columns=(
            (0.0757, 0.15325, 0.2313, 0.30995, 0.38765),
            (0.59665, 0.67405, 0.7526, 0.83155, 0.91065),
        ),
        normalized_y_rows=(
            (0.32564, 0.35186, 0.37864, 0.40507, 0.43186, 0.45793, 0.4835, 0.51071, 0.53686, 0.56329),
            (0.62586, 0.65229, 0.67857, 0.705, 0.73179, 0.75707, 0.78393, 0.81036, 0.83743, 0.86393),
        ),
        normalized_bubble_radius=(0.018, 0.01286),
        normalized_geometry_size=(1000, 1400),
    ),
}


def get_layout_profile(profile_id: str) -> LayoutProfile:
    try:
        return LAYOUT_PROFILES[profile_id]
    except KeyError as exc:
        raise ValueError("UNSUPPORTED_LAYOUT") from exc


def build_bubble_positions(
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict] | None = None,
) -> list[tuple[BubblePosition, dict[str, tuple[float, float]]]]:
    """Resolve the printed PDF geometry to fixed per-question, per-option ROIs."""
    if not 1 <= total_questions <= 50:
        raise ValueError("INVALID_QUESTION_COUNT")
    if not 2 <= alternatives_count <= 5:
        raise ValueError("INVALID_ALTERNATIVES_COUNT")

    profile = get_layout_profile(config.profile_id)
    blocks = subject_blocks or []
    if blocks and not profile.supports_subject_blocks:
        raise ValueError("LAYOUT_PROFILE_MISMATCH")

    block_starts: set[int] = set()
    covered: set[int] = set()
    for block in blocks:
        try:
            start = int(block["start_question_number"])
            end = int(block["end_question_number"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("INVALID_SUBJECT_BLOCKS") from exc
        if start < 1 or end < start or end > total_questions:
            raise ValueError("INVALID_SUBJECT_BLOCKS")
        block_questions = set(range(start, end + 1))
        if covered.intersection(block_questions):
            raise ValueError("INVALID_SUBJECT_BLOCKS")
        covered.update(block_questions)
        block_starts.add(start)
    if blocks and covered != set(range(1, total_questions + 1)):
        raise ValueError("INVALID_SUBJECT_BLOCKS")

    columns = 2 if total_questions > 25 else 1
    questions_per_column = (total_questions + columns - 1) // columns
    if len(profile.column_start_y_mm) < columns:
        raise ValueError("LAYOUT_PROFILE_MISMATCH")
    current_y = list(profile.column_start_y_mm[:columns])
    current_x = [
        profile.first_bubble_x_mm + column * profile.column_spacing_mm
        for column in range(columns)
    ]
    block_positions = {
        question: (center_x, center_y)
        for question, center_x, center_y in profile.subject_block_positions_mm
    }
    options = tuple("ABCDE"[:alternatives_count])
    resolved: list[tuple[BubblePosition, dict[str, tuple[float, float]]]] = []

    for question in range(1, total_questions + 1):
        column = (question - 1) // questions_per_column
        row_in_column = (question - 1) % questions_per_column
        uses_headings = profile.supports_subject_blocks and bool(blocks)
        if profile.normalized_geometry_size is not None:
            if not uses_headings or columns != 2 or questions_per_column != 20:
                raise ValueError("LAYOUT_PROFILE_MISMATCH")
            block_index = 0 if question <= 10 or 21 <= question <= 30 else 1
            row_index = (question - 1) % 10
            x_column = 0 if column == 0 else 1
            normalized_xs = profile.normalized_x_columns[x_column]
            normalized_y = profile.normalized_y_rows[block_index][row_index]
            center_x = normalized_xs[0] * config.normalized_width / config.px_per_mm
            center_y = normalized_y * config.normalized_height / config.px_per_mm
            option_centers = {
                option: (
                    normalized_xs[index] * config.normalized_width / config.px_per_mm,
                    center_y,
                )
                for index, option in enumerate(options)
            }
            position = BubblePosition(question, column, center_x, center_y)
            resolved.append((position, option_centers))
            continue
        if uses_headings and (question in block_starts or row_in_column == 0):
            if question in block_starts and question in block_positions:
                current_x[column], current_y[column] = block_positions[question]
            else:
                current_y[column] += profile.subject_heading_spacing_mm
        center_y = (
            current_y[column]
            if uses_headings
            else current_y[column] + row_in_column * profile.question_spacing_y_mm
        )
        center_x = current_x[column] if uses_headings else profile.first_bubble_x_mm + column * profile.column_spacing_mm
        position = BubblePosition(question, column, center_x, center_y)
        option_centers = {
            option: (center_x + index * profile.bubble_spacing_x_mm, center_y)
            for index, option in enumerate(options)
        }
        resolved.append((position, option_centers))
        if uses_headings:
            current_y[column] += profile.question_spacing_y_mm

    return resolved
