import {
  DataModel, SourceConnection, DeployTarget
} from '../../types';
import { i18n } from '../../i18n';
import { getGpkgFilename, hasS3Config } from './_helpers';

interface RenderContext {
  model: DataModel;
  source: SourceConnection;
  target: DeployTarget;
  s: any; // Localized readme strings
  isPg: boolean;
  isGpkg: boolean;
  hasWms: boolean;
  useS3: boolean;
}

// ============================================================
// Section: Header (Centered)
// ============================================================
const renderHeader = (ctx: RenderContext): string => {
  const { model, target, s } = ctx;
  const targetLabel = target === 'railway' ? 'Railway' : 'Docker Compose';
  
  let md = `<div align="center">\n`;
  md += `<h1>${model.name}</h1>\n\n`;
  md += `**${s.deployKit} — ${targetLabel}**\n\n`;
  md += `[![Waystones](https://img.shields.io/badge/Powered%20by-Waystones-blueviolet)](https://github.com/waystones-nexus/waystones)\n`;
  md += `[![OGC](https://img.shields.io/badge/Standards-OGC%20API-blue)](https://ogcapi.ogc.org)\n`;
  md += `[![Docker](https://img.shields.io/badge/Container-Docker-2496ed?logo=docker)](https://www.docker.com)\n`;
  md += `</div>\n\n---\n\n`;
  md += `${s.generatedByTarget} **${target}**\n\n`;
  return md;
};

// ============================================================
// Section: Architecture (Text Diagram)
// ============================================================
const renderArchitecture = (ctx: RenderContext): string => {
  const { model, source, s, isGpkg, hasWms } = ctx;
  
  const layerNames = model.layers
    .filter(l => l.geometryType !== 'None')
    .map(l => l.name.toLowerCase().replace(/\s+/g, '_'));
  
  const sourceName = isGpkg ? getGpkgFilename(model, source) : (source.type === 'supabase' ? 'Supabase' : 'PostGIS');
  
  let md = `## 🏗 ${s.snapshotArchTitle}\n\n`;
  md += `${s.snapshotArchDesc}\n\n`;
  
  md += '```text\n';
  md += `[ 1. CONVERSION ]\n`;
  md += `Snapshot Worker ──┬──> [ Snapshot ] ──> GeoParquet & FlatGeobuf (Storage)\n`;
  md += `(DuckDB/GDAL)     ├──> [ Tiles    ] ──> PMTiles (Vector Tiles)\n`;
  md += `                  └──> [ STAC     ] ──> STAC Catalog (Metadata)\n\n`;
  
  md += `[ 2. STARTUP (boot.sh) ]\n`;
  md += `Container Start ──┬──> [ Fast Path ] ─> Download pre-baked OpenAPI cache\n`;
  md += `                  ├──> [ Slow Path ] ─> Serve placeholder + Background generation\n`;
  md += `                  ├──> [ Gunicorn  ] ─> EXECs pygeoapi (Internal Port 5001)\n`;
  md += `                  └──> [ Warmup    ] ─> Background DuckDB/Parquet pre-warming (5s delay)\n\n`;
  
  md += `[ 3. SERVING ]\n`;
  if (layerNames.length > 0) {
    const firstLayer = layerNames[0];
    md += `pygeoapi (DuckDB) ───> [ GeoParquet ] ───> OGC API Features (${firstLayer})\n`;
    if (hasWms) {
      md += `QGIS Server       ───> [ FlatGeobuf ] ───> WMS (${firstLayer})\n`;
    }
    md += `Static Tiles      ───> [ .pmtiles   ] ───> Vector Tiles (${firstLayer})\n`;
  } else {
    md += `pygeoapi (DuckDB) ───> [ GeoParquet ] ───> OGC API Features\n`;
    if (hasWms) {
      md += `QGIS Server       ───> [ FlatGeobuf ] ───> WMS\n`;
    }
    md += `Static Tiles      ───> [ .pmtiles   ] ───> Vector Tiles\n`;
  }
  md += '```\n\n';

  md += `### 🚀 ${s.workingUnits}\n\n`;
  md += `| Component | Role | Description |\n`;
  md += `|---|---|---|\n`;
  md += `| **${s.workerService}** | \`worker\` | ${s.workerDesc} |\n`;
  md += `| **${s.apiService}** | \`pygeoapi\` | ${s.apiDesc} |\n`;
  if (hasWms) {
    md += `| **${s.wmsService}** | \`qgis-server\` | ${s.wmsDesc} |\n`;
  }
  if (!isGpkg) {
    md += `| **${s.deltaService}** | \`delta-worker\` | ${s.deltaWorkerDesc} |\n`;
  }
  md += '\n---\n\n';
  
  return md;
};

