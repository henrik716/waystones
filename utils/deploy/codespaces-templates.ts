/**
 * codespaces-templates.ts
 *
 * Static templates for the "GitHub Codespaces" deploy target: a devcontainer
 * config, a generic same-origin PMTiles map viewer, and a companion notebook
 * that walks through the snapshot → oapif-go → PMTiles pipeline cell-by-cell.
 */

import { DataModel, SourceConnection } from '../../types';
import { hasS3Config, getGpkgFilename } from './_helpers';
import { MANUAL_EXTRAS_TILES_CMD, MANUAL_EXTRAS_STAC_CMD } from './readme';

// ============================================================
// .devcontainer/devcontainer.json
//
// Deliberately no image prefetch in postCreateCommand — tried it twice (postAttachCommand,
// which doesn't reliably fire in GitHub Codespaces at all; then a synchronous pull here) and
// backed both out. Prefetching stacks real wait time onto Codespace creation itself, before
// the user can do anything at all (read the intro, add their data) — worse than the same
// wait happening once they're actually looking at a usable Codespace. It also saves less
// than it looks like: worker/worker-tiles/worker-stac all share one image, and
// tiles-sync/stac-sync/data-fetcher share another (amazon/aws-cli), so there are really only
// ~4 distinct images total, each pulled once, naturally spread across cells 1/3/4 as the
// user reaches them — not a separate wait per cell. run_compose() already announces each
// step immediately on start, so a cold pull inside it reads as "this is doing something,"
// not a silent hang.
// Content is genuine JSON (devcontainer.json supports JSONC, but our own tests parse this
// with strict JSON.parse) — no // comments inside the template literal itself.
// ============================================================
export const devcontainerJson = `{
  "name": "Waystones Codespaces Quickstart",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/python:1": { "version": "3.12" }
  },
  "customizations": {
    "vscode": {
      "extensions": ["ms-toolsai.jupyter"]
    }
  },
  "forwardPorts": [5000, 8081, 19001],
  "portsAttributes": {
    "5000": { "label": "OGC API Features", "onAutoForward": "notify" },
    "8081": { "label": "PMTiles Map Viewer", "onAutoForward": "notify" },
    "19001": { "label": "MinIO Console (optional)", "onAutoForward": "silent" }
  },
  "postCreateCommand": "cp -n .env.template .env && pip3 install --user ipykernel && echo 'Open quickstart.ipynb and run the cells in order — see README.md for details.'"
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
const FALLBACK_COLORS = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#0891b2", "#7c3aed"];
const tileStatusEl = document.getElementById("tile-status");
const stacLinkEl = document.getElementById("stac-link");

// STAC catalog is optional — only linked if the worker-stac step has run.
fetch("stac/catalog.json", { method: "HEAD", cache: "no-store" }).then((res) => {
  if (res.ok) stacLinkEl.innerHTML = '<a href="stac/catalog.json" target="_blank">STAC catalog →</a>';
}).catch(() => {});

// Mirrors lib/provisioner/style-generator.ts's local toSafeName() (and the Python
// worker's to_safe_name()) — must match exactly, since it's how each model layer's
// PMTiles source-layer name is derived, and that's the only key available to join
// a tileset layer back to its model.json entry.
function toSafeName(name) {
  let safe = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  safe = safe.replace(/_+/g, "_");
  return safe.replace(/^_+|_+$/g, "") || "layer";
}

// Below mirrors lib/provisioner/style-generator.ts's translateToGLStyle() (Waystones
// Cloud's tile viewer) so a layer renders the same way here as it does there, instead
// of a generic rotating color with no relation to how it was styled in the editor.
function glColorExpr(style, prop) {
  if (style.type === "categorized" && style.propertyId) {
    const expr = ["match", ["get", style.propertyId]];
    const settings = style.categorizedSettings || {};
    for (const [code, cat] of Object.entries(settings)) expr.push(code, (cat && cat.color) || "#ccc");
    expr.push(style.simpleColor || "#ccc");
    return expr;
  }
  return style[prop] || "#ccc";
}

function glNumberExpr(style, prop, fallback) {
  if (style.type === "categorized" && style.propertyId) {
    const expr = ["match", ["get", style.propertyId]];
    const settings = style.categorizedSettings || {};
    for (const [code, cat] of Object.entries(settings)) {
      expr.push(code, (cat && cat[prop] != null ? cat[prop] : style[prop]) ?? fallback);
    }
    expr.push(style[prop] ?? fallback);
    return expr;
  }
  return style[prop] ?? fallback;
}

function glDashExpr(style) {
  switch (style.lineDash || "solid") {
    case "dashed": return [4, 4];
    case "dotted": return [1, 2];
    case "dash-dot": return [6, 2, 1, 2];
    case "dash-dot-dot": return [6, 2, 1, 1.5, 1, 1.5];
    case "long-dash": return [10, 4];
    default: return undefined;
  }
}

function modelLayerToGLLayers(layer, sourceLayer) {
  const style = layer.style;
  if (!style) return null;
  const geom = layer.geometryType || "";
  const isPoint = geom.includes("Point");
  const isLine = geom.includes("LineString");
  const isPolygon = geom.includes("Polygon");
  const out = [];

  if (isPolygon) {
    out.push({
      id: sourceLayer + "-fill", type: "fill", source: "tiles", "source-layer": sourceLayer,
      paint: { "fill-color": glColorExpr(style, "simpleColor"), "fill-opacity": glNumberExpr(style, "fillOpacity", 0.5) },
    });
    if (style.showOutline !== false) {
      out.push({
        id: sourceLayer + "-outline", type: "line", source: "tiles", "source-layer": sourceLayer,
        paint: {
          "line-color": glColorExpr(style, "simpleColor"),
          "line-width": glNumberExpr(style, "lineWidth", 1),
          "line-opacity": glNumberExpr(style, "lineOpacity", 1),
          "line-dasharray": glDashExpr(style),
        },
      });
    }
  } else if (isLine) {
    out.push({
      id: sourceLayer + "-line", type: "line", source: "tiles", "source-layer": sourceLayer,
      paint: {
        "line-color": glColorExpr(style, "simpleColor"),
        "line-width": glNumberExpr(style, "lineWidth", 2),
        "line-opacity": glNumberExpr(style, "lineOpacity", 1),
        "line-dasharray": glDashExpr(style),
      },
    });
  } else if (isPoint) {
    out.push({
      id: sourceLayer + "-point", type: "circle", source: "tiles", "source-layer": sourceLayer,
      paint: {
        "circle-color": glColorExpr(style, "simpleColor"),
        "circle-radius": glNumberExpr(style, "pointSize", 5),
        "circle-opacity": glNumberExpr(style, "pointOpacity", 1),
        "circle-stroke-width": style.outlineWidth ?? 1,
        "circle-stroke-color": style.outlineColor || "#ffffff",
      },
    });
  } else {
    return null;
  }

  if (style.labelSettings && style.labelSettings.enabled && style.labelSettings.propertyId) {
    const ls = style.labelSettings;
    out.push({
      id: sourceLayer + "-label", type: "symbol", source: "tiles", "source-layer": sourceLayer,
      layout: {
        "text-field": ["get", ls.propertyId],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ls.fontSize || 12,
        "text-anchor": ls.placement === "over" ? "center" : "top",
        "symbol-placement": isLine ? "line" : "point",
      },
      paint: {
        "text-color": ls.color || "#000000",
        "text-halo-color": ls.haloEnabled ? (ls.haloColor || "#ffffff") : "transparent",
        "text-halo-width": ls.haloEnabled ? (ls.haloSize || 1) : 0,
      },
    });
  }

  return out;
}

// A flat, geometry-filtered rendering used only when a tileset layer has no matching
// model.json entry (or model.json couldn't be fetched at all) — same behavior this
// viewer had before it read per-layer styling.
function fallbackGLLayers(sourceLayer, color) {
  return [
    { id: sourceLayer + "-fill", type: "fill", source: "tiles", "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": color, "fill-opacity": 0.35 } },
    { id: sourceLayer + "-line", type: "line", source: "tiles", "source-layer": sourceLayer,
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]], paint: { "line-color": color, "line-width": 1.5 } },
    { id: sourceLayer + "-point", type: "circle", source: "tiles", "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": color, "circle-radius": 4, "circle-stroke-width": 1, "circle-stroke-color": "#fff" } },
  ];
}

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

  // model.json sits next to this kit's docker-compose.yml — same file the worker
  // itself reads for layer name mapping. Styling degrades to flat fallback colors
  // (not a hard failure) if it's missing or unreadable.
  let model = null;
  try {
    const modelRes = await fetch("model.json", { cache: "no-store" });
    if (modelRes.ok) model = await modelRes.json();
  } catch (e) { /* fall back below */ }

  const pmtilesUrl = "tiles/" + manifest.pmtiles;
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const p = new pmtiles.PMTiles(pmtilesUrl);
  protocol.add(p);

  const [header, meta] = await Promise.all([p.getHeader(), p.getMetadata()]);
  const vectorLayers = (meta && meta.vector_layers) || [];

  const modelLayersBySafeName = {};
  if (model && Array.isArray(model.layers)) {
    for (const l of model.layers) {
      if (l.isAbstract) continue;
      modelLayersBySafeName[toSafeName(l.name)] = l;
    }
  }

  const glLayers = [];
  vectorLayers.forEach((layer, i) => {
    const sourceLayer = layer.id;
    const modelLayer = modelLayersBySafeName[sourceLayer];
    const styled = modelLayer && modelLayerToGLLayers(modelLayer, sourceLayer);
    glLayers.push(...(styled && styled.length ? styled : fallbackGLLayers(sourceLayer, FALLBACK_COLORS[i % FALLBACK_COLORS.length])));
  });

  // A real basemap (same one Waystones Cloud's own viewer uses) instead of a flat
  // fill color — the vector tile layers are then added as an overlay on top of it.
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [header.centerLon, header.centerLat],
    zoom: header.centerZoom,
  });

  map.on("load", () => {
    map.addSource("tiles", { type: "vector", url: "pmtiles://" + pmtilesUrl });
    glLayers.forEach((l) => map.addLayer(l));
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
// quickstart.ipynb — click-through companion to the written README steps
// ============================================================
const md = (...lines: string[]) => ({ cell_type: 'markdown', metadata: {}, source: toSource(lines) });
const code = (...lines: string[]) => ({ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: toSource(lines) });
const toSource = (lines: string[]): string[] =>
  lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line));

export function generateNotebook(model: DataModel, source: SourceConnection): string {
  const isLocalGpkg = source.type === 'geopackage' && !hasS3Config(source);

  const cells: any[] = [
    md(
      `# ${model.name} — Codespaces Quickstart`,
      '',
      'This notebook runs the full pipeline — convert your source data into GeoParquet, FlatGeobuf and PMTiles, ' +
        'serve it over OGC API Features, and view the vector tiles on a live map — entirely inside this Codespace, ' +
        'from data to service. Run the cells below in order (▶ on each cell, or **Run All** above).',
      '',
      "> Pushed new data or a changed model to this repo since opening this Codespace? See README.md's " +
        '"Updating this Codespace after a re-publish" section — a plain `git pull` will refuse if you\'ve ' +
        'already run any cells here.',
    ),
    code(
      'import random',
      'import subprocess',
      '',
      'PEON_LINES = [',
      '    "Work work!",',
      '    "Crunching geometries... this might take a bit.",',
      '    "Standardizing your data, because anarchy is for pirates.",',
      '    "Partitioning the universe into manageable chunks.",',
      `    "Me busy! Can't you see I'm optimizing the R-Tree?",`,
      '    "Work work... life is just one long buffer operation.",',
      ']',
      '',
      '# --progress quiet avoids the fancy Compose TUI (garbled repeated spinner frames in a',
      '# notebook cell instead of updating in place like a real terminal) without replacing it',
      '# with a wall of per-layer download lines either — --progress plain avoids the spinner',
      '# but still prints one line per progress tick, which floods the cell output on a large',
      '# image pull (the worker image alone is GDAL + tippecanoe + DuckDB). quiet suppresses',
      '# the routine progress stream; real errors still print and still fail the step below.',
      '# Streams output live (no capture_output) and stops the notebook immediately —',
      '# instead of silently continuing to the next cell — if the step actually failed.',
      'def run_compose(*args):',
      '    label = "docker compose " + " ".join(args)',
      '    print(f"\\u2192 {label}  ({random.choice(PEON_LINES)})")',
      '    proc = subprocess.run(["docker", "compose", "--progress", "quiet", *args])',
      '    if proc.returncode != 0:',
      '        raise SystemExit(f"\\u2717 {label} failed (exit {proc.returncode}) \\u2014 see output above.")',
      '    print(f"\\u2713 {label}")',
    ),
  ];

  if (isLocalGpkg) {
    // Must match docker-compose.yml's worker volume mount, which uses this same
    // filename (not a hardcoded "data.gpkg") — see generateDockerCompose().
    const gpkgFilename = getGpkgFilename(model, source);
    cells.push(
      code(
        'import os',
        `assert os.path.exists("${gpkgFilename}"), (`,
        `    "Add your GeoPackage as ./${gpkgFilename} in this folder (see README.md), then re-run this cell."`,
        ')',
        `print("Found ${gpkgFilename} — ready to go.")`,
      ),
    );
  }

  cells.push(
    md('## 📦 1. Create the snapshot (GeoParquet + FlatGeobuf)'),
    code(
      'run_compose("up", "worker")',
      '',
      '# Plain docker-compose equivalent: docker compose up worker',
    ),
    md(
      '## 🧩 2. Create the vector tiles (PMTiles)',
      '',
      'Run as-is for this kit\'s default tile detail range (0–14, no geometry simplification, ' +
        'every layer and attribute kept) — the *initial view* zoom is separate and always ' +
        'computed from your data\'s actual bounding box, regardless of this setting. To tune ' +
        'the detail range instead, edit the values in the commented line below and run it — ' +
        'try a few settings, no need to regenerate this kit.',
    ),
    code(
      'run_compose("up", "worker-tiles")',
      '',
      `# Plain docker-compose equivalent (no dedicated worker-tiles service there):`,
      `#   ${MANUAL_EXTRAS_TILES_CMD}`,
      '',
      '# To customize zoom range, simplification, or drop layers/attributes instead,' +
        ' edit and run this (comment out the line above):',
      '# !docker compose run --rm --progress plain \\',
      '#   -e MIN_ZOOM=0 -e MAX_ZOOM=12 -e SIMPLIFICATION=4 \\',
      '#   -e EXCLUDE_LAYERS=internal_notes -e EXCLUDE_ATTRIBUTES=created_by,internal_id \\',
      '#   worker-tiles',
      '# For tippecanoe to pick max zoom automatically from feature density instead of' +
        ' MAX_ZOOM, add -e AUTO_ZOOM=true and drop -e MAX_ZOOM.',
    ),
    md(
      '## 🧩 2b. Generate a STAC catalog (optional)',
      '',
      "Skip this cell if you don't need it — the map viewer in step 4 works fine without it. " +
        'Run as-is for a single flat catalog, or edit the commented line below to partition the catalog ' +
        'by a column from your data and re-run — try a few different columns, no need to regenerate this kit.',
    ),
    code(
      'run_compose("up", "worker-stac", "stac-sync")',
      '',
      `# Plain docker-compose equivalent (no dedicated worker-stac/stac-sync services there):`,
      `#   ${MANUAL_EXTRAS_STAC_CMD}`,
      `# (stac-sync has no equivalent there — output lands directly in MinIO; see step 4 below)`,
      '',
      '# To partition by a column instead, edit COLUMN and run these two lines' +
        ' (comment out the line above):',
      '# !docker compose run --rm --progress plain -e STRATEGY=custom_column -e COLUMN=your_column_name worker-stac',
      '# !docker compose --progress plain up stac-sync',
    ),
  );

  cells.push(
    md('## 🌐 3. Start the OGC API Features service'),
    code(
      'import os',
      '',
      '# oapif-go bakes SERVER_URL into every link and client-side data fetch on its own',
      '# HTML pages (landing page, collections browser, item maps, Swagger UI at /api.html)',
      "# — it must be the forwarded Codespaces URL, not localhost, or those pages' links",
      '# and data fetches point at the wrong place once opened in a real browser.',
      'codespace = os.environ.get("CODESPACE_NAME")',
      'domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")',
      'if codespace and domain:',
      '    os.environ["SERVER_URL"] = f"https://{codespace}-5000.{domain}"',
    ),
    code(
      'run_compose("up", "-d", "oapif")',
      '',
      '# Plain docker-compose equivalent: docker compose up -d oapif',
    ),
    md(
      '### See it in the browser',
      '',
      "oapif-go has its own built-in HTML pages — a landing page, a collections browser, a " +
        "map + table per collection, and interactive API docs (Swagger/Redoc) at `/api.html`. " +
        "It refuses to be embedded in an iframe (`X-Frame-Options: DENY`), so this waits for " +
        "it to come up, then links to it instead of testing/printing anything here.",
    ),
    code(
      'import time, urllib.request',
      'from IPython.display import Markdown, display',
      '',
      'print(f"Waiting for oapif-go to become ready \\u2014 {random.choice(PEON_LINES)}", end="", flush=True)',
      'for _ in range(30):',
      '    try:',
      '        urllib.request.urlopen("http://localhost:5000/collections")',
      '        print(" ready.")',
      '        break',
      '    except Exception:',
      '        print(".", end="", flush=True)',
      '        time.sleep(1)',
      'else:',
      '    print()',
      '    print("\\u2717 oapif-go did not become ready in time — check `docker compose logs oapif`.")',
      '',
      'if codespace and domain:',
      '    api_url = os.environ["SERVER_URL"]',
      '    display(Markdown(f"**API landing page:** {api_url}  \\n**Interactive API docs:** {api_url}/api.html"))',
      'else:',
      '    display(Markdown("Open forwarded port **5000** in the Ports tab to view the API."))',
    ),
    md('## 🗺️ 4. View the PMTiles (and STAC catalog, if you generated one)'),
    code(
      'run_compose("up", "-d", "viewer")',
      '',
      '# No plain docker-compose equivalent — that target ships no map viewer service.',
      '# PMTiles/STAC output there lands in MinIO only, browsable at localhost:19001',
      '# (login minioadmin/minioadmin) under the tiles/ and stac/ prefixes.',
    ),
    code(
      'import os',
      'from IPython.display import IFrame, Markdown, display',
      '',
      'codespace = os.environ.get("CODESPACE_NAME")',
      'domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")',
      'if codespace and domain:',
      '    url = f"https://{codespace}-8081.{domain}"',
      '    display(Markdown(f"**Map viewer:** {url}  (a STAC catalog link appears on the page if you generated one)"))',
      '    display(IFrame(url, width="100%", height=600))',
      'else:',
      '    display(Markdown("Open forwarded port **8081** in the Ports tab to view the map."))',
    ),
    md(
      '## 🔄 Reset',
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
