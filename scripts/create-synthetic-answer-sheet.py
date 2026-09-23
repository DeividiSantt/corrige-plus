"""Renderiza um cartão-resposta do CORRIGE+ e preenche as bolhas para teste local.

Uso:
  python scripts/create-synthetic-answer-sheet.py entrada.pdf saida.png "ABCDE..."

O script usa o próprio PDF gerado pelo sistema, preservando QR Code, marcadores e dados
do aluno. Ele só cria uma imagem temporária de teste; não envia nada ao Supabase.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import ImageDraw


def mm_to_px(value_mm: float, pixels_per_mm: float) -> float:
    return value_mm * pixels_per_mm


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Uso: create-synthetic-answer-sheet.py entrada.pdf saida.png RESPOSTAS")

    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    answers = sys.argv[3].strip().upper()
    if len(answers) != 40 or any(answer not in "ABCDE" for answer in answers):
        raise SystemExit("Este teste espera exatamente 40 respostas entre A e E.")

    document = pdfium.PdfDocument(source)
    page = document[0]
    bitmap = page.render(scale=3.0, rotation=0)
    image = bitmap.to_pil().convert("RGB")
    # Uma renderização digital é branca demais para a checagem de qualidade,
    # que foi calibrada para fotos de papel. Esta redução uniforme simula
    # a exposição comum de uma câmera sem alterar a geometria do cartão.
    image = image.point(lambda value: int(value * 0.9))
    draw = ImageDraw.Draw(image)
    pixels_per_mm = image.width / 210

    # A geometria replica o cartão v2: dois blocos inteiros em cada coluna.
    # Matemática 1-10 e Física 11-20 ficam à esquerda;
    # Biologia 21-30 e Química 31-40, à direita.
    column_base_x = (14, 108)
    block_start_y = (102, 184)
    for index, answer in enumerate(answers):
        block_index = index // 10
        question_in_block = index % 10
        column = 0 if block_index < 2 else 1
        block_in_column = block_index % 2
        center_x_mm = column_base_x[column] + 14 + "ABCDE".index(answer) * 14
        center_y_mm = block_start_y[block_in_column] + question_in_block * 7.2
        center_x = mm_to_px(center_x_mm, pixels_per_mm)
        center_y = mm_to_px(center_y_mm, pixels_per_mm)
        radius = mm_to_px(2.35, pixels_per_mm)
        draw.ellipse(
            (center_x - radius, center_y - radius, center_x + radius, center_y + radius),
            fill=(38, 28, 94),
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)
    print(destination)


if __name__ == "__main__":
    main()
