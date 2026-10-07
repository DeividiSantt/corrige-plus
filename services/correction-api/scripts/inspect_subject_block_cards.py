"""Diagnóstico local de cartões multidisciplinares de 40 questões.

Não envia arquivos à API, não grava no banco e não altera resultados. Ele mede
se cada etapa do leitor consegue interpretar fotos reais do layout com quatro
blocos de matérias.

Uso:
  $env:PYTHONPATH = (Resolve-Path '.').Path
  .\\.venv\\Scripts\\python.exe .\\scripts\\inspect_subject_block_cards.py FOTO1 FOTO2
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

from app.pipeline.bubble_detection import read_bubbles
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective
from app.pipeline.layout_profiles import build_bubble_positions, get_layout_profile


SUBJECT_BLOCKS = [
    {"subject": "Matemática", "start_question_number": 1, "end_question_number": 10, "position": 0},
    {"subject": "Física", "start_question_number": 11, "end_question_number": 20, "position": 1},
    {"subject": "Biologia", "start_question_number": 21, "end_question_number": 30, "position": 2},
    {"subject": "Química", "start_question_number": 31, "end_question_number": 40, "position": 3},
]


def format_block(answers: list, block: dict) -> str:
    start = int(block["start_question_number"]) - 1
    end = int(block["end_question_number"])
    current = answers[start:end]
    marks = "".join(answer.detected_answer or "-" for answer in current)
    counts = {
        "answer": sum(answer.classification == "answered" for answer in current),
        "uncertain": sum(answer.classification == "uncertain" for answer in current),
        "multiple": sum(answer.classification == "multiple" for answer in current),
        "blank": sum(answer.classification == "blank" for answer in current),
    }
    return (
        f"  {block['subject']:<10} {marks} "
        f"(respondidas={counts['answer']}, incertas={counts['uncertain']}, "
        f"múltiplas={counts['multiple']}, brancas={counts['blank']})"
    )


def inspect(photo: Path, config: PipelineConfig, debug_dir: Path | None) -> None:
    image = cv2.imread(str(photo))
    if image is None:
        print(f"\n{photo.name}\n  ERRO: o OpenCV não conseguiu abrir a imagem.")
        return

    corners = detect_document(image, config)
    print(f"\n{photo.name}\n  tamanho={image.shape[1]}x{image.shape[0]} | documento={'sim' if corners is not None else 'não'}")
    if corners is None:
        return

    normalized = normalize_perspective(image, corners, config)
    answers = read_bubbles(
        normalized,
        total_questions=40,
        alternatives_count=5,
        config=config,
        subject_blocks=SUBJECT_BLOCKS,
    )
    print(f"  perfil={config.profile_id} | rotação das bolhas=0° (normalização pelos marcadores)")
    for block in SUBJECT_BLOCKS:
        print(format_block(answers, block))
        start = int(block["start_question_number"]) - 1
        end = int(block["end_question_number"])
        strengths = " ".join(
            f"{answer.question_number}:{max(answer.fill_percentages.values()):.2f}"
            for answer in answers[start:end]
        )
        print(f"    preenchimento máximo: {strengths}")
    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        overlay = normalized.copy()
        profile = get_layout_profile(config.profile_id)
        bubble_radius = round(
            (profile.normalized_bubble_radius[0] * config.normalized_width
             + profile.normalized_bubble_radius[1] * config.normalized_height) / 2
        )
        for answer, (_, option_centers) in zip(
            answers,
            build_bubble_positions(40, 5, config, SUBJECT_BLOCKS),
            strict=True,
        ):
            color = (0, 180, 0) if answer.detected_answer else (0, 0, 230)
            for center_x_mm, center_y_mm in option_centers.values():
                point = (
                    round(center_x_mm * config.px_per_mm),
                    round(center_y_mm * config.px_per_mm),
                )
                cv2.circle(overlay, point, bubble_radius, color, 2)
                cv2.drawMarker(overlay, point, (0, 255, 255), cv2.MARKER_CROSS, 11, 2)
            first_center = next(iter(option_centers.values()))
            label = (
                round(first_center[0] * config.px_per_mm - bubble_radius),
                round(first_center[1] * config.px_per_mm - bubble_radius - 5),
            )
            cv2.putText(
                overlay,
                f"{answer.question_number}:{answer.detected_answer or '-'}",
                label,
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
                cv2.LINE_AA,
            )
        output = debug_dir / f"{photo.stem}-grade.png"
        cv2.imwrite(str(output), overlay)
        print(f"  grade de referência: {output}")


def _clusters(values: list[int], distance: int = 18) -> list[int]:
    clusters: list[list[int]] = []
    for value in sorted(values):
        if not clusters or value - clusters[-1][-1] > distance:
            clusters.append([value])
        else:
            clusters[-1].append(value)
    return [round(sum(cluster) / len(cluster)) for cluster in clusters]


def inspect_circles(photo: Path, config: PipelineConfig) -> None:
    image = cv2.imread(str(photo))
    if image is None:
        return
    corners = detect_document(image, config)
    if corners is None:
        return
    normalized = normalize_perspective(image, corners, config)
    gray = cv2.medianBlur(cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY), 5)
    regions = {
        "matemática": (180, 980, 1040, 1810),
        "biologia": (1120, 980, 1960, 1810),
        "física": (180, 1790, 1040, 2750),
        "química": (1120, 1790, 1960, 2750),
    }
    for name, (x1, y1, x2, y2) in regions.items():
        circles = cv2.HoughCircles(
            gray[y1:y2, x1:x2],
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=58,
            param1=100,
            param2=20,
            minRadius=22,
            maxRadius=42,
        )
        points = np.round(circles[0]).astype(int) if circles is not None else np.empty((0, 3), dtype=int)
        if len(points):
            points[:, 0] += x1
            points[:, 1] += y1
        xs = _clusters(points[:, 0].tolist()) if len(points) else []
        ys = _clusters(points[:, 1].tolist()) if len(points) else []
        print(f"  círculos {name}: {len(points)} | x={xs} | y={ys}")


def main() -> None:
    args = sys.argv[1:]
    debug_dir: Path | None = None
    circles = False
    if "--debug-dir" in args:
        index = args.index("--debug-dir")
        try:
            debug_dir = Path(args[index + 1])
        except IndexError as error:
            raise SystemExit("Informe a pasta após --debug-dir.") from error
        del args[index:index + 2]
    if "--circles" in args:
        args.remove("--circles")
        circles = True
    if not args:
        raise SystemExit("Informe ao menos uma foto JPG, JPEG ou PNG.")

    config = PipelineConfig(
        layout_version="corrige-plus-v2-subject-blocks",
        layout_profile_id="corrige-plus-v2-subject-blocks",
    )
    for source in (Path(value) for value in args):
        inspect(source, config, debug_dir)
        if circles:
            inspect_circles(source, config)


if __name__ == "__main__":
    main()
