from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4


_SAFE_SUFFIX = re.compile(r"^\.[a-zA-Z0-9]{1,10}$")


class LocalTemporaryStorage:
    """Armazena artefatos transitórios sem aceitar caminhos fornecidos pelo cliente."""

    def __init__(self, root: Path, retention_hours: int = 24) -> None:
        self.root = root.resolve()
        self.retention_seconds = retention_hours * 60 * 60
        self.root.mkdir(parents=True, exist_ok=True)

    def put_bytes(self, batch_id: UUID, original_name: str, content: bytes) -> str:
        suffix = Path(original_name).suffix.lower()
        safe_suffix = suffix if _SAFE_SUFFIX.fullmatch(suffix) else ".bin"
        relative = Path(str(batch_id)) / f"{uuid4().hex}{safe_suffix}"
        destination = self._resolve_key(relative.as_posix())
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        return relative.as_posix()

    def put_json(self, batch_id: UUID, payload: dict[str, Any]) -> str:
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return self.put_bytes(batch_id, "result.json", serialized)

    def read_bytes(self, key: str) -> bytes:
        return self._resolve_key(key).read_bytes()

    def delete(self, key: str) -> bool:
        target = self._resolve_key(key)
        if not target.exists():
            return False
        target.unlink()
        self._remove_empty_parents(target.parent)
        return True

    def cleanup_expired(self, now: float | None = None) -> int:
        cutoff = (now if now is not None else time.time()) - self.retention_seconds
        removed = 0
        for candidate in self.root.rglob("*"):
            if candidate.is_file() and candidate.stat().st_mtime < cutoff:
                candidate.unlink()
                removed += 1
        for directory in sorted(
            (path for path in self.root.rglob("*") if path.is_dir()),
            key=lambda path: len(path.parts),
            reverse=True,
        ):
            try:
                directory.rmdir()
            except OSError:
                pass
        return removed

    def _resolve_key(self, key: str) -> Path:
        target = (self.root / key).resolve()
        if target == self.root or self.root not in target.parents:
            raise ValueError("Chave de armazenamento inválida.")
        return target

    def _remove_empty_parents(self, directory: Path) -> None:
        current = directory
        while current != self.root and self.root in current.parents:
            try:
                current.rmdir()
            except OSError:
                break
            current = current.parent


def touch_with_age(path: Path, seconds_old: int) -> None:
    """Auxiliar usado somente pelos testes para simular expiração."""
    timestamp = time.time() - seconds_old
    os.utime(path, (timestamp, timestamp))
