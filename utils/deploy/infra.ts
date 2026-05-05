import {
  DataModel, SourceConnection,
} from '../../types';
import { getPgConnectionEnv, hasS3Config } from './_helpers';

// ============================================================
// Generate .env file
// ============================================================
export const generateEnvFile = (source: SourceConnection): string => {
  let env = `# Environment variables for deploy kit\n`;
  env += `# Generated: ${new Date().toISOString()}\n`;
  env += `# COPY THIS FILE: cp .env.template .env\n`;
  env += `# Then fill in your actual credentials below.\n\n`;

  env += `# --- pygeoapi public URL ---\n`;
  env += `# Set to your public HTTPS URL — used in all API self-links.\n`;
  env += `# Railway: https://<your-app>.up.railway.app\n`;
  env += `# Local:   http://localhost:5000\n`;
  env += `PYGEOAPI_SERVER_URL=http://localhost:5000\n\n`;

  env += `# --- Bind port ---\n`;
  env += `# Railway sets this automatically — do not change on Railway.\n`;
  env += `PORT=80\n\n`;

  const isPg = source.type === 'postgis' || source.type === 'supabase';

  if (isPg) {
    const pgEnv = getPgConnectionEnv(source);
    if (pgEnv) {
      env += `# --- PostGIS connection ---\n`;
      env += `POSTGRES_HOST=${pgEnv.POSTGRES_HOST}\n`;
      env += `POSTGRES_PORT=${pgEnv.POSTGRES_PORT}\n`;
      env += `POSTGRES_DB=${pgEnv.POSTGRES_DB}\n`;
      env += `POSTGRES_USER=${pgEnv.POSTGRES_USER}\n`;
      env += `POSTGRES_PASSWORD=YOUR_DATABASE_PASSWORD_HERE\n`;
      env += `POSTGRES_SCHEMA=${pgEnv.POSTGRES_SCHEMA}\n\n`;
    }
  } else if (source.type === 'geopackage' && hasS3Config(source) && source.s3) {
    const s3 = source.s3;
    const providerLabels: Record<string, string> = {
      r2: 'Object Storage (R2)', tigris: 'Tigris', aws: 'AWS S3', custom: 'Custom S3',
    };
    env += `# --- S3-compatible storage (GeoPackage downloaded by init container) ---\n`;
    env += `# Provider: ${providerLabels[s3.provider] || s3.provider}\n`;
    if (s3.endpointUrl) env += `AWS_ENDPOINT_URL=${s3.endpointUrl}\n`;
    env += `AWS_DEFAULT_REGION=${s3.region}\n`;
    env += `S3_BUCKET_NAME=${s3.bucketName}\n`;
    env += `S3_OBJECT_KEY=${s3.objectKey}\n`;
    env += `# Credentials — fill in (or set as platform secrets):\n`;
    env += `AWS_ACCESS_KEY_ID=your-access-key-id\n`;
    env += `AWS_SECRET_ACCESS_KEY=your-secret-access-key\n\n`;
  }

  env += `# --- QGIS Server public URL (WMS at /ows/) ---\n`;
  env += `# Set to the public-facing HTTPS URL. Leave blank for local use.\n`;
  env += `# Railway: https://<qgis-service>.up.railway.app/ows/\n`;
  env += `QGIS_SERVER_PUBLIC_URL=\n`;

  return env;
};

