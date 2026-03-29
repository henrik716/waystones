import { DataModel, Layer, SourceConnection } from '../types';
import { toTableName } from './nameSanitizer';

// ---- Internal STAC type interfaces ----

interface StacLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
}

interface StacAsset {
  href: string;
  title?: string;
  description?: string;
  type: string;
  roles: string[];
  'file:size'?: number;
  'file:checksum'?: string;
}

interface StacCatalog {
  type: 'Catalog';
  stac_version: string;
  id: string;
  title?: string;
  description: string;
  links: StacLink[];
}

interface StacCollection {
  type: 'Collection';
  stac_version: string;
  stac_extensions: string[];
  id: string;
  title: string;
  description: string;
  keywords?: string[];
  license: string;
  providers?: StacProvider[];
  extent: {
    spatial: { bbox: number[][] };
    temporal: { interval: (string | null)[][] };
  };
  links: StacLink[];
  summaries?: Record<string, unknown>;
}

interface StacProvider {
  name: string;
  description?: string;
  roles: string[];
  url?: string;
}

interface StacItem {
  type: 'Feature';
  stac_version: string;
  stac_extensions: string[];
  id: string;
  geometry: null;
  bbox: number[];
  properties: {
    datetime: null;
    created: string;
    updated: string;
    'proj:epsg': number | null;
    'file:size': number | null;
    'file:checksum': string | null;
    export_type: string;
    layer: string;
    collection: string;
  };
  links: StacLink[];
  assets: Record<string, StacAsset>;
  collection: string;
}

// ---- Helpers ----

function getEpsg(crs: string): number | null {
  const m = crs.match(/(\d{4,5})$/);
  return m ? parseInt(m[1], 10) : null;
}

function getDefaultBbox(model: DataModel): number[] {
  const ext = model.metadata?.spatialExtent;
  if (ext) {
    return [
      parseFloat(ext.westBoundLongitude) || -180,
      parseFloat(ext.southBoundLatitude) || -90,
      parseFloat(ext.eastBoundLongitude) || 180,
      parseFloat(ext.northBoundLatitude) || 90,
    ];
  }
  return [-180, -90, 180, 90];
}

function getTemporalInterval(model: DataModel): (string | null)[] {
  const from = model.metadata?.temporalExtentFrom || null;
  const to = model.metadata?.temporalExtentTo || null;
  return [from, to];
}

// ---- Exported functions ----

/**
 * Generate root STAC catalog.json for the model deployment.
 */
export function generateStacCatalog(model: DataModel): string {
  const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
  const activeLayers = model.layers.filter(l => !l.isAbstract);

  const links: StacLink[] = [
    { rel: 'self', href: './catalog.json', type: 'application/json' },
    { rel: 'root', href: './catalog.json', type: 'application/json' },
    {
      rel: 'child',
      href: `./collections/${modelId}/collection.json`,
      type: 'application/json',
      title: model.name,
    },
  ];

  for (const layer of activeLayers) {
    const tbl = toTableName(layer.name);
    links.push({
      rel: 'child',
      href: `./${tbl}/catalog.json`,
      type: 'application/json',
      title: layer.name,
    });
  }

  const catalog: StacCatalog = {
    type: 'Catalog',
    stac_version: '1.0.0',
    id: `${modelId}-catalog`,
    title: model.name,
    description: model.description || `STAC catalog for ${model.name}`,
    links,
  };

  return JSON.stringify(catalog, null, 2);
}

/**
 * Generate a STAC Collection document for the given model.
 */
