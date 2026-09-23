from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.pipeline.config import PipelineConfig
from app.pipeline.document_detection import detect_document, normalize_perspective
from app.pipeline.image_quality import analyze_quality
from app.pipeline.qr_reader import qr_crop, read_qr_progressive
from app.pipeline.version import PIPELINE_VERSION


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnóstico local e seguro da leitura de QR do CORRIGE+.")
    parser.add_argument("image", type=Path, help="Imagem JPG, JPEG ou PNG do cartão.")
    parser.add_argument("--layout", default="corrige-plus-v1")
    parser.add_argument("--output-dir", type=Path, help="Salva intermediários técnicos neste diretório.")
    args = parser.parse_args()

    image = cv2.imdecode(np.fromfile(args.image, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        print(json.dumps({"error": "invalid_image"}, ensure_ascii=False))
        return 2

    config = PipelineConfig(layout_version=args.layout)
    quality = analyze_quality(image, config)
    corners = detect_document(image, config)
    normalized = normalize_perspective(image, corners, config) if corners is not None else None
    result = read_qr_progressive(image, normalized, config)
    report = {
        "pipeline_version": PIPELINE_VERSION,
        "image": {"width": image.shape[1], "height": image.shape[0]},
        "document_detected": corners is not None,
        "document_corners": (
            [[round(float(x), 2), round(float(y), 2)] for x, y in corners]
            if corners is not None
            else None
        ),
        "normalized": (
            {"width": normalized.shape[1], "height": normalized.shape[0]}
            if normalized is not None
            else None
        ),
        "quality": {
            "brightness": round(quality.brightness, 2),
            "blur_variance": round(quality.blur_variance, 2),
            "problems": quality.problems,
        },
        "qr": {
            "status": result.status,
            "strategy": result.strategy,
            "detected": result.detected,
            "decoded": result.decoded,
            "content_length": result.content_length,
            "token_preview": f"{result.token[:4]}…{result.token[-4:]}" if result.token else None,
            "attempts": result.attempts,
            "rotation_degrees": result.rotation_degrees,
            "bounding_box": result.bounding_box,
            "crop_coordinates": result.crop_coordinates,
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if args.output_dir and normalized is not None:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(args.output_dir / "original.jpg"), image)
        cv2.imwrite(str(args.output_dir / "normalized.jpg"), normalized)
        cropped = qr_crop(normalized, config)
        if cropped:
            crop, _ = cropped
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
            cv2.imwrite(str(args.output_dir / "qr-crop.png"), crop)
            cv2.imwrite(str(args.output_dir / "qr-crop-gray.png"), gray)
            cv2.imwrite(str(args.output_dir / "qr-crop-threshold.png"), threshold)
            cv2.imwrite(
                str(args.output_dir / "qr-crop-2x.png"),
                cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC),
            )
        (args.output_dir / "diagnostic.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return 0 if result.status == "decoded" else 1


if __name__ == "__main__":
    raise SystemExit(main())