// ============================================================
// Generate docker-compose.yml
//
// Snapshot architecture: a worker init container converts the input
// (GPKG file or PostGIS DB) to per-layer Parquet + FlatGeobuf files
// on a shared volume. pygeoapi and QGIS Server read those files and
// never touch a database or raw GeoPackage directly.
// ============================================================
export const generateDockerCompose = (
  model: DataModel,
  source: SourceConnection
): string => {
  const isPg = source.type === 'postgis' || source.type === 'supabase';
  const isS3Gpkg = source.type === 'geopackage' && hasS3Config(source);
  const isLocalGpkg = source.type === 'geopackage' && !hasS3Config(source);
  const hasGeomLayers = model.layers.some(l => l.geometryType !== 'None');

  let compose = `# Docker Compose for ${model.name}
# Source: ${source.type}
# Generated: ${new Date().toISOString()}
#
# Snapshot architecture: the worker converts your data source to Parquet/FlatGeobuf
# files on a shared volume. pygeoapi and QGIS Server read those files — they never
# talk to a database or raw GeoPackage directly.
#
# Usage:
#   1. Copy .env.template to .env and fill in credentials
`;

  if (isLocalGpkg) {
    compose += `#   2. Place your GeoPackage as ./data.gpkg next to this file\n`;
    compose += `#   3. docker compose up\n`;
  } else {
    compose += `#   2. docker compose up\n`;
  }

  compose += `#   OGC API Features: http://localhost:5000\n`;
  if (hasGeomLayers) {
    compose += `#   WMS (QGIS):       http://localhost:8080/ows/?SERVICE=WMS&REQUEST=GetCapabilities\n`;
  }

  compose += `\nservices:\n`;

  // --- data-fetcher (S3 GPKG only) ---
  if (isS3Gpkg) {
    compose += `  # --- GeoPackage fetcher (runs once, downloads from S3, then exits) ---
  data-fetcher:
    image: amazon/aws-cli
    volumes:
      - input-data:/input
    env_file: .env
    command: s3 cp s3://\${S3_BUCKET_NAME}/\${S3_OBJECT_KEY} /input/data.gpkg
    restart: "no"

`;
  }

  // --- worker ---
  compose += `  # --- Worker (runs once: converts input → Parquet + FlatGeobuf, then exits) ---\n`;
  compose += `  worker:\n`;
  compose += `    image: ghcr.io/waystones-nexus/waystones-keystone:worker-latest\n`;
  compose += `    volumes:\n`;
  compose += `      - waystones_data:/data\n`;
  if (isS3Gpkg) {
    compose += `      - input-data:/input:ro\n`;
  } else if (isLocalGpkg) {
    compose += `      - ./data.gpkg:/input/data.gpkg:ro\n`;
  }
  compose += `    environment:\n`;
  if (isPg) {
    compose += `      INPUT_TYPE: postgis\n`;
    compose += `      INPUT_URI: postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}\n`;
  } else {
    compose += `      INPUT_TYPE: gpkg\n`;
    compose += `      INPUT_URI: /input/data.gpkg\n`;
  }
  compose += `      OUTPUT_TYPE: local\n`;
  compose += `      OUTPUT_URI: /data/\n`;
  if (isPg) {
    compose += `    env_file: .env\n`;
  }
  if (isS3Gpkg) {
    compose += `    depends_on:\n`;
    compose += `      data-fetcher:\n`;
    compose += `        condition: service_completed_successfully\n`;
  }
  compose += `    restart: "no"\n`;

  // --- pygeoapi ---
  compose += `
  # --- API Gateway / OGC API (pygeoapi) ---
  pygeoapi:
    image: ghcr.io/waystones-nexus/waystones-keystone:pygeoapi-latest
    ports:
      - "5000:5000"
    volumes:
      - ./pygeoapi-config.yml:/pygeoapi/local.config.yml:ro
      - waystones_data:/data:ro
`;
  if (hasGeomLayers) {
    compose += `    environment:
      - DEPLOY_QGIS=1
      - QGIS_UPSTREAM_TARGET=qgis-server:80\n`;
  }
  compose += `    env_file: .env
    depends_on:
      worker:
        condition: service_completed_successfully
    restart: unless-stopped
`;

  // --- qgis-server ---
  if (hasGeomLayers) {
    compose += `
  # --- WMS (QGIS Server) ---
  # Internal Engine — accessed via pygeoapi gateway at http://localhost:5000/ows/
  qgis-server:
    image: ghcr.io/waystones-nexus/waystones-keystone:qgis-latest
    volumes:
      - ./project.qgs:/data/project.qgs:ro
      - waystones_data:/data:ro
    environment:
      QGIS_SERVER_SERVICE_URL: \${QGIS_SERVER_PUBLIC_URL:-}
    env_file: .env
    depends_on:
      worker:
        condition: service_completed_successfully
    restart: unless-stopped
`;
  }

  // --- volumes ---
  compose += `\nvolumes:\n`;
  compose += `  waystones_data:\n`;
  if (isS3Gpkg) {
    compose += `  input-data:\n`;
  }

  return compose;
};


// ============================================================
// Generate railway.json for Railway
// Deploys from the pre-built GHCR image — no Dockerfile needed.
// ============================================================
export const generateRailwayJson = (
  _model: DataModel,
  _source: SourceConnection
): string => {
  const config = {
    "$schema": "https://railway.com/railway.schema.json",
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "docker/railway/Dockerfile",
    },
    deploy: {
      healthcheckPath: "/conformance",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
  };

  return JSON.stringify(config, null, 2);
};
