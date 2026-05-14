#!/usr/bin/env python3
"""
warmup.py — pre-warm DuckDB connections for all GeoParquet collections.
"""
import os
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

CONFIG_PATH = os.getenv('PYGEOAPI_CONFIG', '/pygeoapi/local.config.yml')
_port = os.getenv('CONTAINER_PORT', os.getenv('PORT', '5001'))
BASE_URL = f'http://127.0.0.1:{_port}'
WORKERS = int(os.getenv('CONTAINER_WORKERS', 2))

def _warmup_provider_direct(provider_def: dict) -> None:
    from waystones.providers.geoparquet import GeoParquetDuckDBProvider
    provider = GeoParquetDuckDBProvider(provider_def)
    provider.get_fields()


def _run_internal_warmup(config: dict) -> None:
    """Directly instantiate each GeoParquetDuckDBProvider to warm OS page cache
    (spatial extension) and prime R2 Parquet footer reads before the HTTP loop."""
    timeout = float(os.getenv('INTERNAL_WARMUP_TIMEOUT', 60))
    t0 = time.monotonic()

    targets = []
    for coll_name, resource in config.get('resources', {}).items():
        for p in resource.get('providers', []):
            if 'geoparquet' in str(p.get('name', '')).lower():
                targets.append((coll_name, p))
                break

    if not targets:
        print('[warmup] Internal: no GeoParquet providers found, skipping', flush=True)
        return

    print(f'[warmup] Internal: warming {len(targets)} provider(s) directly...', flush=True)

    results = {}
    with ThreadPoolExecutor(max_workers=1) as executor:
        futures = {executor.submit(_warmup_provider_direct, pdef): name
                   for name, pdef in targets}
        for fut in as_completed(futures, timeout=timeout):
            name = futures[fut]
            try:
                fut.result()
                results[name] = True
                print(f'[warmup] Internal: {name} OK', flush=True)
            except Exception as exc:
                results[name] = False
                print(f'[warmup] Internal: {name} failed: {exc}', flush=True)

    elapsed = time.monotonic() - t0
    ok = sum(results.values())
    print(f'[warmup] Internal: done — {ok}/{len(targets)} OK in {elapsed:.1f}s', flush=True)


def wait_for_ready(timeout=60):
    """Wait for pygeoapi to start responding on the internal port."""
    for _ in range(timeout):
        try:
            urllib.request.urlopen(f'{BASE_URL}/', timeout=3)
            return True
        except Exception:
            time.sleep(1)
    return False

def warm_collection(name: str):
    url = f'{BASE_URL}/collections/{name}/items?limit=1'
    try:
        urllib.request.urlopen(url, timeout=120)
        print(f'[warmup] {name} OK', flush=True)
    except Exception as e:
        print(f'[warmup] {name} failed: {e}', flush=True)

def main():
    try:
        import yaml
    except ImportError:
        print('[warmup] PyYAML not available, skipping', flush=True)
        return

    print('[warmup] Waiting for pygeoapi...', flush=True)
    if not wait_for_ready():
        print('[warmup] pygeoapi did not start in time, skipping', flush=True)
        return

    # ---------------------------------------------------------
    # THE GRACE PERIOD
    # ---------------------------------------------------------
    # Wait before warming so we don't block the user's initial UI load.
    warmup_delay = float(os.getenv('WARMUP_DELAY', 5))
    if warmup_delay > 0:
        print(f'[warmup] pygeoapi ready — waiting {warmup_delay}s for first request to clear...', flush=True)
        time.sleep(warmup_delay)

    try:
        with open(CONFIG_PATH) as f:
            config = yaml.safe_load(f)
    except Exception as e:
        print(f'[warmup] Could not read config: {e}', flush=True)
        return

    collections = [
        name
        for name, resource in config.get('resources', {}).items()
        if any(
            'geoparquet' in str(p.get('name', '')).lower()
            for p in resource.get('providers', [])
        )
    ]

    if not collections:
        print('[warmup] No GeoParquet collections found', flush=True)
        return

    # ---------------------------------------------------------
    # PHASE 0: Internal provider warmup
    # ---------------------------------------------------------
    # Directly instantiate each provider to force DuckDB to load the spatial
    # extension (warms OS page cache) and read R2 Parquet footers (primes the
    # network path). Runs before the HTTP loop so Phase 1 finds warm caches.
    # Failures are logged and skipped — Phase 1/2 remain the fallback.
    try:
        _run_internal_warmup(config)
    except Exception as exc:
        print(f'[warmup] Internal warmup error: {exc}', flush=True)

    all_targets = collections * WORKERS

    # ---------------------------------------------------------
    # THE HYBRID WARMUP - PHASE 1: OS Cache Primer (Sequential)
    # ---------------------------------------------------------
    # Fire exactly ONE request first. This ensures one worker safely reads 
    # the 50MB spatial extension off the cold disk without thrashing. 
    print(f'[warmup] Phase 1: Sequential OS cache primer on {all_targets[0]}...', flush=True)
    warm_collection(all_targets[0])

    # ---------------------------------------------------------
    # THE HYBRID WARMUP - PHASE 2: Worker Wakeup (Concurrent)
    # ---------------------------------------------------------
    # Now blast the rest concurrently to wake up all remaining Gunicorn workers.
    # Because the spatial binary is now in RAM, this executes instantly.
    remaining_targets = all_targets[1:]
    if remaining_targets:
        print(f'[warmup] Phase 2: Fan-out {len(remaining_targets)} requests across {WORKERS} workers...', flush=True)
        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            list(executor.map(warm_collection, remaining_targets))

    print('[warmup] Done.', flush=True)

if __name__ == '__main__':
    main()