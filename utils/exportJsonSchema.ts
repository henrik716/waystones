import { DataModel, GeometryType } from '../types';
import { getEffectiveProperties } from './modelUtils';

/** Helper: is the multiplicity "required" (lower bound ≥ 1) */
const isRequired = (f: any): boolean => f.multiplicity === '1..1' || f.multiplicity === '1..*';

// --- Recursive helper to build JSON Schema property definitions ---
const buildPropertySchema = (f: any, model: DataModel): any => {
  const propSchema: any = {
    title: f.title || f.name,
  };

  if (f.description) propSchema.description = f.description;

  const ft = f.fieldType;
  switch (ft.kind) {
    case 'primitive':
      switch (ft.baseType) {
        case 'integer': propSchema.type = 'integer'; break;
        case 'number':  propSchema.type = 'number'; break;
        case 'boolean': propSchema.type = 'boolean'; break;
        case 'date':    propSchema.type = 'string'; propSchema.format = 'date'; break;
        case 'date-time': propSchema.type = 'string'; propSchema.format = 'date-time'; break;
        case 'json':    propSchema.type = 'object'; break;
        default:        propSchema.type = 'string'; break;
      }
      break;
    case 'datatype-ref': {
        const shared = model.sharedTypes?.find(st => st.id === ft.typeId);
        propSchema.type = 'object';
        if (shared) {
            propSchema.description = (f.description || '') + ` (Type: ${shared.name})`;
            const subProps: any = {};
            const subRequired: string[] = [];
            shared.properties.forEach(sp => {
                subProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
                if (isRequired(sp)) subRequired.push(sp.name);
            });
            propSchema.properties = subProps;
            if (subRequired.length > 0) propSchema.required = subRequired;
            // Arv type-nivå-avgrensninger (felt-nivå overstyrer)
            if (shared.constraints) {
              const tc = shared.constraints;
              if (tc.min !== undefined && f.constraints?.min === undefined) propSchema.minimum = Number(tc.min);
              if (tc.max !== undefined && f.constraints?.max === undefined) propSchema.maximum = Number(tc.max);
              if (tc.minLength !== undefined && f.constraints?.minLength === undefined) propSchema.minLength = Number(tc.minLength);
              if (tc.maxLength !== undefined && f.constraints?.maxLength === undefined) propSchema.maxLength = Number(tc.maxLength);
              if (tc.pattern && !f.constraints?.pattern) propSchema.pattern = tc.pattern;
            }
        }
        break;
    }
    case 'datatype-inline': {
      const isArray = f.multiplicity === '0..*' || f.multiplicity === '1..*';
      if (isArray) {
        propSchema.type = 'array';
        if (ft.properties && ft.properties.length > 0) {
          const itemProps: any = {};
          const itemRequired: string[] = [];
          ft.properties.forEach(sp => {
            itemProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
            if (isRequired(sp)) itemRequired.push(sp.name);
          });
          propSchema.items = { type: 'object', properties: itemProps };
          if (itemRequired.length > 0) propSchema.items.required = itemRequired;
        }
      } else {
        propSchema.type = 'object';
        if (ft.properties && ft.properties.length > 0) {
          const subProps: any = {};
          const subRequired: string[] = [];
          ft.properties.forEach(sp => {
            subProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
            if (isRequired(sp)) subRequired.push(sp.name);
          });
          propSchema.properties = subProps;
          if (subRequired.length > 0) propSchema.required = subRequired;
        }
      }
      break;
    }
    case 'feature-ref':
      propSchema.type = 'string';
      {
        const targetLayer = model.layers.find(layer => layer.id === ft.layerId);
        const targetLayerName = targetLayer?.name || ft.layerId;
        const inverseField = ft.inverseFieldId
          ? targetLayer?.properties.find(p => p.id === ft.inverseFieldId)
          : undefined;
        propSchema['x-relation'] = {
          targetLayer: targetLayerName,
          relationType: ft.relationType,
          cascadeDelete: ft.cascadeDelete,
          multiplicity: f.multiplicity,
          ...(inverseField ? { inverseTo: inverseField.name } : {}),
        };
      }
      break;
    case 'codelist': {
      propSchema.type = 'string';
      let resolvedValues: { code: string; label: string }[] = [];
      if (ft.mode === 'shared') {
        resolvedValues = model.sharedEnums?.find(e => e.id === ft.enumRef)?.values ?? [];
      } else if (ft.mode === 'inline') {
        resolvedValues = ft.values;
      }
      if (resolvedValues.length > 0) {
        propSchema.enum = resolvedValues.map(v => v.code);
        propSchema['x-codelist-labels'] = resolvedValues.map(v => ({ code: v.code, label: v.label }));
      }
      break;
    }
    case 'geometry':
      propSchema.type = 'string';
      propSchema.format = 'geometry';
      break;
  }

  // Constraints & Default (skip for containers)
  if (ft.kind !== 'datatype-inline' && ft.kind !== 'datatype-ref') {
    if (f.defaultValue !== undefined && f.defaultValue !== '') {
        if (ft.kind === 'primitive' && (ft.baseType === 'number' || ft.baseType === 'integer')) propSchema.default = Number(f.defaultValue);
        else if (ft.kind === 'primitive' && ft.baseType === 'boolean') propSchema.default = f.defaultValue === 'true';
        else propSchema.default = f.defaultValue;
    }
    const c = f.constraints;
    if (c) {
      if (c.min !== undefined && c.min !== null) propSchema.minimum = Number(c.min);
      if (c.max !== undefined && c.max !== null) propSchema.maximum = Number(c.max);
      if (c.minLength !== undefined && c.minLength !== null) propSchema.minLength = Number(c.minLength);
      if (c.maxLength !== undefined && c.maxLength !== null) propSchema.maxLength = Number(c.maxLength);
      if (c.pattern) propSchema.pattern = c.pattern;
      if (c.isPrimaryKey || c.isUnique) propSchema['x-constraints'] = { primaryKey: !!c.isPrimaryKey, unique: !!c.isUnique };
    }
  }
  return propSchema;
};

