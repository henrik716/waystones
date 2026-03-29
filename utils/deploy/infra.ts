import {
  DataModel, SourceConnection,
  PostgresConfig, SupabaseConfig, DatabricksConfig
} from '../../types';
import { getGpkgFilename, hasS3Config } from './_helpers';
import { i18n } from '../../i18n';

// ============================================================
// Generate .env file
// ============================================================
export const generateEnvFile = (source: SourceConnection): string => {
  let env = `# Environment variables for deploy kit\n`;
  env += `# Generated: ${new Date().toISOString()}\n`;
  env += `# COPY THIS FILE: cp .env.template .env\n`;
  env += `# Then fill in your actual credentials below.\n\n`;

  // FIX: pygeoapi uses PYGEOAPI_SERVER_URL for all self-referencing links.
  // Set this to the public-facing URL of your deployment (no trailing slash).
  // Railway: copy the generated domain from the Railway dashboard after first deploy.
  // Fly.io:  https://<app-name>-pygeoapi.fly.dev (known before deploy)
  env += `# --- pygeoapi public URL ---\n`;
  env += `# Must be set to your public HTTPS URL — used in all API self-links.\n`;
  env += `# Railway: https://<your-app>.up.railway.app\n`;
  env += `# Fly.io:  https://<slug>-pygeoapi.fly.dev\n`;
  env += `# Local:   http://localhost:5000\n`;
  env += `PYGEOAPI_SERVER_URL=http://localhost:5000\n\n`;

  // FIX: PORT is injected automatically by Railway. Fly.io ignores this env var
  // (it uses internal_port in fly.toml). For local docker-compose, 80 is correct.
  env += `# --- Bind port ---\n`;
  env += `# Railway sets this automatically — do not change on Railway.\n`;
  env += `# Fly.io uses fly.toml internal_port instead — leave as 80 here.\n`;
  env += `PORT=80\n\n`;

  if (source.type === 'postgis') {
    const c = source.config as PostgresConfig;
    env += `# --- PostGIS connection ---\n`;
    env += `POSTGRES_HOST=${c.host}\n`;
    env += `POSTGRES_PORT=${c.port}\n`;
    env += `POSTGRES_DB=${c.dbname}\n`;
    env += `POSTGRES_USER=${c.user}\n`;
    env += `POSTGRES_PASSWORD=${c.password}\n`;
    env += `POSTGRES_SCHEMA=${c.schema || 'public'}\n`;
  } else if (source.type === 'supabase') {
    const c = source.config as SupabaseConfig;
    const ref = c.projectUrl.replace('https://', '').replace('.supabase.co', '');
    env += `# --- Supabase / PostGIS connection ---\n`;
    env += `POSTGRES_HOST=db.${ref}.supabase.co\n`;
    env += `POSTGRES_PORT=5432\n`;
    env += `POSTGRES_DB=postgres\n`;
    env += `POSTGRES_USER=postgres\n`;
    env += `POSTGRES_PASSWORD=your-supabase-db-password-here\n`;
    env += `POSTGRES_SCHEMA=${c.schema || 'public'}\n`;
    env += `SUPABASE_URL=${c.projectUrl}\n`;
    env += `SUPABASE_ANON_KEY=${c.anonKey}\n`;
  } else if (source.type === 'databricks') {
    const c = source.config as DatabricksConfig;
    env += `# --- Databricks connection ---\n`;
    env += `DATABRICKS_HOST=${c.host}\n`;
    env += `DATABRICKS_HTTP_PATH=${c.httpPath}\n`;
    env += `DATABRICKS_TOKEN=${c.token}\n`;
    env += `DATABRICKS_CATALOG=${c.catalog}\n`;
    env += `DATABRICKS_SCHEMA=${c.schema}\n`;
  } else if (source.type === 'geopackage') {
    if (hasS3Config(source) && source.s3) {
      const providerLabels: Record<string, string> = { r2: 'Cloudflare R2', tigris: 'Tigris (Fly.io)', aws: 'AWS S3', custom: 'Custom S3' };
      env += `# --- S3-compatible object storage (GeoPackage downloaded at startup) ---\n`;
      env += `# Provider: ${providerLabels[source.s3.provider] || source.s3.provider}\n`;
      if (source.s3.endpointUrl) env += `AWS_ENDPOINT_URL=${source.s3.endpointUrl}\n`;
      env += `AWS_DEFAULT_REGION=${source.s3.region}\n`;
      env += `S3_BUCKET_NAME=${source.s3.bucketName}\n`;
      env += `S3_OBJECT_KEY=${source.s3.objectKey}\n`;
      env += `GPKG_FILENAME=${getGpkgFilename({} as any, source)}\n`;
      env += `# Credentials — fill in (or set as platform secrets for Fly.io/Railway):\n`;
      env += `AWS_ACCESS_KEY_ID=your-access-key-id\n`;
      env += `AWS_SECRET_ACCESS_KEY=your-secret-access-key\n`;
    } else {
      env += `# No database credentials required for GeoPackage source\n`;
    }
  }

  // FIX: QGIS Server needs QGIS_SERVER_SERVICE_URL so GetCapabilities advertises
  // the correct public HTTPS URL rather than the internal http:// address.
  // QGIS Server 3.x serves WMS and WCS at /ows/ by default.
  env += `\n# --- QGIS Server public URL (WMS at /ows/) ---\n`;
  env += `# Set to the public-facing HTTPS URL for the QGIS Server service.\n`;
  env += `# Without this, GetCapabilities will advertise http:// behind an HTTPS proxy.\n`;
  env += `# Railway: https://<qgis-service>.up.railway.app/ows/\n`;
  env += `# Fly.io:  https://<slug>-qgis.fly.dev/ows/\n`;
  env += `# Local:   leave blank (not needed)\n`;
  env += `QGIS_SERVER_PUBLIC_URL=\n`;

  env += `\n# --- Configuration & Output ---\n`;
  env += `OUTPUT_DIR=./data/output\n`;

  if (source.type !== 'geopackage') {
    env += `\n# Delta Sync Interval in seconds (86400 = 24 hours)\n`;
    env += `SYNC_INTERVAL_SECONDS=86400\n`;
    if (!hasS3Config(source)) {
      env += `\n# Port to serve the GeoPackage downloads\n`;
      env += `DOWNLOAD_PORT=8081\n`;
    }
    if (hasS3Config(source) && source.s3) {
      const providerLabels: Record<string, string> = { r2: 'Cloudflare R2', tigris: 'Tigris (Fly.io)', aws: 'AWS S3', custom: 'Custom S3' };
      env += `\n# --- S3-compatible output storage (delta exports synced after each run) ---\n`;
      env += `# Provider: ${providerLabels[source.s3.provider] || source.s3.provider}\n`;
      if (source.s3.endpointUrl) env += `AWS_ENDPOINT_URL=${source.s3.endpointUrl}\n`;
      env += `AWS_DEFAULT_REGION=${source.s3.region}\n`;
      env += `S3_BUCKET_NAME=${source.s3.bucketName}\n`;
      env += `S3_OUTPUT_PREFIX=${source.s3.objectKey}\n`;
      env += `# Credentials — fill in (or set as platform secrets for Fly.io/Railway):\n`;
      env += `AWS_ACCESS_KEY_ID=your-access-key-id\n`;
      env += `AWS_SECRET_ACCESS_KEY=your-secret-access-key\n`;
    }
  }

  return env;
};

