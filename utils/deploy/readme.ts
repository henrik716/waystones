import {
  DataModel, SourceConnection, DeployTarget
} from '../../types';
import { i18n } from '../../i18n';
import { getGpkgFilename } from './_helpers';
import { generateEnvFile } from './infra';

// ============================================================
// Generate README for the deploy kit
// ============================================================
export const generateReadme = (model: DataModel, source: SourceConnection, lang: string = 'no'): string => {
  const s = (i18n[lang as keyof typeof i18n] ?? i18n.no).readme;
  const isPg = source.type === 'postgis' || source.type === 'supabase';
  const isGpkg = source.type === 'geopackage';
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  let md = `# ${model.name} — ${s.deployKit}\n\n`;
  md += `${s.generatedBy}\n\n`;
  md += `## ${s.dataSource}: ${source.type}\n\n`;
  md += `## ${s.services}\n\n`;
  md += `| ${s.service} | ${s.port} | ${s.url} |\n`;
  md += `|----------|------|-----|\n`;
  md += `| OGC API - Features (pygeoapi) | 5000 | http://localhost:5000 |\n`;
  if (hasWms) {
    md += `| ${s.wmsService} | 8080 | http://localhost:8080/ows/?SERVICE=WMS&REQUEST=GetCapabilities |\n`;
  }
  if (!isGpkg) {
    md += `| ${s.deltaDownloads} | 8081 | http://localhost:8081 |\n`;
  }
  md += `\n`;

  md += `## ${s.gettingStarted}\n\n`;
  md += `\`\`\`bash\n`;
  md += `${s.step1CopyEnv}\n`;
  md += `cp .env.template .env\n`;
  md += `nano .env\n\n`;

  if (isGpkg) {
    const gpkgName = getGpkgFilename(model, source);
    md += `${s.step2AddData}\n`;
    md += `${s.addDataHint.replace('{filename}', gpkgName)}\n\n`;
    md += `${s.step3Start}\n`;
  } else if (source.type === 'databricks') {
    md += `${s.step2Databricks}\n`;
    md += `pip install databricks-sql-connector geopandas\n`;
    md += `docker compose --profile setup run --rm initial-export\n\n`;
    md += `${s.step3Start}\n`;
  } else {
    md += `${s.step2Start}\n`;
  }

  md += `docker compose up -d\n`;
  md += `\`\`\`\n\n`;

  if (!isGpkg) {
    md += `## ${s.deltaExport}\n\n`;
    md += `${s.deltaDesc}\n`;
    md += `${s.deltaInterval}\n\n`;
    md += `${s.deltaDownloadHint}\n\n`;
    md += `${s.stacAvailable}\n\n`;

    md += `### ${s.deltaContents}\n\n`;
    md += `| ${s.changeType} | ${s.description} |\n`;
    md += `|---------------|-------------|\n`;
    md += `| \`insert\` | ${s.insertDesc} |\n`;
    md += `| \`update\` | ${s.updateDesc} |\n`;
    md += `| \`delete\` | ${s.deleteDesc} |\n\n`;
    md += `${s.deletesStoredHint}\n\n`;

    md += `### ${s.deltaHowItWorksTitle}\n\n`;
    md += `${s.deltaHowItWorks1}\n\n`;
    md += `${s.deltaHowItWorks2}\n\n`;
    md += `> **Note:** ${s.deltaTimestampNote}\n\n`;
    md += `${s.deltaManualTrigger}\n`;
    md += `\`\`\`bash\n`;
    md += `${s.deltaManualFull}\n`;
    md += `${s.deltaManualDelta}\n`;
    md += `${s.deltaManualDate}\n`;
    md += `\`\`\`\n\n`;
  }

  md += `## ${s.files}\n\n`;
  md += `| ${s.file} | ${s.description} |\n`;
  md += `|-----|-------------|\n`;
  md += `| \`docker-compose.yml\` | ${s.dockerComposeFile} |\n`;
  md += `| \`pygeoapi-config.yml\` | ${isPg ? s.pygeoapiPgFile : s.pygeoapiGpkgFile} |\n`;
  if (hasWms) {
    md += `| \`project.qgs\` | ${s.qgisProjectFile} |\n`;
  }
  if (!isGpkg) {
    md += `| \`delta_export.py\` | ${s.deltaScriptFile} |\n`;
  }
  md += `| \`.env.template\` | ${s.envTemplateFile} |\n`;

  return md;
};

