import { DataModel } from '../types';
import yaml from 'js-yaml';

export const exportModelAsYaml = (model: DataModel, filename: string) => {
  const yamlContent = `# Data Model: ${model.name}
# Namespace: ${model.namespace}
# Version: ${model.version}
# Generated: ${new Date().toISOString()}

${yaml.dump(model, { indent: 2, lineWidth: -1 })}`;

  const blob = new Blob([yamlContent], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.model.yaml`;
  a.click();
  URL.revokeObjectURL(url);
};

// JSON Schema for model.json itself (meta-schema)
export const generateModelSchema = (): Record<string, any> => {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Waystones Data Model',
    description: 'Schema describing the structure of a Waystones data model (model.json)',
    type: 'object',
    required: ['id', 'name', 'namespace', 'version', 'layers', 'crs', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', description: 'Unique model identifier (UUID)' },
      name: { type: 'string', description: 'Display name of the data model' },
      namespace: { type: 'string', description: 'Namespace (e.g., org.example.dataset)' },
      description: { type: 'string', description: 'Model description' },
      version: { type: 'string', description: 'Semantic version (e.g., 1.0.0)' },
      crs: { type: 'string', description: 'EPSG code (e.g., EPSG:25833)' },
      createdAt: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp' },
      updatedAt: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp' },
      layers: {
        type: 'array',
        description: 'Feature classes / database tables',
        items: {
          type: 'object',
          required: ['id', 'name', 'geometryType', 'geometryColumnName', 'properties', 'style'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            geometryType: {
              enum: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection', 'None']
            },
            geometryColumnName: { type: 'string' },
            properties: {
              type: 'array',
              items: { $ref: '#/$defs/Field' }
            },
            style: { $ref: '#/$defs/LayerStyle' },
            layerConstraints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  fieldIds: { type: 'array', items: { type: 'string' } },
                  operator: { enum: ['equals', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual', 'notEquals', 'contains'] },
                  value: { type: 'string' }
                }
              }
            },
            extends: { type: 'string', description: 'Parent layer ID (inheritance)' },
            isAbstract: { type: 'boolean' }
          }
        }
      },
      sharedTypes: {
        type: 'array',
        description: 'Reusable complex types (datatype definitions)',
        items: {
          type: 'object',
          required: ['id', 'name', 'properties'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            properties: {
              type: 'array',
              items: { $ref: '#/$defs/Field' }
            }
          }
        }
      },
      sharedEnums: {
        type: 'array',
        description: 'Reusable code lists / enumerations',
        items: {
          type: 'object',
          required: ['id', 'name', 'values'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            values: {
              type: 'array',
              items: { $ref: '#/$defs/CodeValue' }
            }
          }
        }
      },
      metadata: { $ref: '#/$defs/ModelMetadata' },
      renderingOrder: {
        type: 'array',
        description: 'Layer IDs in draw order',
        items: { type: 'string' }
      },
      githubMeta: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'owner/name' },
          path: { type: 'string', description: 'File path in repo' },
          branch: { type: 'string', description: 'Branch name' }
        }
      },
      sourceConnection: { $ref: '#/$defs/SourceConnection' }
    },
    $defs: {
      Field: {
        type: 'object',
        required: ['id', 'name', 'title', 'description', 'multiplicity', 'fieldType'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          multiplicity: { enum: ['1..1', '0..1', '1..*', '0..*'] },
          defaultValue: { type: 'string' },
          constraints: { $ref: '#/$defs/PropertyConstraints' },
          fieldType: { $ref: '#/$defs/FieldType' }
        }
      },
      FieldType: {
        oneOf: [
          {
            type: 'object',
            required: ['kind', 'baseType'],
            properties: {
              kind: { const: 'primitive' },
              baseType: { enum: ['string', 'integer', 'number', 'boolean', 'date', 'date-time', 'json'] }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'mode'],
            properties: {
              kind: { const: 'codelist' },
              mode: { const: 'inline' },
              values: { type: 'array', items: { $ref: '#/$defs/CodeValue' } }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'mode'],
            properties: {
              kind: { const: 'codelist' },
              mode: { const: 'external' },
              url: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'mode'],
            properties: {
              kind: { const: 'codelist' },
              mode: { const: 'shared' },
              enumRef: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'geometryType'],
            properties: {
              kind: { const: 'geometry' },
              geometryType: { enum: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection', 'None'] },
              role: { enum: ['primary', 'secondary'] }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'properties'],
            properties: {
              kind: { const: 'datatype-inline' },
              properties: { type: 'array', items: { $ref: '#/$defs/Field' } },
              name: { type: 'string' },
              isNameSynthetic: { type: 'boolean' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'typeId'],
            properties: {
              kind: { const: 'datatype-ref' },
              typeId: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'layerId', 'relationType'],
            properties: {
              kind: { const: 'feature-ref' },
              layerId: { type: 'string' },
              relationType: { enum: ['foreign_key', 'intersects', 'contains', 'within', 'touches', 'crosses'] },
              cascadeDelete: { type: 'boolean' },
              inverseFieldId: { type: 'string' }
            },
            additionalProperties: false
          }
        ]
      },
      PropertyConstraints: {
        type: 'object',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' },
          minLength: { type: 'integer' },
          maxLength: { type: 'integer' },
          pattern: { type: 'string', description: 'Regular expression' },
          isUnique: { type: 'boolean' },
          isPrimaryKey: { type: 'boolean' },
          enumeration: { type: 'array', items: { type: 'string' } }
        }
      },
      CodeValue: {
        type: 'object',
        required: ['id', 'code', 'label'],
        properties: {
          id: { type: 'string' },
          code: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' }
        }
      },
      LayerStyle: {
        type: 'object',
        required: ['type', 'simpleColor'],
        properties: {
          type: { enum: ['simple', 'categorized'] },
          simpleColor: { type: 'string', description: 'Hex color code' },
          propertyId: { type: 'string' },
          categorizedColors: { type: 'object', additionalProperties: { type: 'string' } },
          pointSize: { type: 'number' },
          pointIcon: { enum: ['circle', 'square', 'triangle', 'star'] },
          lineWidth: { type: 'number' },
          lineDash: { enum: ['solid', 'dashed', 'dotted', 'dash-dot', 'dash-dot-dot', 'long-dash'] },
          fillOpacity: { type: 'number' },
          hatchStyle: { enum: ['solid', 'horizontal', 'vertical', 'cross', 'b_diagonal', 'f_diagonal', 'diagonal_x'] },
          hatchThickness: { type: 'number' },
          hatchSpacing: { type: 'number' },
          hatchLineCount: { type: 'number' }
        }
      },
      ModelMetadata: {
        type: 'object',
        properties: {
          contactName: { type: 'string' },
          contactEmail: { type: 'string', format: 'email' },
          contactOrganization: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
          theme: { type: 'array', items: { type: 'string' }, description: 'INSPIRE themes (2-letter codes)' },
          license: { enum: ['CC-BY-4.0', 'CC0', 'CC-BY-SA-4.0', 'NLOD-2.0'] },
          accessRights: { enum: ['public', 'restricted', 'private'] },
          purpose: { type: 'string' },
          accrualPeriodicity: { type: 'string', description: 'Frequency of updates (ISO 8601 duration or named interval)' },
          spatialExtent: {
            type: 'object',
            properties: {
              west: { type: 'number' },
              east: { type: 'number' },
              south: { type: 'number' },
              north: { type: 'number' }
            }
          },
          temporalExtentFrom: { type: 'string', format: 'date-time' },
          temporalExtentTo: { type: 'string', format: 'date-time' },
          url: { type: 'string', format: 'uri' },
          termsOfService: { type: 'string', format: 'uri' }
        }
      },
      SourceConnection: {
        oneOf: [
          {
            type: 'object',
            required: ['type', 'host', 'port', 'database', 'user'],
            properties: {
              type: { const: 'postgis' },
              host: { type: 'string' },
              port: { type: 'integer' },
              database: { type: 'string' },
              user: { type: 'string' },
              password: { type: 'string' },
              ssl: { type: 'boolean' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['type', 'filepath'],
            properties: {
              type: { const: 'geopackage' },
              filepath: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['type', 'workspace', 'catalog'],
            properties: {
              type: { const: 'databricks' },
              workspace: { type: 'string' },
              catalog: { type: 'string' },
              schema: { type: 'string' },
              token: { type: 'string' }
            },
            additionalProperties: false
          }
        ]
      }
    }
  };
};

export const exportModelSchema = (filename: string) => {
  const schema = generateModelSchema();
  const json = JSON.stringify(schema, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.model-schema.json`;
  a.click();
  URL.revokeObjectURL(url);
};