// ============================================================
// Generate docker-compose.yml
// ============================================================
export const generateDockerCompose = (
  model: DataModel,
  source: SourceConnection
): string => {
  const isPg = source.type === 'postgis' || source.type === 'supabase';
  const isGpkg = source.type === 'geopackage';
  const hasGeomLayers = model.layers.some(l => l.geometryType !== 'None');
  const useS3 = hasS3Config(source);

  let compose = `# Docker Compose for ${model.name}
# Source: ${source.type}
# Generated: ${new Date().toISOString()}
#
# Usage:
#   1. Copy .env.template to .env and fill in credentials
#   2. docker compose up -d
#   3. OGC API Features: http://localhost:5000
#   4. WMS (QGIS):   http://localhost:8080/ows/?SERVICE=WMS&REQUEST=GetCapabilities
#   5. Downloads:        http://localhost:\${DOWNLOAD_PORT:-8081}

services:
  # --- OGC API - Features (pygeoapi) ---
  pygeoapi:
    image: geopython/pygeoapi:latest
    ports:
      - "5000:80"
    volumes:
      - ./pygeoapi-config.yml:/pygeoapi/local.config.yml
      - ./templates:/pygeoapi/local-templates:ro
`;

  if (!isPg && !(isGpkg && useS3)) {
    compose += `      - ./data:/data\n`;
  }

  compose += `    env_file: .env\n`;
  if (isGpkg && useS3) {
    // startup.sh in Dockerfile handles download + pygeoapi startup
  } else {
    compose += `    entrypoint:\n`;
    compose += `      - /bin/bash\n`;
    compose += `      - -c\n`;
    compose += `      - |\n`;
    compose += `        pygeoapi openapi generate \${PYGEOAPI_CONFIG} --output-file \${PYGEOAPI_OPENAPI}\n`;
    compose += `        pygeoapi asyncapi generate \${PYGEOAPI_CONFIG} --output-file /pygeoapi/local.asyncapi.yml\n`;
    compose += `        pygeoapi serve\n`;
  }
  compose += `    restart: unless-stopped\n`;

  // WMS via QGIS Server (only if there are geometry layers)
  if (hasGeomLayers) {
    compose += `
  # --- WMS (QGIS Server) ---
  # QGIS Server 3.x serves all OGC services at /ows/ by default.
  # WMS GetCapabilities: http://localhost:8080/ows/?SERVICE=WMS&REQUEST=GetCapabilities
  #
  # FIX: QGIS_SERVER_SERVICE_URL ensures GetCapabilities advertises the correct
  # public URL when running behind an HTTPS reverse proxy (Railway, Fly, nginx).
  # Set QGIS_SERVER_PUBLIC_URL in your .env file after first deploy.
  qgis-server:
    image: qgis/qgis-server:ltr
    ports:
      - "8080:80"
    volumes:
      - ./project.qgs:/data/project.qgs
`;
    if (!isPg && !(isGpkg && useS3)) {
      compose += `      - ./data:/data\n`;
    }
    compose += `    environment:
      QGIS_PROJECT_FILE: /data/project.qgs
      QGIS_SERVER_SERVICE_URL: \${QGIS_SERVER_PUBLIC_URL:-}
    env_file: .env
    restart: unless-stopped
`;
  }

  // Delta export worker & Nginx file server (Skip for direct GeoPackage)
  if (!isGpkg) {
    if (!useS3) {
      compose += `
  # --- Delta File Download Server (Nginx) ---
  # Serves the generated .gpkg files as an auto-indexed web directory
  # STAC catalog: http://localhost:\${DOWNLOAD_PORT:-8081}/stac/catalog.json
  downloads:
    image: nginx:alpine
    ports:
      - "\${DOWNLOAD_PORT:-8081}:80"
    volumes:
      - ./data/output:/usr/share/nginx/html:ro
      - ./nginx-stac.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped
`;
    }

    const pipInstall = useS3
      ? `pip install -q psycopg2-binary awscli`
      : `pip install -q psycopg2-binary`;
    compose += `
  # --- Automated Delta GeoPackage Exporter ---
  delta-worker:
    image: ghcr.io/osgeo/gdal:ubuntu-full-latest
    volumes:
      - ./delta_export.py:/app/delta_export.py
      - ./data/output:/data/output
    env_file: .env
    environment:
      - SYNC_INTERVAL_SECONDS=\${SYNC_INTERVAL_SECONDS:-86400}
    entrypoint:
      - /bin/bash
      - -c
      - |
        ${pipInstall}
        echo "Starting automated delta extraction loop..."
        while true; do
          echo "Running extraction at $$(date)"
          python3 /app/delta_export.py --since last
          echo "Extraction complete. Sleeping for $\${SYNC_INTERVAL_SECONDS} seconds..."
          sleep $$SYNC_INTERVAL_SECONDS
        done
    restart: unless-stopped
`;

    if (source.type === 'databricks') {
      compose += `
  # --- Initial GeoPackage export (for Databricks) ---
  initial-export:
    image: ghcr.io/osgeo/gdal:ubuntu-full-latest
    volumes:
      - ./delta_export.py:/app/delta_export.py
      - ./data:/data/output
    env_file: .env
    entrypoint: ["python3", "/app/delta_export.py"]
    profiles:
      - setup  # Run once: docker compose --profile setup run --rm initial-export
`;
    }
  }

  return compose;
};