export function generateStacCollection(model: DataModel, _source: SourceConnection): string {
  const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
  const bbox = getDefaultBbox(model);
  const interval = getTemporalInterval(model);

  const providers: StacProvider[] = [];
  if (model.metadata?.contactOrganization) {
    providers.push({
      name: model.metadata.contactOrganization,
      roles: ['producer'],
      url: model.metadata.url || undefined,
    });
  }

  const links: StacLink[] = [
    { rel: 'self', href: './collection.json', type: 'application/json' },
    { rel: 'root', href: '../../catalog.json', type: 'application/json' },
    { rel: 'parent', href: '../../catalog.json', type: 'application/json' },
  ];

  if (model.metadata?.termsOfService) {
    links.push({ rel: 'license', href: model.metadata.termsOfService });
  }

  const collection: StacCollection = {
    type: 'Collection',
    stac_version: '1.0.0',
    stac_extensions: [
      'https://stac-extensions.github.io/timestamps/v1.1.0/schema.json',
      'https://stac-extensions.github.io/projection/v1.1.0/schema.json',
      'https://stac-extensions.github.io/file/v2.1.0/schema.json',
    ],
    id: modelId,
    title: model.name,
    description: model.description || `GeoPackage exports for ${model.name}`,
    keywords: model.metadata?.keywords || [],
    license: model.metadata?.license || 'proprietary',
    providers: providers.length ? providers : undefined,
    extent: {
      spatial: { bbox: [bbox] },
      temporal: { interval: [interval] },
    },
    links,
    summaries: {
      'proj:epsg': [getEpsg(model.crs)].filter(Boolean),
    },
  };

  return JSON.stringify(collection, null, 2);
}

/**
 * Generate a per-layer placeholder STAC catalog.json (item list).
 * Updated at runtime by delta_export.py as new exports are created.
 */
export function generateStacLayerCatalog(layer: Layer, model: DataModel): string {
  const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
  const tbl = toTableName(layer.name);

  const catalog: StacCatalog = {
    type: 'Catalog',
    stac_version: '1.0.0',
    id: `${modelId}-${tbl}`,
    title: layer.name,
    description: layer.description || `GeoPackage exports for layer ${layer.name}`,
    links: [
      { rel: 'self', href: './catalog.json', type: 'application/json' },
      { rel: 'root', href: '../../catalog.json', type: 'application/json' },
      { rel: 'parent', href: '../../catalog.json', type: 'application/json' },
      {
        rel: 'collection',
        href: `../../collections/${modelId}/collection.json`,
        type: 'application/json',
      },
    ],
  };

  return JSON.stringify(catalog, null, 2);
}

/**
 * Generate Python helper functions to append to delta_export.py.
 * Provides write_stac_item() and update_stac_layer_catalog().
 */
