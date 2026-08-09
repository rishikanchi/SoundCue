from __future__ import annotations

from pathlib import Path

import lazy_loader

from soundcue_inference.runtime_compat import STUB_ROOT, librosa_stub_path


def test_bundled_librosa_stubs_cover_runtime_packages() -> None:
    for package_name, relative in (
        ("librosa", Path("__init__.pyi")),
        ("librosa.core", Path("core/__init__.pyi")),
        ("librosa.feature", Path("feature/__init__.pyi")),
        ("librosa.util", Path("util/__init__.pyi")),
    ):
        resolved = librosa_stub_path(
            package_name,
            f"/var/task/_vendor/{package_name.replace('.', '/')}/__init__.py",
        )
        assert resolved == STUB_ROOT / relative
        assert resolved.is_file()


def test_root_stub_exposes_runtime_functions() -> None:
    _, _, exports = lazy_loader.attach_stub("librosa", str(STUB_ROOT / "__init__.pyi"))
    assert "pyin" in exports
    assert "resample" in exports


def test_non_librosa_missing_stub_has_no_fallback() -> None:
    assert librosa_stub_path("another_package", "/missing/__init__.py") is None
