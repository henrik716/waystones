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

  env += `# --- oapif-go public URL ---\n`;
  env += `# Set to your public HTTPS URL — used in all API self-links.\n`;
  env += `# Railway: https://<your-app>.up.railway.app\n`;
  env += `# Local:   http://localhost:5000\n`;
  env += `SERVER_URL=http://localhost:5000\n\n`;

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
// Snapshot architecture:
//   1. Worker converts input (GPKG / PostGIS) → Parquet + FlatGeobuf,
//      uploading to a local MinIO instance (S3-compatible).
//   2. oapif-go reads Parquet directly from MinIO.
//   3. QGIS Server (optional) reads FlatGeobuf from a local volume populated
//      by a one-shot sync from MinIO.
//
// For production / Railway deployments replace the minio service with real
// S3/R2 credentials in .env and remove the minio / minio-init services.
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
# Architecture:
#   worker  → converts data → MinIO (local S3)
#   oapif   ← reads Parquet from MinIO
#   qgis    ← reads FlatGeobuf synced from MinIO to a local volume
#
# For cloud deployments: remove the minio / minio-init services and set
# real S3 credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET,
# S3_ENDPOINT) in .env.
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
    compose += `#   WMS (QGIS):       http://localhost:5000/ows/?SERVICE=WMS&REQUEST=GetCapabilities\n`;
  }

  compose += `\nservices:\n`;

  // --- MinIO local object storage ---
  compose += `  # --- MinIO local object storage (dev only — replace with S3/R2 in production) ---
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

  # --- MinIO bucket init (runs once, creates the bucket) ---
  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin &&
        mc mb local/waystones-data --ignore-existing
      "
    restart: "no"

`;

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
  compose += `  # --- Worker (converts input → Parquet + FlatGeobuf, uploads to MinIO) ---\n`;
  compose += `  worker:\n`;
  compose += `    image: ghcr.io/waystones-nexus/waystones-keystone:worker-latest\n`;
  if (isLocalGpkg || isS3Gpkg) {
    compose += `    volumes:\n`;
    if (isS3Gpkg) {
      compose += `      - input-data:/input:ro\n`;
    } else if (isLocalGpkg) {
      compose += `      - ./data.gpkg:/input/data.gpkg:ro\n`;
    }
  }
  compose += `    environment:\n`;
  if (isPg) {
    compose += `      INPUT_TYPE: postgis\n`;
    compose += `      INPUT_URI: postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}\n`;
  } else {
    compose += `      INPUT_TYPE: gpkg\n`;
    compose += `      INPUT_URI: /input/data.gpkg\n`;
  }
  compose += `      OUTPUT_TYPE: s3\n`;
  compose += `      OUTPUT_URI: s3://waystones-data/\n`;
  compose += `      AWS_ENDPOINT_URL: http://minio:9000\n`;
  compose += `      AWS_ACCESS_KEY_ID: minioadmin\n`;
  compose += `      AWS_SECRET_ACCESS_KEY: minioadmin\n`;
  compose += `      AWS_DEFAULT_REGION: us-east-1\n`;
  if (isPg) {
    compose += `    env_file: .env\n`;
  }
  compose += `    depends_on:\n`;
  compose += `      minio-init:\n`;
  compose += `        condition: service_completed_successfully\n`;
  if (isS3Gpkg) {
    compose += `      data-fetcher:\n`;
    compose += `        condition: service_completed_successfully\n`;
  }
  compose += `    restart: "no"\n`;

  // --- oapif-go ---
  compose += `
  # --- OGC API Features + gateway (oapif-go) ---
  # OGC API Features: http://localhost:5000
`;
  if (hasGeomLayers) {
    compose += `  # WMS (QGIS):       http://localhost:5000/ows/?SERVICE=WMS&REQUEST=GetCapabilities\n`;
  }
  compose += `  oapif:
    image: ghcr.io/waystones-nexus/oapif-go:latest
    ports:
      - "5000:5000"
    volumes:
      - ./oapif-go-config.json:/config.json:ro
    environment:
      SERVER_URL: \${SERVER_URL:-http://localhost:5000}
      S3_BUCKET: waystones-data
      S3_ENDPOINT: http://minio:9000
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
      AWS_DEFAULT_REGION: us-east-1
      IS_PRIVATE: "0"
`;
  if (hasGeomLayers) {
    compose += `      DEPLOY_QGIS: "1"\n`;
    compose += `      QGIS_UPSTREAM_TARGET: qgis-server:80\n`;
  }
  compose += `    env_file: .env
    depends_on:
      worker:
        condition: service_completed_successfully
    restart: unless-stopped
`;

  // --- QGIS server (optional) ---
  if (hasGeomLayers) {
    compose += `
  # --- FlatGeobuf sync (downloads .fgb from MinIO to local volume for QGIS) ---
  qgis-data-sync:
    image: amazon/aws-cli
    volumes:
      - qgis_data:/data
    environment:
      AWS_ENDPOINT_URL: http://minio:9000
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
      AWS_DEFAULT_REGION: us-east-1
    command: s3 sync s3://waystones-data/ /data/ --exclude "*.parquet" --exclude "*.json"
    depends_on:
      worker:
        condition: service_completed_successfully
    restart: "no"

  # --- WMS (QGIS Server — internal only) ---
  # Accessed via the oapif gateway at http://localhost:5000/ows/
  qgis-server:
    image: ghcr.io/waystones-nexus/waystones-keystone:qgis-latest
    volumes:
      - ./project.qgs:/data/project.qgs:ro
      - qgis_data:/data:ro
    environment:
      QGIS_SERVER_SERVICE_URL: \${QGIS_SERVER_PUBLIC_URL:-}
    env_file: .env
    depends_on:
      qgis-data-sync:
        condition: service_completed_successfully
    restart: unless-stopped
`;
  }

  // --- volumes ---
  compose += `\nvolumes:\n`;
  compose += `  minio_data:\n`;
  if (hasGeomLayers) {
    compose += `  qgis_data:\n`;
  }
  if (isS3Gpkg) {
    compose += `  input-data:\n`;
  }

  return compose;
};


// ============================================================
// Generate railway.json for Railway
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
      healthcheckPath: "/collections",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
  };

  return JSON.stringify(config, null, 2);
};
