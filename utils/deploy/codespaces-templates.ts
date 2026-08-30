/**
 * codespaces-templates.ts
 *
 * Static templates for the "GitHub Codespaces" deploy target: a devcontainer
 * config, a generic same-origin PMTiles map viewer, and a companion notebook
 * that walks through the snapshot → oapif-go → PMTiles pipeline cell-by-cell.
 */

import { DataModel, SourceConnection } from '../../types';
import { hasS3Config } from './_helpers';

// ============================================================
// .devcontainer/devcontainer.json
// ============================================================
export const devcontainerJson = `{
  "name": "Waystones Codespaces Demo",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "customizations": {
    "vscode": {
      "extensions": ["ms-toolsai.jupyter"]
    }
  },
  "forwardPorts": [5000, 8081, 9001],
  "portsAttributes": {
    "5000": { "label": "OGC API Features", "onAutoForward": "notify" },
    "8081": { "label": "PMTiles Map Viewer", "onAutoForward": "openPreview" },
    "9001": { "label": "MinIO Console (optional)", "onAutoForward": "silent" }
  },
  "postCreateCommand": "echo 'Open demo.ipynb and run the cells in order — see README.md for details.'"
}
`;

// ============================================================
// viewer/index.html — generic same-origin PMTiles viewer
//
// Same-origin by design: nginx serves this page AND the synced .pmtiles
// file from the same container/port, so the browser never needs CORS or
// bucket credentials to read tile ranges.
// ============================================================
export const viewerIndexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Waystones — PMTiles Viewer</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
<script src="https://unpkg.com/pmtiles@4.4.1/dist/pmtiles.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; }
  #status {
    position: absolute; top: 12px; left: 12px; z-index: 1;
    font: 13px/1.4 -apple-system, sans-serif; background: #fff;
    padding: 8px 12px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.2);
    max-width: 320px;
  }
  #status a { color: #4f46e5; }
  #stac-link { margin-top: 4px; }
</style>
</head>
<body>
<div id="status">
  <span id="tile-status">Loading tiles…</span>
  <div id="stac-link"></div>
</div>
<div id="map"></div>
<script>
const COLORS = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#0891b2", "#7c3aed"];
const tileStatusEl = document.getElementById("tile-status");
const stacLinkEl = document.getElementById("stac-link");

// STAC catalog is optional — only linked if the worker-stac step has run.
fetch("stac/catalog.json", { method: "HEAD", cache: "no-store" }).then((res) => {
  if (res.ok) stacLinkEl.innerHTML = '<a href="stac/catalog.json" target="_blank">STAC catalog →</a>';
}).catch(() => {});

async function main() {
  let manifest;
  try {
    const res = await fetch("tiles/.tiles.json", { cache: "no-store" });
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    manifest = await res.json();
  } catch (e) {
    tileStatusEl.textContent = "No tiles found yet — run the 'worker-tiles' step first, then reload this page.";
    return;
  }

  const pmtilesUrl = "tiles/" + manifest.pmtiles;
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const p = new pmtiles.PMTiles(pmtilesUrl);
  protocol.add(p);

  const [header, meta] = await Promise.all([p.getHeader(), p.getMetadata()]);
  const vectorLayers = (meta && meta.vector_layers) || [];

  const layers = [];
  vectorLayers.forEach((layer, i) => {
    const color = COLORS[i % COLORS.length];
    const sourceLayer = layer.id;
    layers.push({
      id: sourceLayer + "-fill",
      type: "fill",
      source: "tiles",
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": color, "fill-opacity": 0.35 },
    });
    layers.push({
      id: sourceLayer + "-line",
      type: "line",
      source: "tiles",
      "source-layer": sourceLayer,
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
      paint: { "line-color": color, "line-width": 1.5 },
    });
    layers.push({
      id: sourceLayer + "-point",
      type: "circle",
      source: "tiles",
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": color, "circle-radius": 4, "circle-stroke-width": 1, "circle-stroke-color": "#fff" },
    });
  });

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        tiles: { type: "vector", url: "pmtiles://" + pmtilesUrl },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#f4f4f5" } },
        ...layers,
      ],
    },
    center: [header.centerLon, header.centerLat],
    zoom: header.centerZoom,
  });

  map.on("load", () => {
    map.fitBounds(
      [[header.minLon, header.minLat], [header.maxLon, header.maxLat]],
      { padding: 40, duration: 0 }
    );
    tileStatusEl.textContent = manifest.pmtiles + " — " + vectorLayers.length + " layer(s)";
  });
}

