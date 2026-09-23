from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class QRRegion:
    x: int
    y: int
    width: int
    height: int
    padding: int
    white_border: int = 32


@dataclass(frozen=True, slots=True)
class LayoutGeometry:
    page_width: int
    page_height: int
    qr: QRRegion
    marker_centers: tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]]


LAYOUT_GEOMETRIES = {
    "corrige-plus-v1": LayoutGeometry(
        page_width=2100,
        page_height=2970,
        qr=QRRegion(x=1660, y=380, width=280, height=280, padding=60),
        marker_centers=((165, 165), (1935, 165), (1935, 2845), (165, 2845)),
    ),
    "corrige-plus-v2-subject-blocks": LayoutGeometry(
        page_width=2100,
        page_height=2970,
        qr=QRRegion(x=1660, y=380, width=280, height=280, padding=60),
        marker_centers=((165, 165), (1935, 165), (1935, 2845), (165, 2845)),
    ),
}


@dataclass(frozen=True, slots=True)
class PipelineConfig:
    layout_version: str = "corrige-plus-v1"
    # Temporariamente desativado para calibração com fotos reduzidas.
    # Reativar com valores mínimos antes de publicar o serviço.
    min_width: int | None = None
    min_height: int | None = None
    min_brightness: float = 45.0
    max_brightness: float = 235.0
    # Fotos reais de celular costumam ter variância menor mesmo quando ainda
    # permitem ler o QR e as bolhas. Valores muito altos bloqueiam a etapa de
    # perspectiva antes que os marcadores sejam usados.
    min_blur_variance: float = 20.0
    bubble_mark_threshold: float = 0.55
    bubble_blank_threshold: float = 0.30
    bubble_darkness_ratio: float = 0.67
    dominance_margin: float = 0.12
    double_mark_margin: float = 0.06
    min_confidence: float = 0.62
    question_start_y_mm: float = 92.0
    question_spacing_y_mm: float = 7.2
    column_spacing_mm: float = 94.0
    first_bubble_x_mm: float = 28.0
    bubble_spacing_x_mm: float = 14.0
    bubble_radius_mm: float = 2.35
    debug_artifacts: bool = False

    @property
    def geometry(self) -> LayoutGeometry:
        try:
            return LAYOUT_GEOMETRIES[self.layout_version]
        except KeyError as exc:
            raise ValueError("UNSUPPORTED_LAYOUT") from exc

    @property
    def normalized_width(self) -> int:
        return self.geometry.page_width

    @property
    def normalized_height(self) -> int:
        return self.geometry.page_height

    @property
    def px_per_mm(self) -> float:
        return self.normalized_width / 210.0
