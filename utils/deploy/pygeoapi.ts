import {
  DataModel, SourceConnection, ModelMetadata
} from '../../types';
import { reprojectCoordinates } from '../gdalService';
import { toTableName } from '../nameSanitizer';
import { getGpkgFilename, getPgConnectionEnv } from './_helpers';

// ============================================================
// Generate source-aware pygeoapi config
// PostGIS/Supabase → PostgreSQL provider (live query)
// Databricks/GeoPackage → SQLiteGPKG provider
// ============================================================
export const generatePygeoapiConfig = async (
  model: DataModel,
  source?: SourceConnection,
  lang: string = 'no'
): Promise<string> => {
  const gpkgFilename = getGpkgFilename(model, source);
  const pgEnv = source ? getPgConnectionEnv(source) : null;
  const usePg = pgEnv !== null;

  let yaml = `# pygeoapi configuration for ${model.name}\n`;
  yaml += `# Generated: ${new Date().toISOString()}\n`;
  yaml += `# Source: ${source?.type || 'geopackage (no live connection)'}\n\n`;

  // FIX: Use env vars for both port and public URL so Railway/Fly/etc work correctly.
  // PORT is injected automatically by Railway; PYGEOAPI_SERVER_URL must be set manually
  // to the public-facing HTTPS URL after first deploy.
  yaml += `server:\n  bind:\n    host: 0.0.0.0\n    port: \${PORT:-80}\n`;
  yaml += `  url: \${PYGEOAPI_SERVER_URL}\n`;
  yaml += `  mimetype: application/json; charset=UTF-8\n  encoding: utf-8\n  languages:\n    - ${lang === 'no' ? 'nb-NO' : 'en-US'}\n`;
  // Required by pygeoapi's collection.html template — without this the page throws
  // "dict object has no attribute 'map'" when rendering the HTML view of a collection.
  yaml += `  map:\n`;
  yaml += `    url: https://tile.openstreetmap.org/{z}/{x}/{y}.png\n`;
  yaml += `    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'\n`;
  // Required by pygeoapi items/index.html — reads limits.default_items for the
  // items-per-page dropdown. Must be present or page throws UndefinedError.
  yaml += `  limits:\n`;
  yaml += `    default_items: 10\n`;
  yaml += `    max_items: 10000\n`;
  yaml += `  templates:\n`;
  yaml += `    path: /pygeoapi/local-templates\n\n`;
  yaml += `logging:\n  level: INFO\n\n`;

  // Metadata — enriched from model.metadata if available
  const meta = model.metadata || ({} as Partial<ModelMetadata>);
  const keywords = meta?.keywords?.length ? meta.keywords : ['geospatial', model.namespace || 'data'];
  const licenseName = meta?.license || 'CC-BY-4.0';
  const licenseUrls: Record<string, string> = {
    'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'NLOD-2.0': 'https://data.norge.no/nlod/no/2.0',
  };

  yaml += `metadata:\n`;
  yaml += `  identification:\n`;
  yaml += `    title: ${model.name}\n`;
  yaml += `    description: ${model.description || 'Spatial data'}\n`;
  yaml += `    url: ${meta.url || 'https://example.com/dataset'}\n`;
  yaml += `    terms_of_service: ${meta.termsOfService || 'https://example.com/terms'}\n`;
  yaml += `    keywords:\n`;
  keywords.forEach(kw => { yaml += `      - ${kw}\n`; });

  if (meta?.purpose) {
    yaml += `    abstract: ${meta.purpose}\n`;
  }

  yaml += `  license:\n`;
  yaml += `    name: ${licenseName}\n`;
  yaml += `    url: ${licenseUrls[licenseName] || ''}\n`;

  if (meta?.contactName || meta?.contactEmail || meta?.contactOrganization) {
    yaml += `  contact:\n`;
    yaml += `    name: ${meta.contactName || 'Contact'}\n`;
    yaml += `    email: ${meta.contactEmail || 'contact@example.com'}\n`;
    yaml += `  provider:\n`;
    yaml += `    name: ${meta.contactName || 'Contact'}\n`;
    if (meta?.contactOrganization) yaml += `    organization: ${meta.contactOrganization}\n`;
    yaml += `    email: ${meta.contactEmail || 'contact@example.com'}\n`;
  }
  yaml += `\n`;
  yaml += `resources:\n`;

  for (const layer of model.layers) {
    const collectionId = toTableName(layer.name);
    const mapping = source?.layerMappings?.[layer.id];
    const sourceTable = mapping?.sourceTable || collectionId;

    // pygeoapi requires a keywords list on every collection resource — not just
    // in top-level metadata. Missing keywords causes a KeyError on /collections.
    const layerKeywords = (layer as any).keywords?.length
      ? (layer as any).keywords
      : [model.namespace || 'data', layer.name.toLowerCase().replace(/[^a-z0-9]/g, '-')];

    yaml += `  ${collectionId}:\n`;
    yaml += `    type: collection\n`;
    yaml += `    title: ${layer.name}\n`;
    yaml += `    description: ${layer.description || 'Spatial collection'}\n`;
    yaml += `    keywords:\n`;
    layerKeywords.forEach((kw: string) => { yaml += `      - ${kw}\n`; });

    if (layer.geometryType !== 'None') {
      const ext = model.metadata?.spatialExtent;
      const hasBbox = ext?.westBoundLongitude && ext?.southBoundLatitude && ext?.eastBoundLongitude && ext?.northBoundLatitude;

      let bbox = '[-180, -90, 180, 90]'; // default to world extent in WGS84

      if (hasBbox && model.crs) {
        // Transform bbox from model CRS to WGS84
        const coords: [number, number][] = [
          [Number(ext!.westBoundLongitude), Number(ext!.southBoundLatitude)], // SW corner
          [Number(ext!.eastBoundLongitude), Number(ext!.northBoundLatitude)]  // NE corner
        ];

        try {
          const transformed = await reprojectCoordinates(coords, model.crs, 'EPSG:4326');
          bbox = `[${transformed[0][0]}, ${transformed[0][1]}, ${transformed[1][0]}, ${transformed[1][1]}]`;
        } catch (error) {
          console.warn('Failed to transform bbox to WGS84, using original coordinates:', error);
          bbox = `[${ext!.westBoundLongitude}, ${ext!.southBoundLatitude}, ${ext!.eastBoundLongitude}, ${ext!.northBoundLatitude}]`;
        }
      } else if (hasBbox) {
        // Use original bbox if no CRS transformation needed
        bbox = `[${ext!.westBoundLongitude}, ${ext!.southBoundLatitude}, ${ext!.eastBoundLongitude}, ${ext!.northBoundLatitude}]`;
      }

      yaml += `    extents:\n`;
      yaml += `      spatial:\n`;
      yaml += `        bbox: ${bbox}\n`;
      yaml += `        crs: http://www.opengis.net/def/crs/OGC/1.3/CRS84\n`;
    }

    if (usePg) {
      yaml += `    providers:\n`;
      // Live connection to PostGIS / Supabase
      yaml += `      - type: feature\n`;
      yaml += `        name: PostgreSQL\n`;
      yaml += `        data:\n`;
      yaml += `          host: \${POSTGRES_HOST}\n`;
      yaml += `          port: \${POSTGRES_PORT}\n`;
      yaml += `          dbname: \${POSTGRES_DB}\n`;
      yaml += `          user: \${POSTGRES_USER}\n`;
      yaml += `          password: \${POSTGRES_PASSWORD}\n`;
      yaml += `          search_path:\n`;
      yaml += `            - \${POSTGRES_SCHEMA}\n`;
      yaml += `        id_field: ${mapping?.primaryKeyColumn || 'fid'}\n`;
      yaml += `        table: ${sourceTable}\n`;
      yaml += `        geom_field: ${layer.geometryColumnName || 'geom'}\n`;
      yaml += getCQL2Extensions();
    } else {
      // GeoPackage file provider (Databricks, direct GeoPackage, or no source)
      const rawCrs = model.crs;
      const storageCrsUri = rawCrs
        ? (rawCrs.startsWith('http')
          ? rawCrs
          : `http://www.opengis.net/def/crs/EPSG/0/${rawCrs.split(':')[1]}`)
        : null;
      yaml += `    providers:\n`;
      yaml += `      - type: feature\n`;
      yaml += `        name: SQLiteGPKG\n`;
      yaml += `        data: /data/${gpkgFilename}\n`;
      yaml += `        table: ${sourceTable}\n`;
      yaml += `        id_field: ${mapping?.primaryKeyColumn || 'fid'}\n`;
      yaml += `        geom_field: ${layer.geometryColumnName || 'geom'}\n`;
      if (storageCrsUri) {
        yaml += `        storage_crs: ${storageCrsUri}\n`;
      }
      yaml += getCQL2Extensions();
    }

    // Explicitly define schema to ensure all fields are available as queryables.
    // We resolve inheritance to include properties from parent layers.
    const allProperties = resolveLayerProperties(layer, model.layers);

    yaml += `    schema:\n`;
    yaml += `      # Resolved properties for ${layer.name} (Local: ${layer.properties.length}, Total: ${allProperties.length})\n`;
    yaml += `      # Generator Version: 1.0.2\n`;
    yaml += `      title: "${layer.name}"\n`;
    yaml += `      type: object\n`;
    yaml += `      properties:\n`;
    yaml += `        "waystones_ping":\n`;
    yaml += `          title: "Waystones Connection Check"\n`;
    yaml += `          type: string\n`;
    allProperties.forEach(prop => {
      const typeInfo = mapFieldToSchemaType(prop);
      // Quote property names to avoid YAML parsing issues with reserved words or types
      yaml += `        "${prop.name}":\n`;
      yaml += `          title: "${prop.title || prop.name}"\n`;
      yaml += `          type: ${typeInfo.type}\n`;
      if (typeInfo.format) yaml += `          format: ${typeInfo.format}\n`;
      if (typeInfo.enum) {
        yaml += `          enum:\n`;
        typeInfo.enum.forEach((e: string) => { yaml += `            - "${e}"\n`; });
      }
    });
    yaml += `\n`;
  }

  return yaml;
};

