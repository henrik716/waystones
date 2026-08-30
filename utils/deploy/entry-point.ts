import {
  DataModel, SourceConnection, DeployTarget
} from '../../types';
import { generateOapifGoConfig } from './oapifgo';
import { generateQgisProject, generateRailwayQgisJson } from './qgis';
import { generateEnvFile, generateDockerCompose, generateRailwayJson } from './infra';
import { generateReadmeForTarget, generateWorkflowForTarget } from './readme';
import { scrubModelForExport } from '../modelUtils';
import * as railwayTemplates from './railway-templates';
import * as codespacesTemplates from './codespaces-templates';
import { hasS3Config, getGpkgFilename } from './_helpers';


// ============================================================
// Generate deploy file map — target-aware
// Returns a flat Record<filename, content> for pushing to GitHub
// ============================================================
export const generateDeployFiles = async (
  model: DataModel,
  source: SourceConnection,
  lang: string = 'en',
  target: DeployTarget = 'docker-compose'
): Promise<Record<string, string>> => {
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  const scrubbedModel = scrubModelForExport(model);
  const oapifGoConfig = generateOapifGoConfig(model, source);

  const files: Record<string, string> = {
    'model.json': JSON.stringify(scrubbedModel, null, 2),
    'oapif-go-config.json': oapifGoConfig,
    '.env.template': generateEnvFile(source),
    '.gitignore': '.env\n',
    '.dockerignore': 'node_modules\ndist\n.git\n.venv\nvenv\ntmp\n*.local\n.env\n.env.*\n!.env.example\n',
    'README.md': generateReadmeForTarget(model, source, target, lang),
    '.github/workflows/deploy.yml': generateWorkflowForTarget(model, source, target),
  };

  if (hasWms) {
    files['project.qgs'] = generateQgisProject(model, source);
  }

  if (target === 'docker-compose' || target === 'codespaces') {
    files['docker-compose.yml'] = generateDockerCompose(model, source, { includeTiles: target === 'codespaces' });
  }

  if (target === 'codespaces') {
    files['.devcontainer/devcontainer.json'] = codespacesTemplates.devcontainerJson;
    files['viewer/index.html'] = codespacesTemplates.viewerIndexHtml;
    files['demo.ipynb'] = codespacesTemplates.generateNotebook(model, source);
  }

  if (target === 'railway') {
    files['railway.json'] = generateRailwayJson(model, source);
    if (hasWms) {
      files['railway.qgis.json'] = generateRailwayQgisJson(model, source);
    }

    const isLocalGpkg = source.type === 'geopackage' && !hasS3Config(source);
    const gpkgFilename = isLocalGpkg ? getGpkgFilename(model, source) : undefined;
    files['docker/railway/Dockerfile'] = railwayTemplates.generateDockerfile(isLocalGpkg, gpkgFilename);

    if (hasWms) {
      files['docker/railway/Dockerfile.qgis'] = railwayTemplates.dockerfileQgis;
      files['docker/railway/qgis-boot.sh'] = railwayTemplates.qgisBoot;
    }

    files['docker/worker/main.py'] = railwayTemplates.workerMain;
    files['docker/worker/gpkg-converter.py'] = railwayTemplates.workerGpkgConverter;
    files['docker/worker/postgis-snapshot.py'] = railwayTemplates.workerPostgisSnapshot;
  }

  return files;
};

// ============================================================
// Legacy: generate deploy kit as downloadable zip (kept as fallback)
// ============================================================
export const exportDeployKit = async (
  model: DataModel,
  source: SourceConnection,
  lang: string = 'en',
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

    if (binaryFiles) {
      for (const [name, blob] of Object.entries(binaryFiles)) {
        zip.file(`${folderName}/${name}`, blob);
      }
    }

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
