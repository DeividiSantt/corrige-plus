"""Testa o motor de leitura com variações realistas de uma foto conhecida.

Uso:
  python scripts/stress_test_card.py foto.jpg ABCDEACDBC

Não grava no Supabase nem altera a foto original. É uma rotina de calibração
local: cada variação percorre detecção de documento, QR e leitura das bolhas.
"""

from __future__ import annotations

import sys

import cv2
import numpy as np

from app.pipeline.bubble_detection import read_bubbles
from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective, rotate_quarter_turns
from app.pipeline.qr_reader import read_qr_progressive


def rotate(image: np.ndarray, degrees: float) -> np.ndarray:
    height, width = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), degrees, 1)
    return cv2.warpAffine(image, matrix, (width, height), borderValue=(245, 245, 245))


def shadow(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    gradient = np.linspace(0.55, 1.0, width, dtype=np.float32)[None, :, None]
    return np.clip(image.astype(np.float32) * gradient, 0, 255).astype(np.uint8)


def perspective(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    source = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
    target = np.float32([[width * 0.06, height * 0.03], [width * 0.95, 0], [width * 0.98, height * 0.97], [0, height]])
    matrix = cv2.getPerspectiveTransform(source, target)
    return cv2.warpPerspective(image, matrix, (width, height), borderValue=(245, 245, 245))


def evaluate(name: str, image: np.ndarray, expected: str, config: PipelineConfig) -> bool:
    corners = detect_document(image, config)
    if corners is None:
        print(f"{name}: novo envio necessário (cartão não localizado)")
        return False
    normalized = normalize_perspective(image, corners, config)
    qr = read_qr_progressive(image, normalized, config)
    oriented = rotate_quarter_turns(normalized, qr.rotation_degrees or 0)
    answers = read_bubbles(oriented, len(expected), 5, config)
    received = "".join(answer.detected_answer or "-" for answer in answers)
    matches = sum(answer.detected_answer == expected[index] for index, answer in enumerate(answers))
    blanks = sum(answer.classification == "blank" for answer in answers)
    passed = matches == len(expected)
    print(f"{name}: {matches}/{len(expected)} corretas · {blanks} em branco · QR {qr.status} · {received}")
    return passed


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Uso: stress_test_card.py FOTO RESPOSTAS_ESPERADAS")
    expected = sys.argv[2].strip().upper()
    if not expected or any(answer not in "ABCDE" for answer in expected):
        raise SystemExit("As respostas devem conter somente letras de A a E.")
    original = cv2.imread(sys.argv[1])
    if original is None:
        raise SystemExit("Não foi possível abrir a foto.")

    variants = {
        "original": original,
        "exposição mais escura": np.clip(original.astype(np.float32) * 0.72, 0, 255).astype(np.uint8),
        "exposição mais clara": np.clip(original.astype(np.float32) * 1.12, 0, 255).astype(np.uint8),
        "inclinação +6°": rotate(original, 6),
        "inclinação -6°": rotate(original, -6),
        "perspectiva moderada": perspective(original),
        "sombra lateral": shadow(original),
        "desfoque leve": cv2.GaussianBlur(original, (3, 3), 0),
    }
    config = PipelineConfig()
    passed = sum(evaluate(name, image, expected, config) for name, image in variants.items())
    print(f"Resumo: {passed}/{len(variants)} variações sem respostas perdidas.")


if __name__ == "__main__":
    main()
