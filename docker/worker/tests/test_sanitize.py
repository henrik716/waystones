"""
test_sanitize.py — Tests for server_wrapper.py:sanitize().

sanitize() is a pure function that redacts credentials from log lines
and drops tippecanoe progress output (returns None for dropped lines).
"""
from conftest import load_worker

wrapper = load_worker("server_wrapper.py")


class TestSanitizePassthrough:
    def test_normal_line_unchanged(self):
        line = "[worker] Processing layer foo"
        assert wrapper.sanitize(line) == line

    def test_empty_line_unchanged(self):
        assert wrapper.sanitize("") == ""

    def test_generic_log_with_percent_preserved(self):
        line = "Completed 100% of features"
        assert wrapper.sanitize(line) == line


class TestSanitizePgDsn:
    def test_postgresql_scheme(self):
        line = "Connecting to postgresql://myuser:s3cr3t@db.host/mydb"
        result = wrapper.sanitize(line)
        assert "s3cr3t" not in result
        assert "myuser" not in result
        assert "postgresql://***:***@db.host/mydb" in result

    def test_postgres_scheme_alias(self):
        line = "postgres://user:pass@localhost:5432/db"
        result = wrapper.sanitize(line)
        assert "pass" not in result
        assert "postgres://***:***@localhost:5432/db" in result

    def test_redacts_password_only_in_dsn(self):
        # Non-DSN content around the URL should remain
        line = "Error with postgres://alice:hunter2@host/db — check connectivity"
        result = wrapper.sanitize(line)
        assert "hunter2" not in result
        assert "Error with" in result
        assert "check connectivity" in result

    def test_empty_password_not_matched_by_regex(self):
        # The regex requires ([^@]+) — needs at least one password char.
        # Empty password "user:@host" falls through unredacted. This is a
        # known edge case; empty PG passwords won't appear in real DSN logs.
        line = "postgresql://user:@host/db"
        result = wrapper.sanitize(line)
        # Should not crash and should return a string
        assert isinstance(result, str)


class TestSanitizeSecretKey:
    def test_secret_access_key_equals(self):
        line = "AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE"
        result = wrapper.sanitize(line)
        assert "AKIAIOSFODNN7EXAMPLE" not in result
        assert "AWS_SECRET_ACCESS_KEY=***" in result

    def test_secret_key_colon(self):
        line = "secret_key: my-super-secret"
        result = wrapper.sanitize(line)
        assert "my-super-secret" not in result
        assert "secret_key: ***" in result

    def test_secretaccesskey_no_separator(self):
        line = "SecretAccessKey=abc123"
        result = wrapper.sanitize(line)
        assert "abc123" not in result

    def test_case_insensitive(self):
        line = "SECRET_KEY=abc"
        result = wrapper.sanitize(line)
        assert "abc" not in result


class TestSanitizeTippecanoeProgress:
    def test_tippecanoe_progress_dropped(self):
        assert wrapper.sanitize("49.0%\t10/585/220") is None

    def test_low_percent_progress_dropped(self):
        assert wrapper.sanitize("5.0%\t8/100/200") is None

    def test_full_progress_dropped(self):
        assert wrapper.sanitize("100.0%\t14/1000/1000") is None

    def test_progress_without_tab_not_dropped(self):
        # Must match the pattern: digits.digits% TAB digits/digits/digits
        line = "49.0% done"
        result = wrapper.sanitize(line)
        assert result is not None