// --- GeoJSON geometry schema helper ---
const geoJsonGeometrySchema = (geometryType: GeometryType): any => {
  const geomTypes: Record<string, any> = {
    Point: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'Point' }, coordinates: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } },
    LineString: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'LineString' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } },
    Polygon: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'Polygon' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } } },
    MultiPoint: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'MultiPoint' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } },
    MultiLineString: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'MultiLineString' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } } },
    MultiPolygon: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'MultiPolygon' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } } } },
    GeometryCollection: { type: 'object', required: ['type', 'geometries'], properties: { type: { const: 'GeometryCollection' }, geometries: { type: 'array', items: { type: 'object' } } } },
  };
  return geomTypes[geometryType] || null;
};

export const generateGeoJSONSchema = (model: DataModel): Record<string, any> => {
  const rootSchema: Record<string, any> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: model.name,
    type: 'object',
    $defs: {},
    oneOf: []
  };

  if (model.description) rootSchema.description = model.description;

  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const props: any = {};
    const required: string[] = [];
    getEffectiveProperties(l, model.layers).forEach(f => {
      props[f.name || 'felt'] = buildPropertySchema(f, model);
      if (isRequired(f)) required.push(f.name);
    });

    const propertiesSchema: any = { type: 'object', properties: props };
    if (required.length > 0) propertiesSchema.required = required;

    const hasGeom = l.geometryType !== 'None';

    if (!hasGeom) {
      rootSchema.$defs[l.name] = {
        title: l.name,
        type: 'object',
        properties: props,
        ...(required.length > 0 ? { required } : {}),
        ...(l.description ? { description: l.description } : {}),
      };
      rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
      return;
    }

    const geomSchema = geoJsonGeometrySchema(l.geometryType);

    const featureSchema: any = {
      title: l.name,
      type: 'object',
      required: ['type', 'geometry', 'properties'],
      properties: {
        type: { const: 'Feature' },
        id: { type: ['string', 'number'] },
        geometry: geomSchema
          ? { oneOf: [geomSchema, { type: 'null' }] }
          : { type: 'null' },
        properties: { oneOf: [propertiesSchema, { type: 'null' }] },
      },
    };

    if (l.description) featureSchema.description = l.description;

    rootSchema.$defs[l.name] = featureSchema;
    rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
  });

  return rootSchema;
};

export const generateJSONFGSchema = (model: DataModel): Record<string, any> => {
  const rootSchema: Record<string, any> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: model.name,
    type: 'object',
    $defs: {},
    oneOf: []
  };

  if (model.description) rootSchema.description = model.description;

  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const props: any = {};
    const required: string[] = [];
    getEffectiveProperties(l, model.layers).forEach(f => {
      props[f.name || 'felt'] = buildPropertySchema(f, model);
      if (isRequired(f)) required.push(f.name);
    });

    const propertiesSchema: any = { type: 'object', properties: props };
    if (required.length > 0) propertiesSchema.required = required;

    const hasGeom = l.geometryType !== 'None';

    if (!hasGeom) {
      rootSchema.$defs[l.name] = {
        title: l.name,
        type: 'object',
        properties: props,
        ...(required.length > 0 ? { required } : {}),
        ...(l.description ? { description: l.description } : {}),
      };
      rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
      return;
    }

    const crs = model.crs || 'EPSG:4326';
    const isWgs84 = crs === 'EPSG:4326' || crs === 'CRS84';
    const placeSchema = geoJsonGeometrySchema(l.geometryType);

    const featureSchema: any = {
      title: l.name,
      type: 'object',
      conformsTo: '[OGC-21-045]',
      featureType: l.name,
      coordRefSys: `https://www.opengis.net/def/crs/${crs.replace(':', '/')}`,
      required: ['type', 'time', 'geometry', 'properties'],
      properties: {
        type: { const: 'Feature' },
        id: { type: ['string', 'number'] },
        featureType: { const: l.name },
        time: {
          oneOf: [
            { type: 'null' },
            { type: 'string', format: 'date' },
            { type: 'string', format: 'date-time' },
            { type: 'object', properties: { date: { type: 'string', format: 'date' }, timestamp: { type: 'string', format: 'date-time' } } }
          ]
        },
        geometry: isWgs84 && placeSchema
          ? { oneOf: [placeSchema, { type: 'null' }] }
          : { type: 'null' },
        place: placeSchema
          ? { oneOf: [placeSchema, { type: 'null' }] }
          : { type: 'null' },
        properties: { oneOf: [propertiesSchema, { type: 'null' }] },
      },
    };

    if (l.description) featureSchema.description = l.description;

    rootSchema.$defs[l.name] = featureSchema;
    rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
  });

  return rootSchema;
};