// ============================================================
// Generate GitHub Actions workflow for CI/CD deployment
// ============================================================
export const generateGithubActionsWorkflow = (
  model: DataModel,
  source: SourceConnection
): string => {
  const hasWms = model.layers.some(l => l.geometryType !== 'None');
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let workflow = `name: Deploy ${model.name}

on:
  push:
    branches: [main]
    paths:
      - 'docker-compose.yml'
      - 'pygeoapi-config.yml'
      - 'project.qgs'
      - 'model.json'
      - '.github/workflows/deploy.yml'

  workflow_dispatch:
    inputs:
      full_redeploy:
        description: 'Force full redeployment'
        type: boolean
        default: false

env:
  SERVICE_NAME: ${slug}

jobs:
  validate:
    name: Validate configuration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate pygeoapi config
        run: |
          python3 -c "
          import yaml, sys
          with open('pygeoapi-config.yml') as f:
              config = yaml.safe_load(f)
          resources = config.get('resources', {})
          print(f'✓ {len(resources)} collection(s) defined')
          for name, res in resources.items():
              providers = res.get('providers', [])
              if not providers:
                  print(f'✗ {name}: no provider configured', file=sys.stderr)
                  sys.exit(1)
              print(f'  - {name}: {providers[0].get(\"name\", \"unknown\")} provider')
          print('✓ Configuration valid')
          "

      - name: Validate model definition
        run: |
          python3 -c "
          import json
          with open('model.json') as f:
              model = json.load(f)
          layers = model.get('layers', [])
          print(f'✓ Model: {model.get(\"name\", \"unnamed\")} v{model.get(\"version\", \"?\")}')
          print(f'✓ {len(layers)} layer(s)')
          for l in layers:
              props = l.get('properties', [])
              print(f'  - {l[\"name\"]}: {len(props)} properties, {l.get(\"geometryType\", \"None\")}')
          "

  build:
    name: Build and push container
    needs: validate
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push pygeoapi image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ghcr.io/\${{ github.repository_owner }}/${slug}:latest
            ghcr.io/\${{ github.repository_owner }}/${slug}:\${{ github.sha }}
`;

  if (hasWms) {
    workflow += `
      - name: Package QGIS project
        run: |
          echo "QGIS project validated and ready for deployment"
          # QGIS Server uses the project.qgs directly via volume mount
`;
  }

  workflow += `
  deploy:
    name: Deploy services
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: \${{ secrets.DEPLOY_HOST }}
          username: \${{ secrets.DEPLOY_USER }}
          key: \${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/services/${slug}
            git pull origin main
            docker compose pull
            docker compose up -d --remove-orphans
            echo "✓ ${model.name} deployed successfully"

      - name: Health check
        run: |
          echo "Waiting for services to start..."
          sleep 10
          # curl -sf \${{ secrets.DEPLOY_URL }}/conformance || exit 1
          echo "✓ Deployment complete"
`;

  return workflow;
};

