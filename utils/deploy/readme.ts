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
  const targetLabel = target === 'railway' ? 'Railway' : target === 'codespaces' ? 'GitHub Codespaces' : 'Docker Compose';
  
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
  const { model, source, s, isGpkg, hasWms, target } = ctx;

  const layerNames = model.layers
    .filter(l => l.geometryType !== 'None')
    .map(l => l.name.toLowerCase().replace(/\s+/g, '_'));

  let md = `## 🏗 ${s.snapshotArchTitle}\n\n`;
  md += `${s.snapshotArchDesc}\n\n`;

  md += '```text\n';
  md += `[ 1. CONVERSION ]\n`;
  md += `Snapshot Worker ──┬──> [ Snapshot ] ──> GeoParquet & FlatGeobuf\n`;
  md += `(DuckDB/GDAL)     ├──> [ Tiles    ] ──> PMTiles (Vector Tiles)\n`;
  md += `                  └──> [ STAC     ] ──> STAC Catalog (Metadata)\n\n`;

  const usesMinio = target === 'docker-compose' || target === 'codespaces';

  if (usesMinio) {
    md += `[ 2. STORAGE ]\n`;
    md += `GeoParquet ──────────> MinIO (local S3) ──> oapif-go reads Parquet\n`;
    if (hasWms) {
      md += `FlatGeobuf ──────────> local volume    ──> QGIS Server reads .fgb\n`;
    }
    md += `\n`;
  }

  md += `[ ${usesMinio ? '3' : '2'}. SERVING ]\n`;
  if (layerNames.length > 0) {
    const firstLayer = layerNames[0];
    md += `oapif-go (DuckDB) ───> [ GeoParquet ] ───> OGC API Features (${firstLayer})\n`;
    if (hasWms) {
      md += `QGIS Server       ───> [ FlatGeobuf ] ───> WMS at /ows/ (${firstLayer})\n`;
    }
    md += `Static Tiles      ───> [ .pmtiles   ] ───> Vector Tiles (${firstLayer})\n`;
  } else {
    md += `oapif-go (DuckDB) ───> [ GeoParquet ] ───> OGC API Features\n`;
    if (hasWms) {
      md += `QGIS Server       ───> [ FlatGeobuf ] ───> WMS at /ows/\n`;
    }
    md += `Static Tiles      ───> [ .pmtiles   ] ───> Vector Tiles\n`;
  }
  md += '```\n\n';

  md += `### 🚀 ${s.workingUnits}\n\n`;
  md += `| Component | Role | Description |\n`;
  md += `|---|---|---|\n`;
  md += `| **${s.workerService}** | \`worker\` | ${s.workerDesc} |\n`;
  if (usesMinio) {
    md += `| **Object storage** | \`minio\` | Local S3-compatible storage for Parquet files (replace with R2/S3 in production) |\n`;
  }
  md += `| **${s.apiService}** | \`oapif\` | ${s.apiDesc} |\n`;
  if (hasWms) {
    md += `| **${s.wmsService}** | \`qgis-server\` | ${s.wmsDesc} |\n`;
  }
  if (target === 'codespaces') {
    md += `| **PMTiles Viewer** | \`viewer\` | Renders the generated vector tiles on a live MapLibre map — Codespaces demo only |\n`;
    md += `| **STAC Catalog** | \`worker-stac\` | Generates a browsable STAC catalog — optional, run (or skip) it and choose partitioning at run time in \`demo.ipynb\` |\n`;
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
  // Vector tiles and STAC are only listed here for the Codespaces target, which is the
  // only one that actually wires the pipeline and a viewer to browse the result — for
  // other targets they're a manual, opt-in step (see "Optional: PMTiles & STAC Catalog"
  // below), not something `docker compose up -d` produces by itself.
  if (target === 'codespaces') {
    md += `| **${s.vectorTileService}** | ${s.vectorTileDesc} |\n`;
    md += `| **Live Map Viewer** | Browse the vector tiles on a map at http://localhost:8081 |\n`;
    md += `| **${s.stacService}** | ${s.stacDesc} (optional — run it from \`demo.ipynb\`) |\n`;
  }
  md += '\n';
  return md;
};