// ============================================================
// Generate startup.sh for geopackage + S3 deployments
// Downloads .gpkg from S3-compatible storage at container boot,
// then starts pygeoapi. Smart-cache: skips download if file exists.
// ============================================================
export const generateStartupScript = (
  model: DataModel,
  source: SourceConnection
): string => {
  const gpkgFilename = getGpkgFilename(model, source);
  return `#!/bin/bash
set -euo pipefail

GPKG_FILENAME="${gpkgFilename}"

if [ ! -f "/data/\${GPKG_FILENAME}" ] || [ "\${FORCE_S3_DOWNLOAD:-0}" = "1" ]; then
  echo "[startup] Downloading GeoPackage from S3..."
  mkdir -p /data
  # AWS_ENDPOINT_URL is picked up automatically by awscli v2 if set in env
  aws s3 cp "s3://\${S3_BUCKET_NAME}/\${S3_OBJECT_KEY}" "/data/\${GPKG_FILENAME}"
  echo "[startup] Download complete."
else
  echo "[startup] Cached file found: /data/\${GPKG_FILENAME}"
fi

echo "[startup] Generating OpenAPI document..."
pygeoapi openapi generate \${PYGEOAPI_CONFIG} --output-file \${PYGEOAPI_OPENAPI}

echo "[startup] Generating AsyncAPI document..."
pygeoapi asyncapi generate \${PYGEOAPI_CONFIG} --output-file /pygeoapi/local.asyncapi.yml || true

echo "[startup] Starting pygeoapi..."
exec pygeoapi serve
`;
};

