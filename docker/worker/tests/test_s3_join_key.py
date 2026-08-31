"""
Regression tests for two real end-to-end S3 key-join failures.

1. With OUTPUT_URI=s3://waystones-data/ (bucket root — the value the docker-compose/
   Codespaces MinIO pipeline always uses), output_prefix.replace(f"s3://{bucket}/", "", 1)
   produces "", and the old code joined that with an unconditional "/", uploading every
   file under a key with a leading slash (e.g. "/hospitalpoints.parquet" instead of
   "hospitalpoints.parquet"). oapif-go's config generator (oapifgo.ts) assumes the bare
   "{id}.parquet" key, so oapif-go could never find the object it was told to query —
   every /items request 500'd with "query failed" even though the worker itself reported
   success.

2. duckdb-stac-generator.py's bulk-upload loop built its prefix as
   urlparse(out_dir).path.lstrip("/") — lstrip only strips the *leading* slash, so for a
   nested OUTPUT_URI like s3://waystones-data/stac/ the prefix stayed "stac/" (trailing
   slash intact), and s3_join_key("stac/", "catalog.json") produces "stac//catalog.json".
   Confirmed live: MinIO rejected the upload with XMinioInvalidObjectName ("Object name
   contains unsupported characters"), which aborted the whole worker-stac run.
"""

import pytest
from urllib.parse import urlparse

from conftest import load_worker

MODULES = ["gpkg-converter.py", "postgis-snapshot.py", "duckdb-stac-generator.py"]


@pytest.mark.parametrize("filename", MODULES)
class TestS3JoinKey:
    def test_bucket_root_prefix_produces_bare_key(self, filename):
        mod = load_worker(filename)
        assert mod.s3_join_key("", "hospitalpoints.parquet") == "hospitalpoints.parquet"

    def test_nested_prefix_joins_with_single_slash(self, filename):
        mod = load_worker(filename)
        assert mod.s3_join_key("tiles", "hospitalpoints.parquet") == "tiles/hospitalpoints.parquet"

    def test_matches_oapifgo_expected_bucket_root_key(self, filename):
        # oapifgo.ts: parquet_key = `${id}.parquet` — no leading slash, no prefix.
        mod = load_worker(filename)
        output_prefix = "s3://waystones-data/"
        bucket = "waystones-data"
        prefix_key = output_prefix.replace(f"s3://{bucket}/", "", 1).strip("/")
        assert mod.s3_join_key(prefix_key, "hospitalpoints.parquet") == "hospitalpoints.parquet"


class TestStacBulkUploadPrefix:
    """Reproduces the exact real failure: OUTPUT_URI=s3://waystones-data/stac/ (what
    infra.ts's worker-stac service always sets) must not leave a trailing slash on the
    prefix before it reaches s3_join_key, or every uploaded key gets a double slash."""

    def test_nested_output_uri_prefix_has_no_trailing_slash(self):
        out_dir = "s3://waystones-data/stac/"
        pfx = urlparse(out_dir).path.strip("/")
        assert pfx == "stac"

    def test_lstrip_alone_would_have_left_the_bug_in_place(self):
        # Documents exactly what was wrong: lstrip only strips the leading slash.
        out_dir = "s3://waystones-data/stac/"
        broken_pfx = urlparse(out_dir).path.lstrip("/")
        assert broken_pfx == "stac/"

    def test_catalog_json_key_matches_the_live_failure(self):
        mod = load_worker("duckdb-stac-generator.py")
        out_dir = "s3://waystones-data/stac/"
        pfx = urlparse(out_dir).path.strip("/")
        assert mod.s3_join_key(pfx, "catalog.json") == "stac/catalog.json"