export function generateStacItemSnippet(model: DataModel, _source: SourceConnection): string {
  const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
  const bbox = getDefaultBbox(model);
  const bboxStr = JSON.stringify(bbox);
  const epsg = getEpsg(model.crs);

  return `
# ============================================================
# STAC helpers
# ============================================================

import hashlib
import uuid as _uuid

STAC_VERSION = "1.0.0"
STAC_COLLECTION_ID = "${modelId}"
STAC_DEFAULT_BBOX = ${bboxStr}
STAC_EPSG = ${epsg !== null ? epsg : 'None'}
STAC_EXTENSIONS = [
    "https://stac-extensions.github.io/timestamps/v1.1.0/schema.json",
    "https://stac-extensions.github.io/projection/v1.1.0/schema.json",
    "https://stac-extensions.github.io/file/v2.1.0/schema.json",
]


def _detect_bbox(gpkg_path):
    """Use ogrinfo to detect the bounding box of a GeoPackage layer."""
    try:
        result = subprocess.run(
            ["ogrinfo", "-so", "-al", gpkg_path],
            capture_output=True, text=True, timeout=30
        )
        for line in result.stdout.splitlines():
            if line.startswith("Extent:"):
                # Extent: (minx, miny) - (maxx, maxy)
                parts = line.replace("Extent:", "").replace("(", "").replace(")", "").split("-")
                west, south = [float(v.strip()) for v in parts[0].split(",")]
                east, north = [float(v.strip()) for v in parts[1].split(",")]
                return [west, south, east, north]
    except Exception:
        pass
    return STAC_DEFAULT_BBOX


def _sha256_checksum(path):
    """Compute sha256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def _s3_asset_href(filename):
    """Build an absolute S3 URL for an asset, or fall back to relative path.
    Set S3_PUBLIC_BASE_URL in env to enable absolute URLs (recommended for STAC clients).
    Examples:
      Tigris:  https://fly.storage.tigris.dev/<bucket>/<prefix>
      R2:      https://pub-xxx.r2.dev/<prefix>  (or custom domain)
      AWS S3:  https://<bucket>.s3.<region>.amazonaws.com/<prefix>
    """
    base = os.environ.get("S3_PUBLIC_BASE_URL", "").rstrip("/")
    if base:
        return f"{base}/{filename}"
    return f"./{filename}"


def write_stac_item(tbl, output_path, export_type, collection_id=STAC_COLLECTION_ID, bbox=None):
    """Write a STAC Item JSON file alongside the GeoPackage."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    item_id = f"{tbl}-{export_type}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{str(_uuid.uuid4())[:8]}"
    detected_bbox = bbox or _detect_bbox(output_path)
    file_size = os.path.getsize(output_path) if os.path.exists(output_path) else None
    checksum = _sha256_checksum(output_path) if os.path.exists(output_path) else None
    asset_href = _s3_asset_href(os.path.basename(output_path))

    item = {
        "type": "Feature",
        "stac_version": STAC_VERSION,
        "stac_extensions": STAC_EXTENSIONS,
        "id": item_id,
        "geometry": None,
        "bbox": detected_bbox,
        "properties": {
            "datetime": None,
            "created": now,
            "updated": now,
            "proj:epsg": STAC_EPSG,
            "file:size": file_size,
            "file:checksum": checksum,
            "export_type": export_type,
            "layer": tbl,
            "collection": collection_id,
        },
        "links": [
            {"rel": "self", "href": f"./{os.path.basename(output_path)}.stac.json", "type": "application/json"},
            {"rel": "root", "href": "./stac/catalog.json", "type": "application/json"},
            {"rel": "parent", "href": f"./stac/{tbl}/catalog.json", "type": "application/json"},
            {"rel": "collection", "href": f"./stac/collections/{collection_id}/collection.json", "type": "application/json"},
        ],
        "assets": {
            "data": {
                "href": asset_href,
                "title": f"{tbl} ({export_type})",
                "type": "application/geopackage+sqlite3",
                "roles": ["data"],
                "file:size": file_size,
                "file:checksum": checksum,
            }
        },
        "collection": collection_id,
    }

    item_path = output_path + ".stac.json"
    with open(item_path, "w") as f:
        json.dump(item, f, indent=2)
    print(f"  [stac] Wrote {item_path}")
    return item_path


def update_stac_layer_catalog(tbl, item_path, stac_root):
    """Add a link to the new STAC item in the per-layer catalog.json."""
    catalog_path = os.path.join(stac_root, tbl, "catalog.json")
    if not os.path.exists(catalog_path):
        return

    try:
        with open(catalog_path) as f:
            catalog = json.load(f)

        item_href = os.path.relpath(item_path, os.path.dirname(catalog_path)).replace("\\\\", "/")
        new_link = {"rel": "item", "href": item_href, "type": "application/json"}

        # Avoid duplicate links
        existing_hrefs = {lnk.get("href") for lnk in catalog.get("links", [])}
        if item_href not in existing_hrefs:
            catalog.setdefault("links", []).append(new_link)
            with open(catalog_path, "w") as f:
                json.dump(catalog, f, indent=2)
            print(f"  [stac] Updated {catalog_path}")
    except Exception as e:
        print(f"  [stac] Warning: could not update layer catalog: {e}")
`;
}

/**
 * Generate the nginx configuration file content with proper MIME types for
 * GeoPackage and GeoJSON files.
 */
export function generateNginxStacConf(): string {
  return `server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    autoindex on;
    autoindex_exact_size off;
    autoindex_localtime on;

    types {
        text/html                     html htm;
        text/plain                    txt;
        application/json              json;
        application/geo+json          geojson;
        application/geopackage+sqlite3 gpkg;
        application/octet-stream      bin;
    }

    location / {
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        try_files $uri $uri/ =404;
    }
}
`;
}
