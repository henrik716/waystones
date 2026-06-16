"""
test_build_pg.py — Tests for postgis-snapshot.py:build_pg_connection_string() and build_pg_uri().

Both functions read from PG_* environment variables; monkeypatch provides them.
"""
import pytest
from conftest import load_worker

snapshot = load_worker("postgis-snapshot.py")


@pytest.fixture(autouse=True)
def pg_env(monkeypatch):
    monkeypatch.setenv("PG_HOST",     "db.example.com")
    monkeypatch.setenv("PG_PORT",     "5432")
    monkeypatch.setenv("PG_DB",       "testdb")
    monkeypatch.setenv("PG_USER",     "alice")
    monkeypatch.setenv("PG_PASSWORD", "s3cret")


class TestBuildPgConnectionString:
    def test_produces_gdal_format(self):
        result = snapshot.build_pg_connection_string()
        assert result == "PG:host=db.example.com port=5432 dbname=testdb user=alice password=s3cret"

    def test_starts_with_pg_prefix(self):
        assert snapshot.build_pg_connection_string().startswith("PG:")

    def test_default_port_when_env_missing(self, monkeypatch):
        monkeypatch.delenv("PG_PORT", raising=False)
        result = snapshot.build_pg_connection_string()
        assert "port=5432" in result

    def test_special_chars_in_password_preserved(self, monkeypatch):
        monkeypatch.setenv("PG_PASSWORD", "p@ss!w0rd")
        result = snapshot.build_pg_connection_string()
        assert "password=p@ss!w0rd" in result

    def test_missing_required_host_raises(self, monkeypatch):
        monkeypatch.delenv("PG_HOST")
        with pytest.raises(KeyError):
            snapshot.build_pg_connection_string()

    def test_missing_required_db_raises(self, monkeypatch):
        monkeypatch.delenv("PG_DB")
        with pytest.raises(KeyError):
            snapshot.build_pg_connection_string()


class TestBuildPgUri:
    def test_produces_standard_uri(self):
        result = snapshot.build_pg_uri()
        assert result == "postgresql://alice:s3cret@db.example.com:5432/testdb"

    def test_starts_with_postgresql_scheme(self):
        assert snapshot.build_pg_uri().startswith("postgresql://")

    def test_custom_port_included(self, monkeypatch):
        monkeypatch.setenv("PG_PORT", "5433")
        result = snapshot.build_pg_uri()
        assert ":5433/" in result

    def test_missing_host_raises(self, monkeypatch):
        monkeypatch.delenv("PG_HOST")
        with pytest.raises(KeyError):
            snapshot.build_pg_uri()