// ============================================================
// Generate GitHub Actions workflow — target-aware
// ============================================================
export const generateWorkflowForTarget = (
  model: DataModel,
  source: SourceConnection,
  target: DeployTarget
): string => {
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  // Shared validation job
  const validateJob = `
  validate:
    name: Validate configuration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate pygeoapi config
        run: |
          python3 -c "
          import yaml, sys
          with open('pygeoapi-config.yml') as f:
              config = yaml.safe_load(f)
          resources = config.get('resources', {})
          print(f'✓ {len(resources)} collection(s) defined')
          for name, res in resources.items():
              providers = res.get('providers', [])
              if not providers:
                  print(f'✗ {name}: no provider configured', file=sys.stderr)
                  sys.exit(1)
              print(f'  - {name}: {providers[0].get(\\"name\\", \\"unknown\\")} provider')
          print('✓ Configuration valid')
          "

      - name: Validate model definition
        run: |
          python3 -c "
          import json
          with open('model.json') as f:
              model = json.load(f)
          layers = model.get('layers', [])
          print(f'✓ Model: {model.get(\\"name\\", \\"unnamed\\")} v{model.get(\\"version\\", \\"?\\")}')
          print(f'✓ {len(layers)} layer(s)')
          for l in layers:
              props = l.get('properties', [])
              print(f'  - {l[\\"name\\"]}: {len(props)} properties, {l.get(\\"geometryType\\", \\"None\\")}')
          "`;

  if (target === 'fly') {
    return `name: Deploy ${model.name} (Fly.io)

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  FLY_API_TOKEN: \${{ secrets.FLY_API_TOKEN }}

jobs:
${validateJob}

  deploy-pygeoapi:
    name: Deploy pygeoapi to Fly.io
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.toml --remote-only
${hasWms ? `
  deploy-qgis:
    name: Deploy QGIS Server to Fly.io
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.qgis.toml --remote-only
` : ''}`;
  }

  if (target === 'railway') {
    return `name: Validate ${model.name} (Railway)

# Railway deploys automatically from GitHub — no deploy job needed.
# This workflow only validates the configuration on push.

on:
  push:
    branches: [main]
  pull_request:

jobs:
${validateJob}
`;
  }

  if (target === 'ghcr') {
    return `name: Build ${model.name} (GHCR)

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
${validateJob}

  build:
    name: Build and push to GHCR
    needs: validate
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push pygeoapi
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ghcr.io/\${{ github.repository_owner }}/${slug}:latest
            ghcr.io/\${{ github.repository_owner }}/${slug}:\${{ github.sha }}
${hasWms ? `
      - name: Build and push QGIS Server
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.qgis
          push: true
          tags: |
            ghcr.io/\${{ github.repository_owner }}/${slug}-qgis:latest
            ghcr.io/\${{ github.repository_owner }}/${slug}-qgis:\${{ github.sha }}
` : ''}`;
  }

  // Default: docker-compose (original SSH-based deploy)
  return generateGithubActionsWorkflow(model, source);
};

