import {
  DataModel, SourceConnection, DeployTarget
} from '../../types';
import {
  generatePygeoapiConfig
} from './pygeoapi';
import {
  generateQgisProject, generateQgisDockerfile,
  generateFlyQgisToml, generateRailwayQgisJson
} from './qgis';
import { generateDeltaScript } from './delta';
import { generateEnvFile, generateDockerCompose, generateDockerfile, generateFlyToml, generateRailwayJson } from './infra';
import { generateReadme, generateGithubActionsWorkflow, generateReadmeForTarget, generateWorkflowForTarget } from './readme';
import { generatePygeoapiTheme, generateCollectionsHtml, generateItemsHtml, generateItemHtml, generateCollectionHtml, generateIndexHtml } from './pygeoapi-theme';
import {
  generateStacCatalog, generateStacCollection, generateStacLayerCatalog,
  generateStacItemSnippet, generateNginxStacConf,
} from '../stacUtils';


// ============================================================
// Generate deploy file map — target-aware
// Returns a flat Record<filename, content> for pushing to GitHub
// ============================================================
export const generateDeployFiles = async (
  model: DataModel,
  source: SourceConnection,
  lang: string = 'no',
  target: DeployTarget = 'docker-compose'
): Promise<Record<string, string>> => {
  const isGpkg = source.type === 'geopackage';
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  // Shared files — always included
  const files: Record<string, string> = {
    'model.json': JSON.stringify(model, null, 2),
    'Dockerfile': generateDockerfile(model, source),
    'pygeoapi-config.yml': await generatePygeoapiConfig(model, source, lang),
    'templates/landing_page.html': generateIndexHtml(model),
    'templates/_base.html': generatePygeoapiTheme(model),
    'templates/collections/index.html': generateCollectionsHtml(model),
    'templates/collections/items/index.html': generateItemsHtml(model),
    'templates/collections/items/item.html': generateItemHtml(model),
    'templates/collections/collection.html': generateCollectionHtml(model),
    '.env.template': generateEnvFile(source),
    '.gitignore': '.env\ndata/\n*.gpkg\n__pycache__/\n',
    'README.md': generateReadmeForTarget(model, source, target, lang),
    '.github/workflows/deploy.yml': generateWorkflowForTarget(model, source, target),
  };

  // QGIS project + Dockerfile.qgis
  if (hasWms) {
    files['project.qgs'] = generateQgisProject(model, source);
    if (target !== 'docker-compose') {
      files['Dockerfile.qgis'] = generateQgisDockerfile(model, source);
    }
  }

  // Delta script + STAC helpers for database sources
  if (!isGpkg) {
    const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
    files['delta_export.py'] = generateDeltaScript(model, source) + '\n\n' + generateStacItemSnippet(model, source);

    // STAC static catalog structure
    files['data/output/stac/catalog.json'] = generateStacCatalog(model);
    files[`data/output/stac/collections/${modelId}/collection.json`] = generateStacCollection(model, source);
    model.layers
      .filter(l => !l.isAbstract)
      .forEach(layer => {
        const tbl = layer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        files[`data/output/stac/${tbl}/catalog.json`] = generateStacLayerCatalog(layer, model);
      });

    // Nginx config with correct MIME types
    files['nginx-stac.conf'] = generateNginxStacConf();
  }

  // Target-specific files
  if (target === 'docker-compose') {
    files['docker-compose.yml'] = generateDockerCompose(model, source);
    if (hasWms) {
      files['project.qgs'] = generateQgisProject(model, source);
    }
  }

  if (target === 'fly') {
    files['fly.toml'] = generateFlyToml(model, source);
    if (hasWms) {
      files['fly.qgis.toml'] = generateFlyQgisToml(model, source);
    }
  }

  if (target === 'railway') {
    files['railway.json'] = generateRailwayJson(model, source);
    // Separate railway.json for the QGIS Server service (deployed as a second
    // Railway service from the same repo with a different Dockerfile path).
    if (hasWms) {
      files['railway.qgis.json'] = generateRailwayQgisJson(model, source);
    }
  }

  if (target === 'ghcr') {
    // GHCR also includes docker-compose for local dev / pull-and-run
    files['docker-compose.yml'] = generateDockerCompose(model, source);
  }

  return files;
};

// ============================================================
// Legacy: generate deploy kit as downloadable zip (kept as fallback)
// ============================================================
export const exportDeployKit = async (
  model: DataModel,
  source: SourceConnection,
  lang: string = 'no',
  target: DeployTarget = 'docker-compose',
  binaryFiles?: Record<string, Blob>
) => {
  const files = await generateDeployFiles(model, source, lang, target);

  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const folderName = `${model.name.replace(/\s/g, '_')}_deploy`;

    Object.entries(files).forEach(([name, content]) => {
      zip.file(`${folderName}/${name}`, content);
    });

    // Legg til binærfiler (f.eks. GeoPackage) i data/-mappen
    if (binaryFiles) {
      for (const [name, blob] of Object.entries(binaryFiles)) {
        zip.file(`${folderName}/${name}`, blob);
      }
    }

    zip.folder(`${folderName}/data/output`);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    Object.entries(files).forEach(([name, content]) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
};

