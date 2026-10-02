from __future__ import annotations

import base64
from dataclasses import dataclass
import json
from typing import Literal

import cv2
import httpx
import numpy as np

from app.pipeline.config import PipelineConfig

AnswerClass = Literal["answered", "blank", "multiple", "unreadable"]
AnswerState = Literal["marked", "blank", "multiple", "uncertain"]


@dataclass(frozen=True, slots=True)
class AIAnswer:
    question_number: int
    detected_answer: str | None
    classification: AnswerClass
    confidence: None
    fill_percentages: dict[str, float]
    crop: tuple[int, int, int, int]


@dataclass(frozen=True, slots=True)
class _QuestionRegion:
    start: int
    end: int
    crop: np.ndarray
    bounds: dict[int, tuple[int, int, int, int]]


class OpenAIReaderError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _question_centers(
    total_questions: int,
    config: PipelineConfig,
    subject_blocks: list[dict] | None,
) -> dict[int, tuple[int, int]]:
    columns = 2 if total_questions > 25 else 1
    per_column = int(np.ceil(total_questions / columns))
    scale = config.px_per_mm
    block_starts = {
        int(block["start_question_number"]) for block in subject_blocks or []
    }
    subject_layout = config.layout_version == "corrige-plus-v2-subject-blocks" and bool(subject_blocks)
    current_y = [config.question_start_y_mm for _ in range(columns)]
    centers: dict[int, tuple[int, int]] = {}
    for question in range(1, total_questions + 1):
        column = (question - 1) // per_column
        position = (question - 1) % per_column
        if subject_layout and (question in block_starts or position == 0):
            current_y[column] += 10
        y_mm = (
            current_y[column]
            if subject_layout
            else config.question_start_y_mm + position * config.question_spacing_y_mm
        )
        x_mm = config.first_bubble_x_mm + column * config.column_spacing_mm
        centers[question] = (round(x_mm * scale), round(y_mm * scale))
        if subject_layout:
            current_y[column] += config.question_spacing_y_mm
    return centers


def _regions(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict] | None,
) -> list[_QuestionRegion]:
    if image.shape[1] != config.normalized_width or image.shape[0] != config.normalized_height:
        raise OpenAIReaderError("invalid_normalized_image")
    if not 1 <= alternatives_count <= 5 or not 1 <= total_questions <= 50:
        raise OpenAIReaderError("invalid_question_layout")

    centers = _question_centers(total_questions, config, subject_blocks)
    if subject_blocks:
        ranges = [
            (int(block["start_question_number"]), int(block["end_question_number"]))
            for block in sorted(subject_blocks, key=lambda item: int(item["start_question_number"]))
        ]
        if [question for start, end in ranges for question in range(start, end + 1)] != list(range(1, total_questions + 1)):
            raise OpenAIReaderError("invalid_question_layout")
    else:
        ranges = []
        columns = 2 if total_questions > 25 else 1
        per_column = int(np.ceil(total_questions / columns))
        for column_start in range(1, total_questions + 1, per_column):
            column_end = min(total_questions, column_start + per_column - 1)
            for start in range(column_start, column_end + 1, 10):
                ranges.append((start, min(column_end, start + 9)))

    scale = config.px_per_mm
    option_extent = (alternatives_count - 1) * config.bubble_spacing_x_mm
    horizontal_padding = round(13 * scale)
    vertical_padding = round(4.5 * scale)
    regions: list[_QuestionRegion] = []
    height, width = image.shape[:2]
    for start, end in ranges:
        first_x, _ = centers[start]
        last_x = first_x + round(option_extent * scale)
        first_y = centers[start][1]
        last_y = centers[end][1]
        x1 = max(0, first_x - horizontal_padding)
        x2 = min(width, last_x + round((config.bubble_radius_mm + 2) * scale))
        y1 = max(0, min(first_y, last_y) - vertical_padding)
        y2 = min(height, max(first_y, last_y) + vertical_padding)
        if x2 <= x1 or y2 <= y1:
            raise OpenAIReaderError("invalid_question_layout")
        crop = image[y1:y2, x1:x2].copy()
        bounds = {
            question: (
                max(0, centers[question][0] - horizontal_padding),
                max(0, centers[question][1] - vertical_padding),
                min(width, centers[question][0] + round(option_extent * scale) + horizontal_padding),
                min(height, centers[question][1] + vertical_padding),
            )
            for question in range(start, end + 1)
        }
        regions.append(_QuestionRegion(start, end, crop, bounds))
    return regions


def _schema(alternatives_count: int) -> dict:
    choices = list("ABCDE"[:alternatives_count])
    return {
        "type": "object",
        "properties": {
            "answers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question_number": {"type": "integer"},
                        "state": {
                            "type": "string",
                            "enum": ["marked", "blank", "multiple", "uncertain"],
                        },
                        "answer": {
                            "anyOf": [
                                {"type": "string", "enum": choices},
                                {"type": "null"},
                            ]
                        },
                    },
                    "required": ["question_number", "state", "answer"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["answers"],
        "additionalProperties": False,
    }


def _image_data_url(image: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 96])
    if not ok:
        raise OpenAIReaderError("image_encoding_failed")
    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


