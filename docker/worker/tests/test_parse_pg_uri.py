"""
test_parse_pg_uri.py — Tests for main.py:parse_pg_uri().

parse_pg_uri() is a pure function that converts a postgresql:// URI
into a dict of PG_* environment variable names.
"""
import pytest
from conftest import load_worker

main = load_worker("main.py")


class TestParsePgUriHappyPath:
    def test_full_uri(self):
        result = main.parse_pg_uri("postgresql://alice:secret@db.example.com:5432/mydb")
        assert result == {
            "PG_HOST":     "db.example.com",
            "PG_PORT":     "5432",
            "PG_DB":       "mydb",
            "PG_USER":     "alice",
            "PG_PASSWORD": "secret",
        }

    def test_postgres_scheme_alias(self):
        result = main.parse_pg_uri("postgres://u:p@host/db")
        assert result["PG_HOST"] == "host"
        assert result["PG_DB"] == "db"
        assert result["PG_USER"] == "u"
        assert result["PG_PASSWORD"] == "p"

    def test_default_port_when_absent(self):
        result = main.parse_pg_uri("postgresql://u:p@host/db")
        assert result["PG_PORT"] == "5432"

    def test_explicit_non_standard_port(self):
        result = main.parse_pg_uri("postgresql://u:p@host:5433/db")
        assert result["PG_PORT"] == "5433"

    def test_empty_password(self):
        result = main.parse_pg_uri("postgresql://user:@host:5432/db")
        assert result["PG_PASSWORD"] == ""

    def test_no_path_gives_empty_db(self):
        result = main.parse_pg_uri("postgresql://user:pass@host")
        assert result["PG_DB"] == ""

    def test_localhost(self):
        result = main.parse_pg_uri("postgresql://user:pass@localhost/mydb")
        assert result["PG_HOST"] == "localhost"

    def test_ip_address_host(self):
        result = main.parse_pg_uri("postgresql://user:pass@192.168.1.10:5432/mydb")
        assert result["PG_HOST"] == "192.168.1.10"

    def test_all_five_keys_present(self):
        result = main.parse_pg_uri("postgresql://a:b@c:5432/d")
        assert set(result.keys()) == {"PG_HOST", "PG_PORT", "PG_DB", "PG_USER", "PG_PASSWORD"}


class TestParsePgUriErrors:
    def test_wrong_scheme_raises_value_error(self):
        with pytest.raises(ValueError):
            main.parse_pg_uri("mysql://user:pass@host/db")

    def test_http_scheme_raises_value_error(self):
        with pytest.raises(ValueError):
            main.parse_pg_uri("http://host/path")