// ============================================================
// Section: ServicesTable
// ============================================================
const renderServices = (ctx: RenderContext): string => {
  const { s, target, hasWms } = ctx;
  
  let md = `## ${s.services}\n\n`;
  md += `Once deployed, the following services will be available:\n\n`;
  md += `| ${s.service} | ${s.description} |\n`;
  md += `|---|---|\n`;
  md += `| **OGC API Features** | JSON/HTML data access |\n`;
  if (hasWms) {
    md += `| **WMS Service** | Styled map layers |\n`;
  }
  md += `| **${s.vectorTileService}** | ${s.vectorTileDesc} |\n`;
  md += `| **${s.stacService}** | ${s.stacDesc} |\n`;
  md += '\n';
  return md;
};

// ============================================================
// Section: Data Source Configuration
// ============================================================
const renderDataSourceConfig = (ctx: RenderContext): string => {
  const { s, target, useS3, isPg } = ctx;
  
  let md = `## ${s.dataSourceConfigTitle}\n\n`;
  md += `${s.dataSourceConfigDesc}\n\n`;
  
  // Scenario A: Local
  md += `### ${s.dataSourceScenarioLocal}\n`;
  md += `${s.dataSourceScenarioLocalDesc}\n\n`;
  md += `| Variable | Value | Description |\n`;
  md += `|---|---|---|\n`;
  md += `| \`INPUT_TYPE\` | \`gpkg\` | Defines source as GeoPackage |\n`;
  md += `| \`INPUT_URI\` | \`/input/data.gpkg\` | Path inside the container |\n\n`;
  
  // Scenario B: S3
  md += `### ${s.dataSourceScenarioS3}\n`;
  md += `${s.dataSourceScenarioS3Desc}\n\n`;
  md += `| Variable | Example Value | Description |\n`;
  md += `|---|---|---|\n`;
  md += `| \`INPUT_TYPE\` | \`gpkg\` | Defines source as GeoPackage |\n`;
  md += `| \`INPUT_URI\` | \`s3://my-bucket/data.gpkg\` | External S3/R2 storage URI |\n`;
  md += `| \`AWS_ACCESS_KEY_ID\` | \`AKIA...\` | Your S3 access key |\n`;
  md += `| \`AWS_SECRET_ACCESS_KEY\` | \`wJal...\` | Your S3 secret key |\n`;
  md += `| \`S3_BUCKET_NAME\` | \`my-bucket\` | Name of the bucket |\n`;
  md += `| \`AWS_ENDPOINT_URL\` | \`https://<id>.r2.cloudflarestorage.com\` | Custom endpoint (Required for R2/Tigris/MinIO) |\n\n`;
  md += `> [!TIP]\n`;
  md += `> Standard AWS S3 does not require \`AWS_ENDPOINT_URL\`. For other providers like Cloudflare R2, Tigris, or MinIO, you must specify the full endpoint URL.\n\n`;

  // Scenario C: PostGIS
  md += `### ${s.dataSourceScenarioPg}\n`;
  md += `${s.dataSourceScenarioPgDesc}\n\n`;
  md += `| Variable | Example Value | Description |\n`;
  md += `|---|---|---|\n`;
  md += `| \`INPUT_TYPE\` | \`postgis\` | Defines source as PostGIS |\n`;
  md += `| \`INPUT_URI\` | \`postgresql://u:p@h:5432/d\` | Full connection string |\n\n`;

  return md;
};

// ============================================================
// Section: Railway Persistence
// ============================================================
const renderRailwayPersistence = (ctx: RenderContext): string => {
  const { s, target } = ctx;
  if (target !== 'railway') return '';
  
  let md = `## ${s.railwayPersistenceTitle}\n\n`;
  md += `${s.railwayPersistenceDesc}\n\n`;
  md += `${s.railwayVolumeStep1}\n`;
  md += `${s.railwayVolumeStep2}\n`;
  md += `${s.railwayVolumeStep3}\n\n`;
  
  return md;
};

