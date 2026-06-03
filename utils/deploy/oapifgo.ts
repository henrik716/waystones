import { DataModel, SourceConnection } from '../../types';
import { toTableName } from '../nameSanitizer';

// ---------------------------------------------------------------------------
// oapif-go config.json generator — OSS / self-hosted deploy kit
//
// Produces a config.json for oapif-go running alongside a MinIO sidecar
// (docker-compose) or against a real S3/R2 bucket (Railway / production).
//
// The worker always outputs {layer_id}.parquet to the bucket root, so
// parquet_key is just "{layer_id}.parquet" — no prefix needed.
// ---------------------------------------------------------------------------

interface OapifCollectionConfig {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  parquet_key: string;
  geom_column: string;
  id_column: string;
}

interface OapifConfig {
  title?: string;
  description?: string;
  provider?: string;
  license?: string;
  keywords?: string[];
  contact_email?: string;
  contact_name?: string;
  collections: OapifCollectionConfig[];
}

export function generateOapifGoConfig(
  model: DataModel,
  _source?: SourceConnection,
): string {
  const collections: OapifCollectionConfig[] = [];

  for (const layer of model.layers ?? []) {
    if ((layer as any).isAbstract) continue;

    const id = toTableName(layer.name);

    const idCol =
      (layer as any).primaryKeyColumn ||
      'fid';

    const col: OapifCollectionConfig = {
      id,
      title: layer.title || layer.name,
      parquet_key: `${id}.parquet`,
      geom_column: (layer as any).geometryColumnName || 'geometry',
      id_column: idCol,
    };

    if (layer.description) col.description = layer.description;
    if (layer.keywords?.length) col.keywords = layer.keywords;

    collections.push(col);
  }

  const meta = model.metadata;

  return JSON.stringify({
    title: model.name || undefined,
    description: model.description || undefined,
    provider: meta?.contactOrganization || meta?.contactName || undefined,
    license: meta?.license || undefined,
    keywords: meta?.keywords?.length ? meta.keywords : undefined,
    contact_email: meta?.contactEmail || undefined,
    contact_name: meta?.contactName || undefined,
    collections,
  } satisfies OapifConfig, null, 2);
}