// ============================================================
// Section: Manual PMTiles / STAC (docker-compose only — these
// pipelines aren't wired into `docker compose up -d` there)
// ============================================================
const renderManualExtras = (ctx: RenderContext): string => {
  const { s, target } = ctx;
  if (target !== 'docker-compose') return '';

  let md = `## 🧩 ${s.manualExtrasTitle}\n\n`;
  md += `${s.manualExtrasDesc}\n\n`;
  md += '```bash\n';
  md += `# ${s.manualExtrasTilesComment}\n`;
  md += `docker compose run --rm -e TASK_TYPE=tiles -e OUTPUT_URI=s3://waystones-data/tiles/ worker\n\n`;
  md += `# ${s.manualExtrasStacComment}\n`;
  md += `docker compose run --rm -e TASK_TYPE=stac -e OUTPUT_URI=s3://waystones-data/stac/ worker\n\n`;
  md += `# ${s.manualExtrasPartitionComment}\n`;
  md += `docker compose run --rm -e TASK_TYPE=stac -e OUTPUT_URI=s3://waystones-data/stac/ \\\n`;
  md += `  -e STRATEGY=custom_column -e COLUMN=your_column_name worker\n\n`;
  md += `# ${s.manualExtrasModelComment}\n`;
  md += `docker compose run --rm -e TASK_TYPE=stac -e OUTPUT_URI=s3://waystones-data/stac/ \\\n`;
  md += `  -e MODEL_B64="$(base64 -w0 model.json)" worker\n`;
  md += '```\n\n';
  md += `${s.manualExtrasBrowseHint}\n\n`;

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
  md += `| \`SERVER_URL\` | ${s.envDesc_PYGEOAPI_SERVER_URL} | \`https://api.example.com\` |\n`;
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
  const { model, source, s, target, isGpkg, useS3, isPg } = ctx;
  
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

  if (target === 'codespaces') {
    let md = `## ${s.gettingStartedCodespaces}\n\n`;
    md += `1. **${s.codespacesStep1}**\n`;
    if (isGpkg && !useS3) {
      const gpkgName = getGpkgFilename(model, source);
      md += `2. **${s.codespacesStep2}** ${s.addDataHint.replace('{filename}', gpkgName)}\n`;
    } else if (isPg) {
      // .env is gitignored, so it never lands in the pushed repo/Codespace — the user
      // must create it and fill in real DB credentials before the pipeline can connect.
      md += `2. **${s.codespacesStep2Pg}**\n`;
    } else {
      // Remote GeoPackage (S3/R2) — same .env problem as PostGIS: real credentials are
      // required before the worker's data-fetcher step can download the source file.
      md += `2. **${s.codespacesStep2S3}**\n`;
    }
    md += `3. **${s.codespacesStep3}**\n`;
    md += `\n${s.codespacesNote}\n`;
    if (isPg) {
      md += `\n${s.codespacesNotePg}\n`;
    }
    md += '\n';
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
  if (target === 'docker-compose' || target === 'codespaces') {
    md += `| \`docker-compose.yml\` | ${s.dockerComposeFile} |\n`;
  } else {
    md += `| \`railway.json\` | ${s.railwayJsonFile} |\n`;
    if (hasWms) md += `| \`railway.qgis.json\` | ${s.railwayQgisJsonFile} |\n`;
  }
  if (target === 'codespaces') {
    md += `| \`.devcontainer/devcontainer.json\` | Codespace setup (Docker-in-Docker, forwarded ports) |\n`;
    md += `| \`demo.ipynb\` | Click-through notebook that runs the whole pipeline |\n`;
    md += `| \`viewer/index.html\` | Live PMTiles map viewer served on port 8081 |\n`;
  }
  md += `| \`oapif-go-config.json\` | oapif-go collection config (auto-generated) |\n`;
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
    useS3: hasS3Config(source),
  };

  let md = '';
  md += renderHeader(ctx);
  md += renderArchitecture(ctx);
  md += renderServices(ctx);
  md += renderDataSourceConfig(ctx);
  md += renderRailwayPersistence(ctx);
  md += renderEnvironmentVariables(ctx);
  md += renderGettingStarted(ctx);
  md += renderManualExtras(ctx);
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
  workflow += 'on:\n  push:\n    branches: [main]\n    paths:\n      - \'docker-compose.yml\'\n      - \'oapif-go-config.json\'\n      - \'project.qgs\'\n      - \'model.json\'\n      - \'.github/workflows/deploy.yml\'\n\n';
  workflow += 'env:\n  SERVICE_NAME: ' + slug + '\n\n';
  workflow += 'jobs:\n  validate:\n    name: Validate configuration\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n';
  workflow += '      - name: Validate oapif-go config\n        run: |\n          python3 -c "\n          import json, sys\n          with open(\'oapif-go-config.json\') as f:\n              config = json.load(f)\n          if not config.get(\'collections\'):\n              sys.exit(1)\n          "\n';
  workflow += '  deploy:\n    name: Deploy services\n    needs: validate\n    runs-on: ubuntu-latest\n    environment: production\n    steps:\n      - uses: actions/checkout@v4\n      - name: Deploy via SSH\n        uses: appleboy/ssh-action@v1\n        with:\n          host: ${{ secrets.DEPLOY_HOST }}\n          username: ${{ secrets.DEPLOY_USER }}\n          key: ${{ secrets.DEPLOY_SSH_KEY }}\n          script: |\n            cd /opt/services/' + slug + '\n            git pull origin main\n            docker compose pull\n            docker compose up -d --remove-orphans\n';

  return workflow;
};

