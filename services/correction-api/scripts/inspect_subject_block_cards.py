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
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np

from app.pipeline.bubble_detection import read_bubbles, read_bubbles_with_orientation_fallback
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective, rotate_quarter_turns
from app.pipeline.qr_reader import read_qr_progressive


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
        "low": sum(answer.classification == "low_confidence" for answer in current),
        "multiple": sum(answer.classification == "multiple" for answer in current),
        "blank": sum(answer.classification == "blank" for answer in current),
    }
    return (
        f"  {block['subject']:<10} {marks} "
        f"(respondidas={counts['answer']}, baixa={counts['low']}, "
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
    qr = read_qr_progressive(image, normalized, config)
    oriented = rotate_quarter_turns(normalized, qr.rotation_degrees or 0)
    answers, bubble_rotation = read_bubbles_with_orientation_fallback(
        oriented,
        total_questions=40,
        alternatives_count=5,
        config=config,
        subject_blocks=SUBJECT_BLOCKS,
    )
    print(
        "  QR="
        f"{qr.status} | decodificado={'sim' if qr.decoded else 'não'} | "
        f"rotação QR={qr.rotation_degrees or 0}° | rotação bolhas={bubble_rotation}°"
    )
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
        overlay = oriented.copy()
        for answer in answers:
            x1, y1, x2, y2 = answer.crop
            color = (0, 180, 0) if answer.detected_answer else (0, 0, 230)
            cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 2)
        output = debug_dir / f"{photo.stem}-grade.png"
        cv2.imwrite(str(output), overlay)
        print(f"  grade de referência: {output}")


def calibrate_offsets(photo: Path, config: PipelineConfig) -> None:
    """Compara deslocamentos da grade sem alterar a configuração do serviço."""
    image = cv2.imread(str(photo))
    if image is None:
        return
    corners = detect_document(image, config)
    if corners is None:
        return
    normalized = normalize_perspective(image, corners, config)
    qr = read_qr_progressive(image, normalized, config)
    oriented = rotate_quarter_turns(normalized, qr.rotation_degrees or 0)
    candidates: list[tuple[float, float, float]] = []
    for x_offset in range(-8, 9):
        for y_offset in range(-12, 21):
            candidate_config = replace(
                config,
                first_bubble_x_mm=config.first_bubble_x_mm + x_offset,
                question_start_y_mm=config.question_start_y_mm + y_offset,
            )
            answers = read_bubbles(oriented, 40, 5, candidate_config, SUBJECT_BLOCKS)
            # Em uma folha preenchida, uma bolha escura deve aparecer em cada
            # linha. O peso abaixo prioriza marcas realmente distintas, não os
            # contornos das bolhas vazias.
            score = sum(max(answer.fill_percentages.values()) for answer in answers)
            candidates.append((score, x_offset, y_offset))
    print("  melhores deslocamentos candidatos (x, y, pontuação):")
    for score, x_offset, y_offset in sorted(candidates, reverse=True)[:8]:
        print(f"    x={x_offset:+} mm | y={y_offset:+} mm | {score:.2f}/40")


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
    calibration = False
    circles = False
    legacy_grid = False
    if "--debug-dir" in args:
        index = args.index("--debug-dir")
        try:
            debug_dir = Path(args[index + 1])
        except IndexError as error:
            raise SystemExit("Informe a pasta após --debug-dir.") from error
        del args[index:index + 2]
    if "--calibrate" in args:
        args.remove("--calibrate")
        calibration = True
    if "--circles" in args:
        args.remove("--circles")
        circles = True
    if "--legacy-grid" in args:
        args.remove("--legacy-grid")
        legacy_grid = True
    if not args:
        raise SystemExit("Informe ao menos uma foto JPG, JPEG ou PNG.")

    config = PipelineConfig(layout_version="corrige-plus-v2-subject-blocks")
    if legacy_grid:
        # Modelo multidisciplinar emitido antes do alinhamento final do PDF.
        # Mantido aqui apenas para medir a compatibilidade antes de entrar no
        # fallback do serviço.
        config = replace(
            config,
            first_bubble_x_mm=35.0,
            column_spacing_mm=88.5,
            question_start_y_mm=97.0,
        )
    for source in (Path(value) for value in args):
        inspect(source, config, debug_dir)
        if calibration:
            calibrate_offsets(source, config)
        if circles:
            inspect_circles(source, config)


if __name__ == "__main__":
    main()