main();
</script>
</body>
</html>
`;

// ============================================================
// demo.ipynb — click-through companion to the written README steps
// ============================================================
const md = (...lines: string[]) => ({ cell_type: 'markdown', metadata: {}, source: toSource(lines) });
const code = (...lines: string[]) => ({ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: toSource(lines) });
const toSource = (lines: string[]): string[] =>
  lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line));

export function generateNotebook(
  model: DataModel,
  source: SourceConnection,
  opts?: { stac?: { enabled: boolean } }
): string {
  const isLocalGpkg = source.type === 'geopackage' && !hasS3Config(source);
  const includeStac = opts?.stac?.enabled ?? false;

  const cells: any[] = [
    md(
      `# ${model.name} — Codespaces Demo`,
      '',
      'This notebook runs the full pipeline — convert your source data into GeoParquet, FlatGeobuf and PMTiles, ' +
        'serve it over OGC API Features, and view the vector tiles on a live map — entirely inside this Codespace. ' +
        'Run the cells below in order (▶ on each cell, or **Run All** above).',
    ),
  ];

  if (isLocalGpkg) {
    cells.push(
      code(
        'import os',
        'assert os.path.exists("data.gpkg"), (',
        '    "Add your GeoPackage as ./data.gpkg in this folder (see README.md), then re-run this cell."',
        ')',
        'print("Found data.gpkg — ready to go.")',
      ),
    );
  }

  cells.push(
    md('## 1. Create the snapshot (GeoParquet + FlatGeobuf)'),
    code('!docker compose up worker'),
    md('## 2. Create the vector tiles (PMTiles)'),
    code('!docker compose up worker-tiles'),
  );

  if (includeStac) {
    cells.push(
      md(
        '## 2b. Generate the STAC catalog',
        '',
        'Run as-is for a single flat catalog, or edit the commented line below to partition the catalog ' +
          'by a column from your data (any column present on at least one layer) and re-run this cell — ' +
          'try a few different columns, no need to regenerate this kit.',
      ),
      code(
        '!docker compose up worker-stac',
        '',
        '# To partition by a column instead, edit COLUMN and run this line (comment out the line above):',
        '# !docker compose run --rm -e STRATEGY=custom_column -e COLUMN=your_column_name worker-stac',
      ),
    );
  }

  cells.push(
    md('## 3. Start the OGC API Features service'),
    code('!docker compose up -d oapif'),
    code(
      'import json, time, urllib.request',
      '',
      'for _ in range(30):',
      '    try:',
      '        with urllib.request.urlopen("http://localhost:5000/collections") as r:',
      '            print(json.dumps(json.load(r), indent=2))',
      '            break',
      '    except Exception:',
      '        time.sleep(1)',
      'else:',
      '    print("oapif-go did not become ready in time — check `docker compose logs oapif`.")',
    ),
    md('## 4. View the PMTiles' + (includeStac ? ' and STAC catalog' : '')),
    code('!docker compose up -d viewer'),
    code(
      'import os',
      'from IPython.display import IFrame, Markdown, display',
      '',
      'codespace = os.environ.get("CODESPACE_NAME")',
      'domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")',
      'if codespace and domain:',
      '    url = f"https://{codespace}-8081.{domain}"',
      '    display(Markdown(f"**Map viewer:** {url}"))',
      ...(includeStac ? ['    display(Markdown(f"**STAC catalog:** {url}/stac/catalog.json"))'] : []),
      '    display(IFrame(url, width="100%", height=600))',
      'else:',
      '    display(Markdown("Open forwarded port **8081** in the Ports tab to view the map."))',
    ),
    md(
      '## Reset',
      '',
      'To tear everything down and try again (e.g. with a different file):',
    ),
    code('# !docker compose down -v'),
  );

  const notebook = {
    cells,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };

  return JSON.stringify(notebook, null, 1);
}
