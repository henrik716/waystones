"""
test_safe_name.py — Cross-language parity tests for to_safe_name().

All three worker scripts define identical to_safe_name() functions.
The shared fixture parity_cases.json is authoritative — the TypeScript
nameSanitizer.test.ts reads the same file and asserts the same expected values.
"""
import json
from pathlib import Path

import pytest

from conftest import load_worker

snapshot = load_worker("postgis-snapshot.py")
converter = load_worker("gpkg-converter.py")
tile_gen  = load_worker("vector-tile-generator.py")

CASES = json.loads((Path(__file__).parent / "fixtures" / "parity_cases.json").read_text())


# ---------------------------------------------------------------------------
# Parametrized fixture-driven tests
# ---------------------------------------------------------------------------

class TestPostgisSnapshotSafeName:
    @pytest.mark.parametrize("case", CASES, ids=[c["input"] or "(empty)" for c in CASES])
    def test_matches_parity_fixture(self, case):
        assert snapshot.to_safe_name(case["input"]) == case["expected"], case.get("note", "")


class TestGpkgConverterSafeName:
    @pytest.mark.parametrize("case", CASES, ids=[c["input"] or "(empty)" for c in CASES])
    def test_matches_parity_fixture(self, case):
        assert converter.to_safe_name(case["input"]) == case["expected"], case.get("note", "")


class TestVectorTileGeneratorSafeName:
    @pytest.mark.parametrize("case", CASES, ids=[c["input"] or "(empty)" for c in CASES])
    def test_matches_parity_fixture(self, case):
        assert tile_gen.to_safe_name(case["input"]) == case["expected"], case.get("note", "")


class TestAllScriptsAgree:
    """All three scripts must produce identical output — they must not diverge."""

    @pytest.mark.parametrize("case", CASES, ids=[c["input"] or "(empty)" for c in CASES])
    def test_all_scripts_agree(self, case):
        s = snapshot.to_safe_name(case["input"])
        c = converter.to_safe_name(case["input"])
        t = tile_gen.to_safe_name(case["input"])
        assert s == c == t, f"Scripts disagree: snapshot={s!r}, converter={c!r}, tile_gen={t!r}"


# ---------------------------------------------------------------------------
# Edge cases beyond the shared fixture
# ---------------------------------------------------------------------------

class TestSafeNameEdgeCases:
    def test_empty_string_fallback(self):
        assert snapshot.to_safe_name("") == "layer"

    def test_all_special_chars_fallback(self):
        assert snapshot.to_safe_name("!!!") == "layer"
        assert snapshot.to_safe_name("---") == "layer"
        assert snapshot.to_safe_name("...") == "layer"

    def test_uppercase_lowercased(self):
        assert snapshot.to_safe_name("ROADS") == "roads"

    def test_schema_dot_table(self):
        assert snapshot.to_safe_name("public.roads") == "public_roads"

    def test_numbers_only_preserved(self):
        assert snapshot.to_safe_name("2024") == "2024"

    def test_unicode_not_preserved(self):
        # Non-ASCII chars → underscore (no NFD normalization in Python version)
        result = snapshot.to_safe_name("café")
        assert "é" not in result
        assert result == "caf"

    def test_long_name_preserved(self):
        name = "a" * 100
        assert snapshot.to_safe_name(name) == name

    def test_mixed_case_and_special(self):
        assert snapshot.to_safe_name("My_Roads_2024!") == "my_roads_2024"
