"""
Regression test for the endpoint_url bug hit end-to-end against local MinIO:
AWS_ENDPOINT_URL=http://minio:9000 (correct — MinIO has no TLS) was blindly
re-prefixed with "https://" because the old check only excluded strings that
already started with 'https://', producing the malformed
"https://http://minio:9000" and a NameResolutionError for host='http'.

All four worker scripts duplicate the same _boto3_client() helper.
"""

import sys
import pytest

from conftest import load_worker

MODULES = [
    "gpkg-converter.py",
    "postgis-snapshot.py",
    "vector-tile-generator.py",
    "duckdb-stac-generator.py",
]


class FakeConfig:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


@pytest.fixture(autouse=True)
def _stub_botocore_config(monkeypatch):
    monkeypatch.setattr(sys.modules["botocore.config"], "Config", FakeConfig)


def _capture_client_kwargs(monkeypatch):
    captured = {}

    def fake_client(service_name, **kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(sys.modules["boto3"], "client", fake_client, raising=False)
    return captured


@pytest.mark.parametrize("filename", MODULES)
class TestBoto3EndpointUrl:
    def test_local_http_endpoint_is_not_double_prefixed(self, filename, monkeypatch):
        mod = load_worker(filename)
        captured = _capture_client_kwargs(monkeypatch)
        monkeypatch.setenv("AWS_ENDPOINT_URL", "http://minio:9000")
        mod._boto3_client()
        assert captured["endpoint_url"] == "http://minio:9000"

    def test_https_endpoint_is_left_alone(self, filename, monkeypatch):
        mod = load_worker(filename)
        captured = _capture_client_kwargs(monkeypatch)
        monkeypatch.setenv("AWS_ENDPOINT_URL", "https://s3.example.com")
        mod._boto3_client()
        assert captured["endpoint_url"] == "https://s3.example.com"

    def test_bare_hostname_gets_https_prefix(self, filename, monkeypatch):
        mod = load_worker(filename)
        captured = _capture_client_kwargs(monkeypatch)
        monkeypatch.setenv("AWS_ENDPOINT_URL", "s3.example.com")
        mod._boto3_client()
        assert captured["endpoint_url"] == "https://s3.example.com"
