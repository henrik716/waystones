import sys
import types
import importlib
import importlib.util
from pathlib import Path

WORKER_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(WORKER_DIR))

# Stub duckdb — imported at module level in duckdb-stac-generator.py
duckdb_stub = types.ModuleType("duckdb")
sys.modules.setdefault("duckdb", duckdb_stub)

# Stub boto3 / botocore
for _mod in ("boto3", "botocore", "botocore.config"):
    sys.modules.setdefault(_mod, types.ModuleType(_mod))
sys.modules["botocore.config"].Config = object


def load_worker(filename: str):
    """Load a hyphen-named worker script by absolute path."""
    path = WORKER_DIR / filename
    name = filename.replace("-", "_").replace(".py", "")
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
