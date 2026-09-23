from pathlib import Path
from uuid import uuid4

import pytest

from app.services.storage import LocalTemporaryStorage, touch_with_age


def test_store_read_and_delete_temporary_file(tmp_path: Path) -> None:
    storage = LocalTemporaryStorage(tmp_path, retention_hours=24)
    key = storage.put_bytes(uuid4(), "cartao-resposta.jpg", b"imagem")

    assert key.endswith(".jpg")
    assert "cartao-resposta" not in key
    assert storage.read_bytes(key) == b"imagem"
    assert storage.delete(key) is True
    assert storage.delete(key) is False


def test_rejects_keys_outside_storage_root(tmp_path: Path) -> None:
    storage = LocalTemporaryStorage(tmp_path)

    with pytest.raises(ValueError, match="inválida"):
        storage.read_bytes("../segredo.txt")


def test_cleanup_removes_only_expired_files(tmp_path: Path) -> None:
    storage = LocalTemporaryStorage(tmp_path, retention_hours=1)
    old_key = storage.put_bytes(uuid4(), "antigo.png", b"old")
    fresh_key = storage.put_bytes(uuid4(), "novo.png", b"new")
    touch_with_age(tmp_path / old_key, seconds_old=3_601)

    assert storage.cleanup_expired() == 1
    assert not (tmp_path / old_key).exists()
    assert storage.read_bytes(fresh_key) == b"new"