/**
 * Returns the standard OGC API CQL2 extensions block for pygeoapi providers.
 * Activating both cql2-text and cql2-json ensures broad client compatibility.
 */
function getCQL2Extensions(): string {
  let s = `        extensions:\n`;
  s += `          filters:\n`;
  s += `            - cql2-text\n`;
  s += `            - cql2-json\n`;
  s += `            - cql-text\n\n`;
  return s;
}

/**
 * Resolves all properties for a layer, including inherited ones.
 */
function resolveLayerProperties(layer: any, allLayers: any[]): any[] {
  const propertyMap = new Map<string, any>();
  const visitedIds = new Set<string>();
  let current = layer;

  const layersToProcess: any[] = [];
  while (current) {
    layersToProcess.unshift(current); // Base layers (top-most parent) first

    const parentRef = current.extends;
    if (!parentRef || visitedIds.has(parentRef)) break;

    visitedIds.add(parentRef);
    // Try lookup by ID first, then by name as fallback
    current = allLayers.find(l => l.id === parentRef || l.name === parentRef);
  }

  layersToProcess.forEach(l => {
    if (l.properties && Array.isArray(l.properties)) {
      l.properties.forEach(p => {
        propertyMap.set(p.name, p);
      });
    }
  });

  return Array.from(propertyMap.values());
}

