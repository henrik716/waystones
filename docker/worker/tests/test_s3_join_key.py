"""
Regression test for a real end-to-end failure: with OUTPUT_URI=s3://waystones-data/
(bucket root — the value the docker-compose/Codespaces MinIO pipeline always uses),
output_prefix.replace(f"s3://{bucket}/", "", 1) produces "", and the old code joined
that with an unconditional "/", uploading every file under a key with a leading slash
(e.g. "/hospitalpoints.parquet" instead of "hospitalpoints.parquet"). oapif-go's config
generator (oapifgo.ts) assumes the bare "{id}.parquet" key, so oapif-go could never find
the object it was told to query — every /items request 500'd with "query failed" even
though the worker itself reported success.
"""

import pytest

from conftest import load_worker

MODULES = ["gpkg-converter.py", "postgis-snapshot.py"]


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
