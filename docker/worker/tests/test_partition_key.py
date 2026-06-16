"""
test_partition_key.py — Tests for duckdb-stac-generator.py:partition_key().

partition_key() is a pure function that transforms DuckDB partition row values
into filesystem-safe path components and SQL WHERE clauses.
"""
import pytest
from conftest import load_worker

stac = load_worker("duckdb-stac-generator.py")


class TestPartitionKeySingleColumn:
    def test_string_value(self):
        pi = stac.partition_key(["country"], ["NZ"])
        assert pi.p_safe == ["NZ"]
        assert pi.safe_keys == ["nz"]
        assert pi.folder_path == "country=nz"
        assert pi.where_clauses == "country = 'NZ'"

    def test_null_value_becomes_unknown(self):
        pi = stac.partition_key(["year"], [None])
        assert pi.p_safe == ["unknown"]
        assert pi.safe_keys == ["unknown"]
        assert pi.where_clauses == "year IS NULL"

    def test_numeric_string_value(self):
        pi = stac.partition_key(["year"], ["2024"])
        assert pi.safe_keys == ["2024"]
        assert pi.folder_path == "year=2024"
        assert pi.where_clauses == "year = '2024'"

    def test_spaces_in_value_replaced(self):
        pi = stac.partition_key(["region"], ["New Zealand"])
        assert pi.safe_keys == ["new_zealand"]
        assert pi.folder_path == "region=new_zealand"
        # Original value preserved in WHERE clause
        assert "New Zealand" in pi.where_clauses

    def test_slashes_in_value_replaced(self):
        pi = stac.partition_key(["code"], ["A/B"])
        assert pi.safe_keys == ["a_b"]

    def test_lowercase_conversion(self):
        pi = stac.partition_key(["type"], ["ROAD"])
        assert pi.safe_keys == ["road"]


class TestPartitionKeyMultiColumn:
    def test_two_columns(self):
        pi = stac.partition_key(["country", "year"], ["NZ", "2024"])
        assert pi.folder_path == "country=nz/year=2024"
        assert "country = 'NZ'" in pi.where_clauses
        assert "year = '2024'" in pi.where_clauses
        assert " AND " in pi.where_clauses

    def test_three_columns(self):
        pi = stac.partition_key(["a", "b", "c"], ["x", "y", "z"])
        assert pi.folder_path == "a=x/b=y/c=z"
        assert "a = 'x' AND b = 'y' AND c = 'z'" == pi.where_clauses

    def test_mixed_null_and_value(self):
        pi = stac.partition_key(["country", "year"], ["NZ", None])
        assert pi.p_safe == ["NZ", "unknown"]
        assert "country = 'NZ'" in pi.where_clauses
        assert "year IS NULL" in pi.where_clauses

    def test_all_null(self):
        pi = stac.partition_key(["country", "year"], [None, None])
        assert pi.folder_path == "country=unknown/year=unknown"
        assert "IS NULL AND" in pi.where_clauses


class TestPartitionInfoNamedTuple:
    def test_returns_partition_info(self):
        pi = stac.partition_key(["col"], ["val"])
        # Must be a namedtuple with these four fields
        assert hasattr(pi, "p_safe")
        assert hasattr(pi, "safe_keys")
        assert hasattr(pi, "folder_path")
        assert hasattr(pi, "where_clauses")