/**
 * Maps a Geoforge Field/FieldType to a standard JSON Schema type for pygeoapi
 */
function mapFieldToSchemaType(field: any): { type: string; format?: string; enum?: string[] } {
  const ft = field.fieldType;
  if (!ft) return { type: 'string' };

  if (ft.kind === 'primitive') {
    const bt = String(ft.baseType).toLowerCase();
    switch (bt) {
      case 'integer':
      case 'int':
      case 'int4':
      case 'int8':
      case 'integer32':
      case 'integer64':
      case 'bigint':
      case 'long':
      case 'short':
      case 'smallint':
      case 'tinyint':
        // Pygeoapi/OGC Queryables often prefer 'number' for general numeric compatibility
        return { type: 'number' };
      case 'number':
      case 'float':
      case 'float4':
      case 'float8':
      case 'double':
      case 'decimal':
      case 'numeric':
      case 'real':
        return { type: 'number' };
      case 'boolean':
      case 'bool':
        return { type: 'boolean' };
      case 'date': return { type: 'string', format: 'date' };
      case 'date-time':
      case 'timestamp':
      case 'timestamptz':
        return { type: 'string', format: 'date-time' };
      default: return { type: 'string' };
    }
  }

  if (ft.kind === 'codelist' && ft.mode === 'inline') {
    return {
      type: 'string',
      enum: ft.values.map((v: any) => v.code || v.id)
    };
  }

  return { type: 'string' };
}
