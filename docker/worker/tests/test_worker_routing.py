"""
Tests for main.py routing logic.
subprocess.run is patched to capture which script gets launched.
main() only calls sys.exit on error, so we either expect SystemExit for
error cases or let it return normally for success cases (no APP_URL set →
report_success is a no-op).
"""

import os
import sys
import types
import pytest

from conftest import load_worker

main_mod = load_worker("main.py")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

BASE_ENV = {
    "INPUT_URI":   "s3://bucket/data.gpkg",
    "OUTPUT_TYPE": "local",
    "OUTPUT_URI":  "/data/",
}

def _sp_ok():
    r = types.SimpleNamespace()
    r.returncode = 0
    return r


def run_main(monkeypatch, extra_env: dict, mock_run):
    """Set env vars, patch subprocess.run, call main()."""
    env = {**BASE_ENV, **extra_env}
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(main_mod, "report_done", lambda *a, **kw: None)
    mock_run.return_value = _sp_ok()
    main_mod.main()
    return mock_run.call_args[0][0]   # the `cmd` list passed to subprocess.run


# ---------------------------------------------------------------------------
# Routing: task_type=snapshot
# ---------------------------------------------------------------------------

class TestRouting:
    def test_gpkg_snapshot_runs_gpkg_converter(self, monkeypatch, mocker):
        mock_run = mocker.patch.object(main_mod.subprocess, "run")
        cmd = run_main(monkeypatch, {"INPUT_TYPE": "gpkg", "TASK_TYPE": "snapshot"}, mock_run)
        assert any("gpkg-converter" in c for c in cmd)

    def test_postgis_snapshot_runs_postgis_snapshot(self, monkeypatch, mocker):
        mock_run = mocker.patch.object(main_mod.subprocess, "run")
        cmd = run_main(monkeypatch, {
            "INPUT_TYPE": "postgis",
            "TASK_TYPE": "snapshot",
            "INPUT_URI": "postgresql://alice:secret@db.host:5432/mydb",
        }, mock_run)
        assert any("postgis-snapshot" in c for c in cmd)

    def test_tiles_runs_vector_tile_generator(self, monkeypatch, mocker):
        mock_run = mocker.patch.object(main_mod.subprocess, "run")
        cmd = run_main(monkeypatch, {"INPUT_TYPE": "gpkg", "TASK_TYPE": "tiles"}, mock_run)
        assert any("vector-tile-generator" in c for c in cmd)

    def test_stac_runs_duckdb_stac_generator(self, monkeypatch, mocker):
        mock_run = mocker.patch.object(main_mod.subprocess, "run")
        cmd = run_main(monkeypatch, {"INPUT_TYPE": "gpkg", "TASK_TYPE": "stac"}, mock_run)
        assert any("duckdb-stac-generator" in c for c in cmd)

    def test_output_uri_forwarded_to_script(self, monkeypatch, mocker):
        mock_run = mocker.patch.object(main_mod.subprocess, "run")
        cmd = run_main(monkeypatch, {
            "INPUT_TYPE": "gpkg", "TASK_TYPE": "snapshot", "OUTPUT_URI": "/out/",
        }, mock_run)
        assert any("/out/" in c for c in cmd)


# ---------------------------------------------------------------------------
# PostGIS: PG_* env vars injected from URI
# ---------------------------------------------------------------------------

class TestPostgisEnvInjection:
    def test_pg_host_injected_from_uri(self, monkeypatch, mocker):
        mock_run = mocker.patch.object(main_mod.subprocess, "run")
        run_main(monkeypatch, {
            "INPUT_TYPE": "postgis",
            "TASK_TYPE": "snapshot",
            "INPUT_URI": "postgresql://alice:s3cr3t@db.example.com:5432/mydb",
        }, mock_run)
        env_used = mock_run.call_args[1].get("env") or mock_run.call_args[0][1] if len(mock_run.call_args[0]) > 1 else {}
        # subprocess.run(cmd, env=env) — extract from kwargs
        kw = mock_run.call_args.kwargs
        env_used = kw.get("env", {})
        assert env_used.get("PG_HOST") == "db.example.com"
        assert env_used.get("PG_USER") == "alice"
        assert env_used.get("PG_DB") == "mydb"

    def test_pg_port_defaults_to_5432_when_absent(self, monkeypatch, mocker):
        mock_run = mocker.patch.object(main_mod.subprocess, "run")
        run_main(monkeypatch, {
            "INPUT_TYPE": "postgis",
            "TASK_TYPE": "snapshot",
            "INPUT_URI": "postgresql://alice:s3cr3t@db.example.com/mydb",
        }, mock_run)
        kw = mock_run.call_args.kwargs
        env_used = kw.get("env", {})
        assert env_used.get("PG_PORT") == "5432"


# ---------------------------------------------------------------------------
# Error cases: missing or invalid env vars
# ---------------------------------------------------------------------------

class TestErrorCases:
    def test_missing_input_type_exits_1(self, monkeypatch, mocker):
        mocker.patch.object(main_mod, "report_done")
        for k in ("INPUT_TYPE", "INPUT_URI", "OUTPUT_TYPE", "OUTPUT_URI"):
            monkeypatch.delenv(k, raising=False)
        monkeypatch.setenv("OUTPUT_TYPE", "local")
        monkeypatch.setenv("OUTPUT_URI", "/data/")
        monkeypatch.setenv("INPUT_URI", "s3://bucket/data.gpkg")
        # INPUT_TYPE is intentionally missing
        with pytest.raises(SystemExit) as exc:
            main_mod.main()
        assert exc.value.code == 1

    def test_invalid_input_type_exits_1(self, monkeypatch, mocker):
        mocker.patch.object(main_mod, "report_done")
        monkeypatch.setenv("INPUT_TYPE", "oracle")
        monkeypatch.setenv("INPUT_URI", "ora://...")
        monkeypatch.setenv("OUTPUT_TYPE", "local")
        monkeypatch.setenv("OUTPUT_URI", "/data/")
        with pytest.raises(SystemExit) as exc:
            main_mod.main()
        assert exc.value.code == 1

    def test_invalid_postgis_uri_exits_1(self, monkeypatch, mocker):
        mocker.patch.object(main_mod, "report_done")
        monkeypatch.setenv("INPUT_TYPE", "postgis")
        monkeypatch.setenv("INPUT_URI", "mysql://not-pg/db")
        monkeypatch.setenv("OUTPUT_TYPE", "local")
        monkeypatch.setenv("OUTPUT_URI", "/data/")
        monkeypatch.setenv("TASK_TYPE", "snapshot")
        with pytest.raises(SystemExit) as exc:
            main_mod.main()
        assert exc.value.code == 1

    def test_subprocess_failure_exits_nonzero(self, monkeypatch, mocker):
        mocker.patch.object(main_mod, "report_done")
        fail = types.SimpleNamespace(returncode=2)
        mocker.patch.object(main_mod.subprocess, "run", return_value=fail)
        monkeypatch.setenv("INPUT_TYPE", "gpkg")
        monkeypatch.setenv("INPUT_URI", "s3://bucket/data.gpkg")
        monkeypatch.setenv("OUTPUT_TYPE", "local")
        monkeypatch.setenv("OUTPUT_URI", "/data/")
        with pytest.raises(SystemExit) as exc:
            main_mod.main()
        assert exc.value.code == 2