export const generateWorkflowForTarget = (
  model: DataModel,
  source: SourceConnection,
  target: DeployTarget
): string => {
  if (target === 'codespaces') {
    // A Codespaces kit is an ephemeral eval/demo environment, not something with a
    // production host to SSH-deploy to — just validate the generated config on push.
    let workflow = 'name: Validate ' + model.name + '\non:\n  push:\n    branches: [main]\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n';
    workflow += '      - name: Validate oapif-go config\n        run: |\n          python3 -c "\n          import json, sys\n          with open(\'oapif-go-config.json\') as f:\n              config = json.load(f)\n          if not config.get(\'collections\'):\n              print(\'ERROR: oapif-go-config.json must have a collections key\')\n              sys.exit(1)\n          "\n';
    workflow += '      - name: Validate devcontainer.json exists\n        run: test -f .devcontainer/devcontainer.json || (echo "ERROR: .devcontainer/devcontainer.json not found" && exit 1)\n';
    return workflow;
  }
  if (target === 'railway') {
    const hasWms = model.layers.some(l => l.geometryType !== 'None');
    let workflow = 'name: Validate ' + model.name + '\non:\n  push:\n    branches: [main]\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n';
    workflow += '      - name: Validate railway.json\n        run: |\n          python3 -c "\n          import json\n          with open(\'railway.json\') as f:\n              config = json.load(f)\n          assert config.get(\'build\', {}).get(\'builder\'), \'railway.json missing build.builder\'\n          "\n';
    workflow += '      - name: Validate oapif-go config\n        run: |\n          python3 -c "\n          import json, sys\n          with open(\'oapif-go-config.json\') as f:\n              config = json.load(f)\n          if not config.get(\'collections\'):\n              print(\'ERROR: oapif-go-config.json must have a collections key\')\n              sys.exit(1)\n          "\n';
    if (hasWms) {
      workflow += '      - name: Validate QGIS project exists\n        run: test -f project.qgs || (echo "ERROR: project.qgs not found for WMS layers" && exit 1)\n';
    }
    return workflow;
  }
  return generateGithubActionsWorkflow(model, source);
};