// ============================================================
// Section: Environment Variables
// ============================================================
const renderEnvironmentVariables = (ctx: RenderContext): string => {
  const { s, isPg, useS3 } = ctx;
  
  let md = `## ${s.envVars}\n\n`;
  md += `These variables must be configured in your \`.env\` file (local) or service dashboard (cloud).\n\n`;
  
  md += `### 🌐 Server Configuration\n\n`;
  md += `| Variable | Description | Example |\n`;
  md += `|---|---|---|\n`;
  md += `| \`PYGEOAPI_SERVER_URL\` | ${s.envDesc_PYGEOAPI_SERVER_URL} | \`https://api.example.com\` |\n`;
  md += `| \`QGIS_SERVER_PUBLIC_URL\` | ${s.envDesc_QGIS_SERVER_PUBLIC_URL} | \`https://api.example.com/ows/\` |\n`;
  md += `| \`PORT\` | ${s.envDesc_PORT} | \`5000\` |\n\n`;

  if (isPg) {
    md += `### 🗄️ Database Connection (Source)\n\n`;
    md += `${s.envDesc_POSTGRES}\n\n`;
    md += `| Variable | Default | Description |\n`;
    md += `|---|---|---|\n`;
    md += `| \`POSTGRES_HOST\` | - | Database host address |\n`;
    md += `| \`POSTGRES_PORT\` | \`5432\` | Port number |\n`;
    md += `| \`POSTGRES_DB\` | - | Database name |\n`;
    md += `| \`POSTGRES_USER\` | - | Username |\n`;
    md += `| \`POSTGRES_PASSWORD\` | - | Password (keep secure) |\n\n`;
  }

  if (useS3) {
    md += `### 📦 S3 / Cloud Storage\n\n`;
    md += `${s.envDesc_S3}\n\n`;
    md += `| Variable | Description |\n`;
    md += `|---|---|\n`;
    md += `| \`AWS_ACCESS_KEY_ID\` | Access key for your bucket |\n`;
    md += `| \`AWS_SECRET_ACCESS_KEY\` | Secret key (keep secure) |\n`;
    md += `| \`S3_BUCKET_NAME\` | Name of the bucket |\n`;
    md += `| \`AWS_ENDPOINT_URL\` | Custom endpoint (e.g. for R2/Tigris) |\n`;
    md += `| \`S3_OBJECT_KEY\` | Path to the file in the bucket |\n\n`;
  }
  
  return md;
};

// ============================================================
// Section: Getting Started
// ============================================================
const renderGettingStarted = (ctx: RenderContext): string => {
  const { model, source, s, target, isGpkg, useS3 } = ctx;
  
  if (target === 'railway') {
    let md = `## ${s.gettingStartedRailway}\n\n`;
    md += `1. **${s.railwayStep1}**\n`;
    md += `2. **${s.railwayStep2}**\n`;
    md += `3. **${s.railwayStep3}**\n`;
    if (ctx.hasWms) {
      md += `4. **${s.railwayStep4}**\n`;
    }
    md += `\n${s.railwayNote}\n\n`;
    return md;
  }

  // Docker Compose
  let md = `## ${s.gettingStarted}\n\n`;
  md += '```bash\n';
  md += `${s.step1CopyEnv}\n`;
  md += `cp .env.template .env\n`;
  md += `nano .env\n\n`;

  if (isGpkg) {
    const gpkgName = getGpkgFilename(model, source);
    if (useS3) {
      md += `${s.step2UploadToS3}\n`;
      md += `aws s3 cp ./${gpkgName} s3://\${S3_BUCKET_NAME}/\${S3_OBJECT_KEY}\n\n`;
      md += `${s.step4Start}\n`;
    } else {
      md += `${s.step2AddData}\n`;
      md += `${s.addDataHint.replace('{filename}', gpkgName)}\n\n`;
      md += `${s.step3Start}\n`;
    }
  } else {
    md += `${s.step2Start}\n`;
  }

  md += `docker compose up -d\n`;
  md += '```\n\n';
  return md;
};

// ============================================================
// Section: Files
// ============================================================
const renderFiles = (ctx: RenderContext): string => {
  const { s, isPg, hasWms, isGpkg, target } = ctx;
  
  let md = `## ${s.files}\n\n`;
  md += `| ${s.file} | ${s.description} |\n`;
  md += `|---|---|\n`;
  if (target === 'docker-compose') {
    md += `| \`docker-compose.yml\` | ${s.dockerComposeFile} |\n`;
  } else {
    md += `| \`railway.json\` | ${s.railwayJsonFile} |\n`;
    if (hasWms) md += `| \`railway.qgis.json\` | ${s.railwayQgisJsonFile} |\n`;
  }
  md += `| \`pygeoapi-config.yml\` | ${isPg ? s.pygeoapiPgFile : s.pygeoapiGpkgFile} |\n`;
  if (hasWms) md += `| \`project.qgs\` | ${s.qgisProjectFile} |\n`;
  if (!isGpkg) md += `| \`delta_export.py\` | ${s.deltaScriptFile} |\n`;
  md += `| \`.env.template\` | ${s.envTemplateFile} |\n`;
  md += `| \`model.json\` | ${s.modelJsonFile} |\n`;
  
  return md;
};

