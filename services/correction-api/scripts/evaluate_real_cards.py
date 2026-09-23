"""Avalia fotos reais contra uma sequência de respostas conhecida, sem alterar banco ou Storage.

Uso:
  python scripts/evaluate_real_cards.py "C:\\pasta-das-fotos" ABCDEACDBC

O relatório mostra, para cada foto, o que o pipeline conseguiu localizar e quais
questões ficaram em branco ou divergiram da sequência esperada.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2

from app.pipeline.bubble_detection import read_bubbles_with_orientation_fallback
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective, rotate_quarter_turns
from app.pipeline.qr_reader import read_qr_progressive


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Uso: evaluate_real_cards.py PASTA RESPOSTAS_ESPERADAS")

    folder = Path(sys.argv[1])
    expected = sys.argv[2].strip().upper()
    if not folder.is_dir() or not expected or any(answer not in "ABCDE" for answer in expected):
        raise SystemExit("Informe uma pasta existente e respostas entre A e E.")

    config = PipelineConfig()
    photos = sorted(path for path in folder.iterdir() if path.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if not photos:
        raise SystemExit("Nenhuma foto JPG, JPEG ou PNG encontrada.")

    print("arquivo | documento | lidas | brancas | divergentes | respostas")
    print("-" * 92)
    totals = {"read": 0, "blank": 0, "wrong": 0, "questions": 0}
    for photo in photos:
        image = cv2.imread(str(photo))
        if image is None:
            print(f"{photo.name} | não lida | - | - | - | -")
            continue
        corners = detect_document(image, config)
        if corners is None:
            print(f"{photo.name} | não | 0 | {len(expected)} | - | {'-' * len(expected)}")
            totals["blank"] += len(expected)
            totals["questions"] += len(expected)
            continue
        normalized = normalize_perspective(image, corners, config)
        qr = read_qr_progressive(image, normalized, config)
        answers, rotation = read_bubbles_with_orientation_fallback(
            rotate_quarter_turns(normalized, qr.rotation_degrees or 0),
            len(expected),
            5,
            config,
        )
        received = "".join(answer.detected_answer or "-" for answer in answers)
        read = sum(answer.detected_answer is not None for answer in answers)
        blank = sum(answer.classification == "blank" for answer in answers)
        wrong = sum(answer.detected_answer != expected[index] for index, answer in enumerate(answers))
        suffix = f" · rotação da grade {rotation}°" if rotation else ""
        print(f"{photo.name} | sim | {read} | {blank} | {wrong} | {received}{suffix}")
        totals["read"] += read
        totals["blank"] += blank
        totals["wrong"] += wrong
        totals["questions"] += len(answers)

    total_questions = max(1, totals["questions"])
    print("-" * 92)
    print(
        "Resumo: "
        f"{totals['read']}/{total_questions} respostas detectadas; "
        f"{totals['blank']} em branco; "
        f"{totals['wrong']} divergentes da sequência esperada."
    )


if __name__ == "__main__":
    main()
