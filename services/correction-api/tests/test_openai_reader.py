import asyncio
import json

import numpy as np
import pytest

from app.pipeline.config import PipelineConfig
from app.pipeline.openai_reader import (
    OpenAIReaderError,
    _regions,
    read_answers,
)


def test_answer_regions_exclude_header_and_qr() -> None:
    config = PipelineConfig()
    image = np.full((config.normalized_height, config.normalized_width, 3), 255, np.uint8)
    regions = _regions(image, 40, 5, config, None)

    assert len(regions) == 4
    assert [(region.start, region.end) for region in regions] == [
        (1, 10), (11, 20), (21, 30), (31, 40)
    ]
    assert all(region.crop.shape[0] < image.shape[0] for region in regions)
    assert all(region.crop.shape[1] < image.shape[1] for region in regions)
    assert all(region.start >= 1 and region.end <= 40 for region in regions)
    # Recortes não devem alcançar a área superior do nome/QR.
    assert all(region.bounds[region.start][1] > 800 for region in regions)


def test_ai_reader_parses_answers_without_fabricating_confidence(monkeypatch) -> None:
    config = PipelineConfig()
    image = np.full((config.normalized_height, config.normalized_width, 3), 255, np.uint8)
    request = {}
    output = {
        "answers": [
            {"question_number": 1, "state": "marked", "answer": "C"},
            {"question_number": 2, "state": "blank", "answer": None},
            {"question_number": 3, "state": "multiple", "answer": None},
            {"question_number": 4, "state": "uncertain", "answer": None},
        ]
    }

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": json.dumps(output)}]}
                ]
            }

    class FakeClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, *, headers, json):
            request.update(url=url, headers=headers, body=json)
            return FakeResponse()

    monkeypatch.setattr("app.pipeline.openai_reader.httpx.AsyncClient", FakeClient)
    answers = asyncio.run(
        read_answers(image, 4, 5, config, api_key="test-key", model="test-vision-model")
    )

    assert [answer.detected_answer for answer in answers] == ["C", None, None, None]
    assert [answer.classification for answer in answers] == [
        "answered", "blank", "multiple", "unreadable"
    ]
    assert all(answer.confidence is None for answer in answers)
    assert all(answer.fill_percentages == {} for answer in answers)
    assert request["url"] == "https://api.openai.com/v1/responses"
    assert request["body"]["store"] is False
    assert "test-key" not in json.dumps(request["body"])
    input_images = [
        item
        for item in request["body"]["input"][0]["content"]
        if item["type"] == "input_image"
    ]
    assert input_images and all(item["image_url"].startswith("data:image/jpeg;base64,") for item in input_images)


@pytest.mark.parametrize(
    "answers,total_questions,code",
    [
        ([{"question_number": 1, "state": "marked", "answer": "Z"}], 1, "openai_invalid_output"),
        ([{"question_number": 1, "state": "marked", "answer": "A"}], 2, "openai_incomplete_output"),
        ([
            {"question_number": 1, "state": "marked", "answer": "A"},
            {"question_number": 1, "state": "marked", "answer": "B"},
        ], 2, "openai_invalid_output"),
    ],
)
def test_ai_reader_rejects_invalid_or_incomplete_answers(answers, total_questions, code) -> None:
    from app.pipeline.openai_reader import _parse_answers

    config = PipelineConfig()
    image = np.full((config.normalized_height, config.normalized_width, 3), 255, np.uint8)
    regions = _regions(image, total_questions, 5, config, None)
    with pytest.raises(OpenAIReaderError, match=code):
        _parse_answers(json.dumps({"answers": answers}), regions, total_questions, 5)


def test_ai_reader_requires_api_key_without_making_request() -> None:
    config = PipelineConfig()
    image = np.full((config.normalized_height, config.normalized_width, 3), 255, np.uint8)
    with pytest.raises(OpenAIReaderError, match="openai_not_configured"):
        asyncio.run(read_answers(image, 10, 5, config, api_key=None, model="test-model"))