def _output_text(response: dict) -> str:
    if not isinstance(response, dict):
        raise OpenAIReaderError("openai_invalid_response")
    for item in response.get("output", []):
        if not isinstance(item, dict):
            continue
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            if content.get("type") == "refusal":
                raise OpenAIReaderError("openai_refusal")
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise OpenAIReaderError("openai_empty_response")


def _parse_answers(
    raw_text: str,
    regions: list[_QuestionRegion],
    total_questions: int,
    alternatives_count: int,
) -> list[AIAnswer]:
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise OpenAIReaderError("openai_invalid_output") from exc
    if not isinstance(payload, dict) or set(payload) != {"answers"}:
        raise OpenAIReaderError("openai_invalid_output")
    items = payload.get("answers")
    if not isinstance(items, list):
        raise OpenAIReaderError("openai_invalid_output")

    expected = list(range(1, total_questions + 1))
    by_number: dict[int, dict] = {}
    for item in items:
        if not isinstance(item, dict) or set(item) != {"question_number", "state", "answer"}:
            raise OpenAIReaderError("openai_invalid_output")
        number = item.get("question_number")
        if not isinstance(number, int) or isinstance(number, bool) or number in by_number:
            raise OpenAIReaderError("openai_invalid_output")
        by_number[number] = item
    if sorted(by_number) != expected:
        raise OpenAIReaderError("openai_incomplete_output")

    region_by_question = {
        question: region
        for region in regions
        for question in range(region.start, region.end + 1)
    }
    answers: list[AIAnswer] = []
    choices = set("ABCDE"[:alternatives_count])
    for number in expected:
        item = by_number[number]
        state, answer = item.get("state"), item.get("answer")
        if not isinstance(state, str) or state not in {"marked", "blank", "multiple", "uncertain"}:
            raise OpenAIReaderError("openai_invalid_output")
        if state == "marked":
            if not isinstance(answer, str) or answer not in choices:
                raise OpenAIReaderError("openai_invalid_output")
            classification: AnswerClass = "answered"
        else:
            if answer is not None:
                raise OpenAIReaderError("openai_invalid_output")
            classification = {
                "blank": "blank",
                "multiple": "multiple",
                "uncertain": "unreadable",
            }[state]
        answers.append(
            AIAnswer(
                question_number=number,
                detected_answer=answer,
                classification=classification,
                confidence=None,
                fill_percentages={},
                crop=region_by_question[number].bounds[number],
            )
        )
    return answers


async def read_answers(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    *,
    api_key: str | None,
    model: str,
    timeout_seconds: float = 90,
    subject_blocks: list[dict] | None = None,
) -> list[AIAnswer]:
    if not api_key:
        raise OpenAIReaderError("openai_not_configured")
    regions = _regions(image, total_questions, alternatives_count, config, subject_blocks)
    content: list[dict] = [
        {
            "type": "input_text",
            "text": (
                "Leia somente as bolhas das áreas de cartão-resposta nas imagens. "
                "Não deduza gabarito nem identidade. Cada linha tem um número e alternativas "
                "A-E; círculos preenchidos podem ser pretos ou coloridos, círculos apenas "
                "contornados estão vazios. Para cada número solicitado, responda marked e a "
                "letra somente quando uma única bolha estiver claramente preenchida; blank "
                "quando nenhuma estiver; multiple quando mais de uma estiver; uncertain "
                "quando a foto não permitir decidir. Seja conservador: na dúvida use uncertain. "
                "As imagens estão identificadas pelo intervalo de questões logo antes de cada uma."
            ),
        }
    ]
    for region in regions:
        content.extend(
            [
                {
                    "type": "input_text",
                    "text": f"Recorte de respostas das questões {region.start} a {region.end}.",
                },
                {"type": "input_image", "image_url": _image_data_url(region.crop), "detail": "high"},
            ]
        )
    request_body = {
        "model": model,
        "store": False,
        "input": [{"role": "user", "content": content}],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "answer_sheet_reading",
                "strict": True,
                "schema": _schema(alternatives_count),
            }
        },
        "max_output_tokens": max(1000, total_questions * 90),
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_seconds)) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {api_key}"},
                json=request_body,
            )
            response.raise_for_status()
            response_payload = response.json()
    except httpx.TimeoutException as exc:
        raise OpenAIReaderError("openai_timeout") from exc
    except httpx.HTTPStatusError as exc:
        raise OpenAIReaderError("openai_provider_error") from exc
    except httpx.RequestError as exc:
        raise OpenAIReaderError("openai_unavailable") from exc
    except (ValueError, TypeError) as exc:
        raise OpenAIReaderError("openai_invalid_response") from exc

    return _parse_answers(
        _output_text(response_payload), regions, total_questions, alternatives_count
    )