// ============================================================
// Generate Dockerfile for pygeoapi
// ============================================================
export const generateDockerfile = (
  model: DataModel,
  source: SourceConnection
): string => {
  const isGpkg = source.type === 'geopackage';
  const useS3 = hasS3Config(source);

  const copyData = isGpkg && !useS3 ? 'COPY data/ /data/' : '';
  const s3Setup = isGpkg && useS3 ? `
# Install AWS CLI for S3-compatible storage download at startup
RUN pip3 install --no-cache-dir awscli

# Copy startup script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh
` : '';
  const cmd = isGpkg && useS3 ? '\nCMD ["/startup.sh"]' : '';

  return `FROM geopython/pygeoapi:latest

# Copy configuration
COPY pygeoapi-config.yml /pygeoapi/local.config.yml
${copyData}
# Copy custom templates to the path defined in pygeoapi-config.yml
COPY templates/ /pygeoapi/local-templates/
${s3Setup}
# FIX: Default env vars so the container starts correctly when no .env is present.
# PORT is overridden automatically by Railway. PYGEOAPI_SERVER_URL must be set
# manually to the public HTTPS URL after first deploy.
ENV PORT=80
ENV PYGEOAPI_SERVER_URL=http://localhost:5000

EXPOSE 80

# Create AsyncAPI document placeholder (required by pygeoapi startup check)
RUN echo "asyncapi: 2.6.0" > /pygeoapi/local.asyncapi.yml && \
    echo "info:" >> /pygeoapi/local.asyncapi.yml && \
    echo "  title: pygeoapi" >> /pygeoapi/local.asyncapi.yml && \
    echo "  version: 1.0.0" >> /pygeoapi/local.asyncapi.yml && \
    echo "channels: {}" >> /pygeoapi/local.asyncapi.yml
${cmd}`;
};

// ============================================================
// Generate fly.toml for Fly.io
// ============================================================
export const generateFlyToml = (
  model: DataModel,
  source: SourceConnection
): string => {
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // FIX: Pre-populate PYGEOAPI_SERVER_URL since the Fly app name is deterministic.
  // Users can override after deploy if they use a custom domain.
  let toml = `# Fly.io configuration for ${model.name}
# Generated by Waystones
#
# Deploy:
#   fly launch --copy-config    (first time)
#   fly deploy                  (subsequent)

app = "${slug}-pygeoapi"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile"

[env]
  # FIX: Pre-populated since Fly app names are deterministic.
  # Update if you configure a custom domain.
  PYGEOAPI_SERVER_URL = "https://${slug}-pygeoapi.fly.dev"
  # Fly routes to internal_port (80) below — PORT env var is not used by Fly.
  PORT = "80"

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

[checks]
  [checks.health]
    type = "http"
    port = 80
    path = "/conformance"
    interval = "30s"
    timeout = "5s"
`;

  if (source.type === 'geopackage') {
    if (hasS3Config(source) && source.s3) {
      // S3: no persistent volume needed — startup.sh downloads fresh on each boot
      // Non-sensitive S3 config goes in [env]; credentials go as fly secrets
      toml += `
[env]
  AWS_ENDPOINT_URL = "${source.s3.endpointUrl}"
  AWS_DEFAULT_REGION = "${source.s3.region}"
  S3_BUCKET_NAME = "${source.s3.bucketName}"
  S3_OBJECT_KEY = "${source.s3.objectKey}"
  GPKG_FILENAME = "${getGpkgFilename({} as any, source)}"
  # Set credentials: fly secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
`;
    } else {
      toml += `
[mounts]
  source = "geodata"
  destination = "/data"
`;
    }
  } else if (hasS3Config(source) && source.s3) {
    // Database source with S3 output storage
    toml += `
[env]
  AWS_ENDPOINT_URL = "${source.s3.endpointUrl}"
  AWS_DEFAULT_REGION = "${source.s3.region}"
  S3_BUCKET_NAME = "${source.s3.bucketName}"
  S3_OUTPUT_PREFIX = "${source.s3.objectKey}"
  # Set credentials: fly secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
`;
  }

  return toml;
};

// ============================================================
// Generate railway.json for Railway
// ============================================================
export const generateRailwayJson = (
  model: DataModel,
  source: SourceConnection
): string => {
  const config: any = {
    "$schema": "https://railway.com/railway.schema.json",
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: {
      // FIX: Railway auto-detects EXPOSE 80 from the Dockerfile.
      // healthcheckTimeout gives Railway enough time for pygeoapi cold start.
      healthcheckPath: "/conformance",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10
    }
  };

  return JSON.stringify(config, null, 2);
};

