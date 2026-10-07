from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def settings(tmp_path: Path) -> Settings:
    return Settings(
        app_env="test",
        log_level="INFO",
        temp_storage_path=tmp_path,
        file_retention_hours=24,
        result_retention_hours=24,
        max_image_size_mb=15,
        allowed_origins=("http://localhost:3000",),
        correction_api_key="test-secret",
    )


def test_health_reports_real_service_state(tmp_path: Path) -> None:
    client = TestClient(create_app(settings(tmp_path)))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["storage_backend"] == "local"
    assert response.json()["retention_hours"] == 24
    assert response.json()["service"] == "corrige-plus-correction-api"
    assert response.json()["pipeline_version"] == "opencv-omr-v1.0"
    assert response.json()["opencv_version"]


def test_correction_endpoint_is_protected_and_validates_contract(tmp_path: Path) -> None:
    client = TestClient(create_app(settings(tmp_path)))

    assert client.post("/v1/process-sheet").status_code == 401

    response = client.post(
        "/v1/process-sheet",
        headers={"X-API-Key": "test-secret"},
    )

    assert response.status_code == 422
