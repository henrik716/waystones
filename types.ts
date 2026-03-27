export type Language = 'no' | 'en';

export interface CodeValue {
  id: string;
  code: string;
  label: string;
  description?: string;
}

export type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'GeometryCollection' | 'None';

export type Multiplicity = '1..1' | '0..1' | '1..*' | '0..*';

// --- FieldType: diskriminerte union-varianter ---

export type PrimitiveFieldType = {
  kind: 'primitive';
  baseType: 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'date-time' | 'json';
};

export type CodelistFieldType =
  | { kind: 'codelist'; mode: 'inline'; values: CodeValue[] }
  | { kind: 'codelist'; mode: 'external'; url: string }
  | { kind: 'codelist'; mode: 'shared'; enumRef: string };

export type GeometryFieldType = {
  kind: 'geometry';
  geometryType: GeometryType;
  role?: 'primary' | 'secondary'; // 'primary' = correponds to layer-level geometry
};

export type DatatypeInlineFieldType = {
  kind: 'datatype-inline';
  properties: Field[];
  name?: string; // user-assigned or synthetic name
  isNameSynthetic?: boolean; // true when auto-generated from field name
};

export type DatatypeRefFieldType = {
  kind: 'datatype-ref';
  typeId: string;
};

export type FeatureRefFieldType = {
  kind: 'feature-ref';
  layerId: string;
  relationType: 'foreign_key' | 'intersects' | 'contains' | 'within' | 'touches' | 'crosses';
  cascadeDelete?: boolean;
  inverseFieldId?: string; // ID til feltet i mållaget som er den inverse enden
};

export type FieldType =
  | PrimitiveFieldType
  | CodelistFieldType
  | GeometryFieldType
  | DatatypeInlineFieldType
  | DatatypeRefFieldType
  | FeatureRefFieldType;

// --- Feltet ---

export interface PropertyConstraints {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  isUnique?: boolean;
  isPrimaryKey?: boolean;
  enumeration?: string[];
}

export interface Field {
  id: string;
  name: string;
  title: string;
  description: string;
  multiplicity: Multiplicity;
  defaultValue?: string;
  constraints?: PropertyConstraints;
  fieldType: FieldType;
}

// --- Helper: hent en lesbar "kind"-streng for UI/config-oppslag ---
export type FieldKind = FieldType['kind'];

export interface LayerStyle {
  type: 'simple' | 'categorized';
  simpleColor: string;
  propertyId?: string;
  categorizedColors?: Record<string, string>;
  pointSize?: number;
  pointIcon?: 'circle' | 'square' | 'triangle' | 'star';
  lineWidth?: number;
  lineDash?: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot' | 'long-dash';
  fillOpacity?: number;
  hatchStyle?: 'solid' | 'horizontal' | 'vertical' | 'cross' | 'b_diagonal' | 'f_diagonal' | 'diagonal_x';
  hatchThickness?: number;
  hatchSpacing?: number;
  hatchLineCount?: number;
}

export interface LayerConstraint {
  id: string;
  type: 'compare';
  fieldA: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  fieldB: string;
  errorMessage?: string;
}

export interface Layer {
  id: string;
  name: string;
  description: string;
  title?: string;
  keywords?: string[];
  properties: Field[];
  geometryType: GeometryType;
  geometryColumnName: string;
  primaryKeyColumn?: string;
  style: LayerStyle;
  layerConstraints?: LayerConstraint[];
  extends?: string;
  isAbstract?: boolean;
}

export interface ModelMetadata {
  contactName: string;
  contactEmail: string;
  contactOrganization: string;
  keywords: string[];
  theme: string;
  license: string;
  accessRights: string;
  purpose: string;
  accrualPeriodicity: string;
  spatialExtent: {
    westBoundLongitude: string;
    eastBoundLongitude: string;
    southBoundLatitude: string;
    northBoundLatitude: string;
  };
  temporalExtentFrom: string;
  temporalExtentTo: string;
  url?: string;
  termsOfService?: string;
}

export interface DataModel {
  id: string;
  name: string;
  namespace: string;
  description: string;
  version: string;
  layers: Layer[];
  crs: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ModelMetadata;
  githubMeta?: { repo: string; path: string; branch: string; };
  sourceConnection?: SourceConnection;
  sharedTypes?: SharedType[];
  sharedEnums?: SharedEnum[];
  renderingOrder?: string[];
}

export interface SharedType {
  id: string;
  name: string;
  description: string;
  properties: Field[];
  constraints?: PropertyConstraints; // Type-nivå-avgrensninger som arves av felt som bruker denne typen
}

export interface SharedEnum {
  id: string;
  name: string;
  description: string;
  values: CodeValue[];
}

export type ViewTab = 'landing' | 'models' | 'editor' | 'preview' | 'mapper' | 'github' | 'deploy' | 'quick-publish';

export type SourceType = 'postgis' | 'supabase' | 'databricks' | 'geopackage';
export type DeployTarget = 'docker-compose' | 'fly' | 'railway' | 'ghcr';

export interface GeopackageConfig {
  filename: string;
}

export interface SourceConnection {
  type: SourceType;
  config: PostgresConfig | SupabaseConfig | DatabricksConfig | GeopackageConfig;
  layerMappings: Record<string, LayerSourceMapping>; // modelLayerId -> mapping
}

export interface PostgresConfig {
  host: string;
  port: string;
  dbname: string;
  user: string;
  password: string;
  schema: string;
}

export interface SupabaseConfig {
  projectUrl: string;   // e.g. https://xyz.supabase.co
  anonKey: string;
  schema: string;
  // Supabase is PostGIS under the hood — we derive the PG connection from these
}

export interface DatabricksConfig {
  host: string;         // e.g. adb-123456.azuredatabricks.net
  httpPath: string;     // e.g. /sql/1.0/warehouses/abc123
  token: string;
  catalog: string;
  schema: string;
}

export interface LayerSourceMapping {
  sourceTable: string;
  fieldMappings: Record<string, string>;  // modelPropertyId -> sourceColumnName
  timestampColumn?: string;               // for update detection (optional — without it, only inserts/deletes are tracked)
  primaryKeyColumn: string;               // column that uniquely identifies each row (default: 'fid')
}

export interface ImportWarning {
  type: 'no_primary_key' | 'non_integer_pk' | 'null_pk' | 'non_unique_pk';
  layerName: string;
  columnName?: string;
  message: string;
  suggestion: string;
  severity: 'warning' | 'error';
}

export interface ImportError {
  type: 'critical';
  layerName: string;
  message: string;
  details: string;
}

export interface ImportValidationResult {
  warnings: ImportWarning[];
  errors: ImportError[];
  isValid: boolean;
  canProceed: boolean;
}
