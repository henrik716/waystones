export type Language = 'no' | 'en';

export interface CodeValue {
  id: string;
  code: string;
  label: string;
  description?: string;
}

export type PropertyType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'geometry' | 'codelist' | 'json' | 'relation' | 'object' | 'array' | 'shared_type';

export type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'GeometryCollection' | 'None'; 

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

export interface ModelProperty {
  id: string;
  name: string;
  title: string;
  type: PropertyType;
  required: boolean;
  description: string;
  defaultValue?: string;
  geometryType?: GeometryType;
  codelistMode?: 'inline' | 'external' | 'shared';
  codelistUrl?: string;
  codelistValues: CodeValue[];
  sharedEnumId?: string;        // reference to a SharedEnum (when codelistMode = 'shared')
  constraints?: PropertyConstraints;
  relationConfig?: {
    targetLayerId: string;
    relationType: 'foreign_key' | 'intersects' | 'contains' | 'within' | 'touches' | 'crosses';
    cascadeDelete?: boolean;
    multiplicity?: '1..1' | '0..1' | '1..*' | '0..*';
  };
  subProperties?: ModelProperty[];
  sharedTypeId?: string;
}

export interface LayerStyle {
  type: 'simple' | 'categorized';
  simpleColor: string;
  propertyId?: string;
  categorizedColors?: Record<string, string>; // Maps code value to hex color
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
  properties: ModelProperty[];
  geometryType: GeometryType;
  geometryColumnName: string;
  style: LayerStyle;
  layerConstraints?: LayerConstraint[];
  extends?: string;      // ID of parent Layer (optional inheritance)
  isAbstract?: boolean;  // If true, excluded from SQL/GeoPackage/Deploy output
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
  url?: string;                    // Dataset URL
  termsOfService?: string;         // Terms of service URL
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
  renderingOrder?: string[]; // Layer IDs in desired rendering order
}

export interface SharedType {
  id: string;
  name: string;
  description: string;
  properties: ModelProperty[];
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