// ============================================================
// Main Entry Points
// ============================================================

export const generateReadmeForTarget = (
  model: DataModel,
  source: SourceConnection,
  target: DeployTarget,
  lang: string = 'en'
): string => {
  const s = (i18n[lang as keyof typeof i18n] ?? i18n.no).readme;
  const ctx: RenderContext = {
    model,
    source,
    target,
    s,
    isPg: source.type === 'postgis' || source.type === 'supabase',
    isGpkg: source.type === 'geopackage',
    hasWms: model.layers.some(l => l.geometryType !== 'None'),
    useS3: hasS3Config(source)
  };

  let md = '';
  md += renderHeader(ctx);
  md += renderArchitecture(ctx);
  md += renderServices(ctx);
  md += renderDataSourceConfig(ctx);
  md += renderRailwayPersistence(ctx);
  md += renderEnvironmentVariables(ctx);
  md += renderGettingStarted(ctx);
  md += renderFiles(ctx);

  return md;
};

// Legacy fallback
export const generateReadme = (model: DataModel, source: SourceConnection, lang: string = 'en'): string => {
  return generateReadmeForTarget(model, source, 'docker-compose', lang);
};

// Workflow generators (keeping them as is for now)
export const generateGithubActionsWorkflow = (
  model: DataModel,
  _source: SourceConnection
): string => {
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let workflow = 'name: Deploy ' + model.name + '\n\n';
  workflow += 'on:\n  push:\n    branches: [main]\n    paths:\n      - \'docker-compose.yml\'\n      - \'pygeoapi-config.yml\'\n      - \'project.qgs\'\n      - \'model.json\'\n      - \'.github/workflows/deploy.yml\'\n\n';
  workflow += 'env:\n  SERVICE_NAME: ' + slug + '\n\n';
  workflow += 'jobs:\n  validate:\n    name: Validate configuration\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n';
  workflow += '      - name: Validate pygeoapi config\n        run: |\n          python3 -c "\n          import yaml, sys\n          with open(\'pygeoapi-config.yml\') as f:\n              config = yaml.safe_load(f)\n          if not config.get(\'resources\'):\n              sys.exit(1)\n          "\n';
  workflow += '  deploy:\n    name: Deploy services\n    needs: validate\n    runs-on: ubuntu-latest\n    environment: production\n    steps:\n      - uses: actions/checkout@v4\n      - name: Deploy via SSH\n        uses: appleboy/ssh-action@v1\n        with:\n          host: ${{ secrets.DEPLOY_HOST }}\n          username: ${{ secrets.DEPLOY_USER }}\n          key: ${{ secrets.DEPLOY_SSH_KEY }}\n          script: |\n            cd /opt/services/' + slug + '\n            git pull origin main\n            docker compose pull\n            docker compose up -d --remove-orphans\n';

  return workflow;
};

export const generateWorkflowForTarget = (
  model: DataModel,
  source: SourceConnection,
  target: DeployTarget
): string => {
  if (target === 'railway') {
    const hasWms = model.layers.some(l => l.geometryType !== 'None');
    let workflow = 'name: Validate ' + model.name + '\non:\n  push:\n    branches: [main]\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n';
    workflow += '      - name: Validate railway.json\n        run: |\n          python3 -c "\n          import json\n          with open(\'railway.json\') as f:\n              config = json.load(f)\n          assert config.get(\'build\', {}).get(\'builder\'), \'railway.json missing build.builder\'\n          "\n';
    workflow += '      - name: Validate pygeoapi config\n        run: |\n          python3 -c "\n          import yaml, sys\n          with open(\'pygeoapi-config.yml\') as f:\n              config = yaml.safe_load(f)\n          if not config.get(\'resources\'):\n              print(\'ERROR: pygeoapi-config.yml must have resources key\')\n              sys.exit(1)\n          "\n';
    if (hasWms) {
      workflow += '      - name: Validate QGIS project exists\n        run: test -f project.qgs || (echo "ERROR: project.qgs not found for WMS layers" && exit 1)\n';
    }
    return workflow;
  }
  return generateGithubActionsWorkflow(model, source);
};
