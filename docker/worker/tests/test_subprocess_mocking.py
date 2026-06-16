"""
Tests for postgis-snapshot.py functions that shell out to ogrinfo/ogr2ogr.
subprocess.run is patched globally — works because all worker scripts use
`import subprocess` and then call `subprocess.run(...)` directly.
"""

import os
import subprocess
import types
import pytest

from conftest import load_worker

# Load once per module — safe because we only call pure-ish functions
snapshot = load_worker("postgis-snapshot.py")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sp_result(returncode=0, stdout="", stderr=""):
    r = types.SimpleNamespace()
    r.returncode = returncode
    r.stdout = stdout
    r.stderr = stderr
    return r


OGRINFO_TWO_LAYERS = """\
Layer name: roads
Geometry Column = geom
Layer name: buildings
Geometry Column = wkb_geometry
"""

OGRINFO_ONE_LAYER = """\
Layer name: parcels
Geometry Column = shape
"""


# ---------------------------------------------------------------------------
# get_layer_catalog
# ---------------------------------------------------------------------------

class TestGetLayerCatalog:
    def test_returns_dict_with_discovered_layers(self, mocker):
        mocker.patch("subprocess.run", return_value=_sp_result(stdout=OGRINFO_TWO_LAYERS))
        cat = snapshot.get_layer_catalog("PG:host=db dbname=test")
        assert "roads" in cat
        assert "buildings" in cat

    def test_extracts_geometry_column(self, mocker):
        mocker.patch("subprocess.run", return_value=_sp_result(stdout=OGRINFO_TWO_LAYERS))
        cat = snapshot.get_layer_catalog("PG:host=db dbname=test")
        assert cat["roads"]["geom_col"] == "geom"
        assert cat["buildings"]["geom_col"] == "wkb_geometry"

    def test_full_name_set_to_layer_name(self, mocker):
        mocker.patch("subprocess.run", return_value=_sp_result(stdout=OGRINFO_ONE_LAYER))
        cat = snapshot.get_layer_catalog("PG:host=db dbname=test")
        assert cat["parcels"]["full_name"] == "parcels"

    def test_returns_empty_on_nonzero_returncode(self, mocker):
        mocker.patch("subprocess.run", return_value=_sp_result(returncode=1, stderr="connection refused"))
        cat = snapshot.get_layer_catalog("PG:host=db dbname=test")
        assert cat == {}

    def test_returns_empty_on_timeout(self, mocker):
        mocker.patch("subprocess.run", side_effect=subprocess.TimeoutExpired(["ogrinfo"], 120))
        cat = snapshot.get_layer_catalog("PG:host=db dbname=test")
        assert cat == {}

    def test_correct_ogrinfo_flags_used(self, mocker):
        mock_run = mocker.patch("subprocess.run", return_value=_sp_result(stdout=""))
        snapshot.get_layer_catalog("PG:host=db dbname=test")
        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "ogrinfo"
        assert "-ro" in cmd
        assert "-al" in cmd
        assert "-so" in cmd


# ---------------------------------------------------------------------------
# get_table_geom_col
# ---------------------------------------------------------------------------

class TestGetTableGeomCol:
    def test_returns_extracted_column_name(self, mocker):
        out = "Layer name: roads\nGeometry Column = wkb_geometry\n"
        mocker.patch("subprocess.run", return_value=_sp_result(stdout=out))
        col = snapshot.get_table_geom_col("PG:host=db dbname=test", "roads")
        assert col == "wkb_geometry"

    def test_returns_default_when_column_not_in_output(self, mocker):
        mocker.patch("subprocess.run", return_value=_sp_result(stdout="Layer name: roads\n"))
        col = snapshot.get_table_geom_col("PG:host=db dbname=test", "roads", default="geom")
        assert col == "geom"

    def test_returns_default_on_timeout(self, mocker):
        mocker.patch("subprocess.run", side_effect=subprocess.TimeoutExpired(["ogrinfo"], 20))
        col = snapshot.get_table_geom_col("PG:host=db dbname=test", "roads")
        assert col == "geom"

    def test_returns_default_on_nonzero_returncode(self, mocker):
        mocker.patch("subprocess.run", return_value=_sp_result(returncode=1))
        col = snapshot.get_table_geom_col("PG:host=db dbname=test", "roads")
        assert col == "geom"


# ---------------------------------------------------------------------------
# snapshot_table
# ---------------------------------------------------------------------------

class TestSnapshotTable:
    def test_returns_fgb_path_on_success(self, mocker, tmp_path):
        mocker.patch("subprocess.run", return_value=_sp_result(returncode=0))
        path = snapshot.snapshot_table(
            "PG:host=db dbname=test", "public.roads", "geom", "roads", str(tmp_path)
        )
        assert path.endswith("roads.fgb")
        assert "roads" in path

    def test_ogr2ogr_flags_present(self, mocker, tmp_path):
        mock_run = mocker.patch("subprocess.run", return_value=_sp_result(returncode=0))
        snapshot.snapshot_table(
            "PG:host=db dbname=test", "public.roads", "geom", "roads", str(tmp_path)
        )
        cmd = mock_run.call_args[0][0]
        assert "-f" in cmd
        assert "FlatGeobuf" in cmd
        assert "-nlt" in cmd
        assert "PROMOTE_TO_MULTI" in cmd

    def test_target_crs_added_when_provided(self, mocker, tmp_path):
        mock_run = mocker.patch("subprocess.run", return_value=_sp_result(returncode=0))
        snapshot.snapshot_table(
            "PG:host=db dbname=test", "public.roads", "geom", "roads",
            str(tmp_path), target_crs="EPSG:4326"
        )
        cmd = mock_run.call_args[0][0]
        assert "-t_srs" in cmd
        assert "EPSG:4326" in cmd

    def test_falls_back_to_a_srs_on_coordinate_system_error(self, mocker, tmp_path):
        """First ogr2ogr call fails with a coordinate system error → retry with -a_srs."""
        crs_error = _sp_result(returncode=1, stderr="coordinate system unknown")
        success   = _sp_result(returncode=0)
        mock_run  = mocker.patch("subprocess.run", side_effect=[crs_error, success])
        snapshot.snapshot_table(
            "PG:host=db dbname=test", "public.roads", "geom", "roads",
            str(tmp_path), target_crs="EPSG:4326"
        )
        assert mock_run.call_count == 2
        retry_cmd = mock_run.call_args_list[1][0][0]
        assert "-a_srs" in retry_cmd
        # -t_srs must have been removed in the fallback command
        assert "-t_srs" not in retry_cmd

    def test_raises_on_persistent_failure(self, mocker, tmp_path):
        mocker.patch("subprocess.run", return_value=_sp_result(returncode=1, stderr="fatal error"))
        with pytest.raises(RuntimeError, match="ogr2ogr failed"):
            snapshot.snapshot_table(
                "PG:host=db dbname=test", "public.roads", "geom", "roads", str(tmp_path)
            )

    def test_schema_qualified_name_is_double_quoted(self, mocker, tmp_path):
        mock_run = mocker.patch("subprocess.run", return_value=_sp_result(returncode=0))
        snapshot.snapshot_table(
            "PG:host=db dbname=test", "public.roads", "geom", "roads", str(tmp_path)
        )
        cmd = mock_run.call_args[0][0]
        sql_idx = cmd.index("-sql")
        sql = cmd[sql_idx + 1]
        assert '"public"."roads"' in sql
