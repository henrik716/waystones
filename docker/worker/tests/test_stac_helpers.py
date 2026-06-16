"""
test_stac_helpers.py — Tests for pure helper functions in duckdb-stac-generator.py:
  - safe_transform_expr()
  - build_gdal_select()
  - parse_model()
"""
import base64
import json
import pytest
from conftest import load_worker

stac = load_worker("duckdb-stac-generator.py")

GEOM_TYPES = stac.GEOM_TYPES  # frozenset of geometry type strings


# ---------------------------------------------------------------------------
# safe_transform_expr
# ---------------------------------------------------------------------------

class TestSafeTransformExpr:
    def test_unknown_srid_uses_three_arg_form(self):
        expr = stac.safe_transform_expr("geom", "EPSG:4326", source_srid=0)
        # 3-arg: ST_Transform(col, 'src', 'dst') — same CRS → tags without moving coords
        assert expr == "ST_Transform(geom, 'EPSG:4326', 'EPSG:4326')"

    def test_known_srid_uses_two_arg_form(self):
        expr = stac.safe_transform_expr("geom", "EPSG:4326", source_srid=25833)
        assert expr == "ST_Transform(geom, 'EPSG:4326')"

    def test_default_source_srid_is_zero(self):
        # source_srid defaults to 0 → 3-arg form
        expr = stac.safe_transform_expr("geometry", "EPSG:3857")
        assert expr.count("EPSG:3857") == 2  # both src and dst

    def test_different_geom_column_name(self):
        expr = stac.safe_transform_expr("wkb_geometry", "EPSG:4326", source_srid=4258)
        assert "wkb_geometry" in expr

    def test_result_starts_with_st_transform(self):
        expr = stac.safe_transform_expr("geom", "EPSG:4326")
        assert expr.startswith("ST_Transform(")


# ---------------------------------------------------------------------------
# build_gdal_select
# ---------------------------------------------------------------------------

class TestBuildGdalSelect:
    def _make_schema(self, cols):
        """cols: list of (name, type) tuples"""
        return cols

    def test_excludes_geometry_column(self):
        schema = [("fid", "INTEGER"), ("name", "VARCHAR"), ("geom", "GEOMETRY")]
        attr_cols, select_expr = stac.build_gdal_select(schema, "geom", "EPSG:4326", [])
        assert "geom" not in attr_cols
        assert "name" in attr_cols

    def test_excludes_fid_column(self):
        schema = [("fid", "INTEGER"), ("name", "VARCHAR"), ("geom", "GEOMETRY")]
        attr_cols, _ = stac.build_gdal_select(schema, "geom", "EPSG:4326", [])
        assert "fid" not in attr_cols

    def test_excludes_ogc_fid_column(self):
        schema = [("ogc_fid", "INTEGER"), ("name", "VARCHAR"), ("geom", "GEOMETRY")]
        attr_cols, _ = stac.build_gdal_select(schema, "geom", "EPSG:4326", [])
        assert "ogc_fid" not in attr_cols

    def test_excludes_partition_columns(self):
        schema = [("country", "VARCHAR"), ("name", "VARCHAR"), ("geom", "GEOMETRY")]
        attr_cols, _ = stac.build_gdal_select(schema, "geom", "EPSG:4326", ["country"])
        assert "country" not in attr_cols
        assert "name" in attr_cols

    def test_select_expr_contains_st_transform(self):
        schema = [("name", "VARCHAR"), ("geom", "GEOMETRY")]
        _, select_expr = stac.build_gdal_select(schema, "geom", "EPSG:4326", [])
        assert "ST_Transform" in select_expr

    def test_select_expr_ends_with_geom_alias(self):
        schema = [("name", "VARCHAR"), ("geom", "GEOMETRY")]
        _, select_expr = stac.build_gdal_select(schema, "geom", "EPSG:4326", [])
        assert "AS geom" in select_expr

    def test_attr_cols_quoted_in_select(self):
        schema = [("road_name", "VARCHAR"), ("geom", "GEOMETRY")]
        _, select_expr = stac.build_gdal_select(schema, "geom", "EPSG:4326", [])
        assert '"road_name"' in select_expr

    def test_geom_types_excluded(self):
        schema = [("fid", "INTEGER"), ("geom", "GEOMETRY"), ("other_geom", "MULTIPOLYGON")]
        attr_cols, _ = stac.build_gdal_select(schema, "geom", "EPSG:4326", [])
        assert "other_geom" not in attr_cols


# ---------------------------------------------------------------------------
# parse_model
# ---------------------------------------------------------------------------

class TestParseModel:
    def _encode(self, data):
        return base64.b64encode(json.dumps(data).encode()).decode()

    def test_happy_path(self):
        payload = {"layers": [{"id": "abc", "name": "Roads"}], "crs": "EPSG:4326"}
        result = stac.parse_model(self._encode(payload))
        assert result["crs"] == "EPSG:4326"
        assert result["layers"][0]["name"] == "Roads"

    def test_empty_string_returns_empty_dict(self):
        assert stac.parse_model("") == {}

    def test_none_returns_empty_dict(self):
        assert stac.parse_model(None) == {}

    def test_invalid_base64_returns_empty_dict(self):
        assert stac.parse_model("not-valid-base64!!!") == {}

    def test_valid_base64_invalid_json_returns_empty_dict(self):
        broken = base64.b64encode(b"not json {").decode()
        assert stac.parse_model(broken) == {}

    def test_nested_structure_preserved(self):
        payload = {"layers": [{"id": "1", "properties": [{"name": "road_name"}]}]}
        result = stac.parse_model(self._encode(payload))
        assert result["layers"][0]["properties"][0]["name"] == "road_name"
