"""Compatibility helpers for scientific packages in packaged functions."""

from __future__ import annotations

from functools import lru_cache
import os
from pathlib import Path
from typing import Callable


STUB_ROOT = Path(__file__).resolve().parent / "vendor_stubs"


def librosa_stub_path(package_name: str, filename: str) -> Path | None:
    """Return a bundled lazy-loader stub when the wheel stub was pruned."""

    adjacent = Path(filename if filename.endswith("i") else f"{os.path.splitext(filename)[0]}.pyi")
    if adjacent.is_file():
        return adjacent
    if package_name != "librosa" and not package_name.startswith("librosa."):
        return None
    package_parts = package_name.split(".")[1:]
    bundled = STUB_ROOT.joinpath(*package_parts, "__init__.pyi")
    return bundled if bundled.is_file() else None


@lru_cache(maxsize=1)
def install_librosa_stub_fallback() -> None:
    """Teach librosa's lazy loader where its bundled type stubs live.

    Vercel's Python packaging may prune wheel ``.pyi`` files. Librosa uses
    those files at runtime to construct its lazy exports, so a missing stub
    otherwise prevents importing the package before analysis begins.
    """

    import lazy_loader

    original: Callable = lazy_loader.attach_stub

    def attach_stub(package_name: str, filename: str):
        resolved = librosa_stub_path(package_name, filename)
        if resolved is not None:
            return original(package_name, str(resolved))
        return original(package_name, filename)

    lazy_loader.attach_stub = attach_stub