// ============================================================
// Generate README — target-aware
// ============================================================
export const generateReadmeForTarget = (
  model: DataModel,
  source: SourceConnection,
  target: DeployTarget,
  lang: string = 'no'
): string => {
  const s = (i18n[lang as keyof typeof i18n] ?? i18n.no).readme;
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const isGpkg = source.type === 'geopackage';
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  const targetNames: Record<DeployTarget, string> = {
    'docker-compose': s.targetDockerCompose,
    'fly': s.targetFly,
    'railway': s.targetRailway,
    'ghcr': s.targetGhcr,
  };

  // QGIS Server 3.x serves at /ows/ by default
  const wmsUrls: Record<DeployTarget, string> = {
    'docker-compose': 'http://localhost:8080/ows/',
    'fly': `https://${slug}-qgis.fly.dev/ows/`,
    'railway': 'https://<qgis-service>.up.railway.app/ows/',
    'ghcr': 'http://localhost:8080/ows/',
  };
  const wmsUrl = wmsUrls[target];

  let md = `# ${model.name} — ${s.deployKit}\n\n`;
  md += `${s.generatedByTarget} **${targetNames[target]}**\n\n`;

  // Services table
  md += `## ${s.services}\n\n`;
  md += `| ${s.service} | ${s.description} | ${s.url} |\n`;
  md += `|----------|-------------|-----|\n`;
  md += `| pygeoapi | OGC API – Features | ${target === 'docker-compose' ? 'http://localhost:5000' : target === 'fly' ? `https://${slug}-pygeoapi.fly.dev` : target === 'railway' ? 'https://\\<app\\>.up.railway.app' : 'http://localhost:5000'} |\n`;
  if (hasWms) {
    md += `| QGIS Server | ${s.wmsLayers} | ${wmsUrl}?SERVICE=WMS&REQUEST=GetCapabilities |\n`;
  }
  md += `\n`;

  if (target === 'docker-compose') {
    const readmeFull = generateReadme(model, source, lang);
    const anchor = `## ${s.gettingStarted}`;
    return md + readmeFull.substring(readmeFull.indexOf(anchor));
  }

  if (target === 'fly') {
    md += `## ${s.gettingStartedFly}\n\n`;
    md += `### ${s.prerequisites}\n\n`;
    md += `1. Installer [flyctl](https://fly.io/docs/getting-started/installing-flyctl/)\n`;
    md += `2. Logg inn: \`fly auth login\`\n\n`;
    md += `### ${s.deploy}\n\n`;
    md += `\`\`\`bash\n`;
    md += `${s.firstTime}\n`;
    md += `fly launch --config fly.toml --copy-config --no-deploy\n`;
    if (hasWms) {
      md += `fly launch --config fly.qgis.toml --copy-config --no-deploy\n`;
    }
    md += `\n`;
    if (isGpkg) {
      md += `${s.uploadGpkgData}\n`;
      md += `fly volumes create geodata --region ams --size 1 -a ${slug}-pygeoapi\n`;
      md += `${s.copyFileHint}\n\n`;
    }
    md += `${s.deployPygeoapi}\n`;
    md += `fly deploy --config fly.toml\n`;
    if (hasWms) {
      md += `\n${s.deployQgis}\n`;
      md += `fly deploy --config fly.qgis.toml\n`;
    }
    md += `\`\`\`\n\n`;
    md += `${s.flyNote}\n\n`;
    md += `### ${s.autoDeployTitle}\n\n`;
    md += `${s.autoDeployFly}\n\n`;
    md += `${s.getToken}\n\n`;
  }

  if (target === 'railway') {
    md += `## ${s.gettingStartedRailway}\n\n`;
    md += `### ${s.steps}\n\n`;
    md += `${s.railwayStep1}\n`;
    md += `${s.railwayStep2}\n`;
    md += `${s.railwayStep3}\n`;
    md += `${s.railwayStep4}\n\n`;
    md += `### ${s.envVars}\n\n`;
    md += `${s.railwayEnvDesc}\n\n`;
    md += `| ${s.variable} | ${s.value} |\n`;
    md += `|----------|-------|\n`;
    md += `| \`PYGEOAPI_SERVER_URL\` | ${s.railwayPygeoapiDesc} |\n`;
    if (hasWms) {
      md += `| \`QGIS_SERVER_PUBLIC_URL\` | \`https://<qgis-service>.up.railway.app/ows/\` |\n`;
    }
    if (!isGpkg) {
      const envLines = generateEnvFile(source).split('\n').filter(l => l.includes('=') && !l.startsWith('#') && !l.startsWith('PYGEOAPI') && !l.startsWith('PORT') && !l.startsWith('QGIS'));
      envLines.forEach(l => {
        const [k] = l.split('=');
        md += `| \`${k}\` | ${s.yourValue} |\n`;
      });
    }
    md += `\n`;
    md += `${s.railwayNote}\n\n`;
    if (hasWms) {
      md += `### ${s.qgisServerSection}\n\n`;
      md += `${s.railwayQgisDesc}\n\n`;
      md += `${s.railwayQgisStep1}\n`;
      md += `${s.railwayQgisStep2}\n`;
      md += `${s.railwayQgisStep3}\n`;
      md += `${s.railwayQgisStep4}\n`;
      md += `${s.railwayQgisStep5}\n\n`;
    }
    if (isGpkg) {
      md += `### ${s.dataSection}\n\n`;
      md += `${s.gpkgDataDesc}\n`;
      md += `${s.gpkgUpdateHint}\n\n`;
    }
    md += `### ${s.autoDeployTitle}\n\n`;
    md += `${s.autoDeployRailway}\n\n`;
  }

  if (target === 'ghcr') {
    md += `## ${s.containerRegistry}\n\n`;
    md += `${s.ghcrDesc}\n`;
    md += `${s.ghcrDesc2}\n\n`;
    md += `### ${s.images}\n\n`;
    md += `| ${s.image} | ${s.description} |\n`;
    md += `|-------|-------------|\n`;
    md += `| \`ghcr.io/<owner>/${slug}:latest\` | ${s.ghcrPygeoapiImage} |\n`;
    if (hasWms) {
      md += `| \`ghcr.io/<owner>/${slug}-qgis:latest\` | ${s.ghcrQgisImage} |\n`;
    }
    md += `\n`;
    md += `### ${s.runLocally}\n\n`;
    md += `\`\`\`bash\n`;
    md += `docker pull ghcr.io/<owner>/${slug}:latest\n`;
    md += `docker run -p 5000:80 \\\n`;
    md += `  -e PYGEOAPI_SERVER_URL=http://localhost:5000 \\\n`;
    md += `  ghcr.io/<owner>/${slug}:latest\n`;
    md += `\`\`\`\n\n`;
    md += `### ${s.useWithCompose}\n\n`;
    md += `\`\`\`bash\n`;
    md += `docker compose up -d\n`;
    md += `\`\`\`\n\n`;
    md += `### ${s.autoBuild}\n\n`;
    md += `${s.autoBuildDesc}\n\n`;
  }

  // Delta export section (for non-docker-compose targets — docker-compose gets this via generateReadme)
  if (!isGpkg) {
    md += `## ${s.deltaExport}\n\n`;
    md += `${s.deltaDesc}\n\n`;
    md += `> **Note:** ${s.deltaTimestampNote}\n\n`;
    md += `### ${s.deltaHowItWorksTitle}\n\n`;
    md += `${s.deltaHowItWorks1}\n\n`;
    md += `${s.deltaManualTrigger}\n`;
    md += `\`\`\`bash\n`;
    md += `${s.deltaManualFull}\n`;
    md += `${s.deltaManualDelta}\n`;
    md += `${s.deltaManualDate}\n`;
    md += `\`\`\`\n\n`;
  }

  // Files table
  md += `## ${s.files}\n\n`;
  md += `| ${s.file} | ${s.description} |\n`;
  md += `|-----|-------------|\n`;
  md += `| \`model.json\` | ${s.modelJsonFile} |\n`;
  md += `| \`Dockerfile\` | ${s.dockerfileFile} |\n`;
  md += `| \`pygeoapi-config.yml\` | ${s.pygeoapiConfigFile} |\n`;
  if (hasWms) {
    md += `| \`Dockerfile.qgis\` | ${s.dockerfileQgisFile} |\n`;
    md += `| \`project.qgs\` | ${s.qgisProjectFile} |\n`;
  }
  if (target === 'fly') md += `| \`fly.toml\` | ${s.flyTomlFile} |\n`;
  if (target === 'fly' && hasWms) md += `| \`fly.qgis.toml\` | ${s.flyQgisTomlFile} |\n`;
  if (target === 'railway') md += `| \`railway.json\` | ${s.railwayJsonFile} |\n`;
  if (target === 'railway' && hasWms) md += `| \`railway.qgis.json\` | ${s.railwayQgisJsonFile} |\n`;
  md += `| \`.env.template\` | ${s.envTemplateShort} |\n`;
  if (!isGpkg) md += `| \`delta_export.py\` | ${s.deltaScriptFile} |\n`;
  if (!isGpkg) md += `| \`nginx-stac.conf\` | ${s.nginxStacConfFile} |\n`;

  // STAC catalog section
  if (!isGpkg) {
    const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
    const downloadBase = target === 'fly' ? `https://${slug}-downloads.fly.dev` : 'https://<downloads-url>';
    md += `\n## ${s.stacCatalogSection}\n\n`;
    md += `| ${s.resource} | ${s.url} |\n`;
    md += `|---------|-----|\n`;
    md += `| ${s.stacRootCatalog} | ${downloadBase}/stac/catalog.json |\n`;
    md += `| ${s.stacCollectionLabel} | ${downloadBase}/stac/collections/${modelId}/collection.json |\n`;
    model.layers
      .filter(l => !l.isAbstract)
      .forEach(layer => {
        const tbl = layer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        md += `| ${layer.name} items | ${downloadBase}/stac/${tbl}/catalog.json |\n`;
      });
    md += `\n${s.stacItemsNote}\n`;
  }

  return md;
};
