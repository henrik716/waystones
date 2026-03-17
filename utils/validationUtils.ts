import { DataModel, Layer, Field, SharedType } from '../types';

// Type name translations for validation messages
const typeNameTranslations: Record<string, { en: string; no: string }> = {
  string: { en: 'Text', no: 'Tekst' },
  number: { en: 'Decimal', no: 'Desimaltall' },
  boolean: { en: 'Yes/No', no: 'Ja/Nei' },
  date: { en: 'Date', no: 'Dato' },
  'date-time': { en: 'Date/Time', no: 'Dato/Tid' },
};

const getTypeDisplayName = (baseType: string, lang: 'en' | 'no' = 'en'): string => {
  const translation = typeNameTranslations[baseType];
  if (translation) {
    return lang === 'no' ? translation.no : translation.en;
  }
  return baseType;
};

export type ValidationSeverity = 'error' | 'warning' | 'hint';

export interface ModelValidationIssue {
  severity: ValidationSeverity;
  layerId?: string;
  fieldId?: string;
  code: string;
  message: string;
  messageNo: string;
}

// ============================================================
// Règle-konstanter
// ============================================================

const RULES = {
  LAYER_NO_PK: 'LAYER_NO_PK',
  LAYER_MULTIPLE_PKS: 'LAYER_MULTIPLE_PKS',
  LAYER_NO_GEOM_COLUMN: 'LAYER_NO_GEOM_COLUMN',
  LAYER_ABSTRACT_UNUSED: 'LAYER_ABSTRACT_UNUSED',
  LAYER_EXTENDS_UNKNOWN: 'LAYER_EXTENDS_UNKNOWN',
  LAYER_EXTENDS_CIRCULAR_DEEP: 'LAYER_EXTENDS_CIRCULAR_DEEP',
  LAYER_DUPLICATE_NAME: 'LAYER_DUPLICATE_NAME',
  LAYER_NO_PROPERTIES: 'LAYER_NO_PROPERTIES',
  LAYER_PK_MULTIPLICITY: 'LAYER_PK_MULTIPLICITY',
  LAYER_PK_TYPE: 'LAYER_PK_TYPE',
  LAYER_NO_DESCRIPTION: 'LAYER_NO_DESCRIPTION',
  FIELD_DUPLICATE_NAME: 'FIELD_DUPLICATE_NAME',
  FIELD_DATATYPE_REF_EMPTY: 'FIELD_DATATYPE_REF_EMPTY',
  FIELD_FEATURE_REF_EMPTY: 'FIELD_FEATURE_REF_EMPTY',
  FIELD_FEATURE_REF_INVERSE_MISMATCH: 'FIELD_FEATURE_REF_INVERSE_MISMATCH',
  FIELD_SHARED_ENUM_REF_MISSING: 'FIELD_SHARED_ENUM_REF_MISSING',
  FIELD_NAME_TOO_LONG: 'FIELD_NAME_TOO_LONG',
  FIELD_REF_TO_NONSPATIAL: 'FIELD_REF_TO_NONSPATIAL',
  MULTIPLICITY_ARRAY_ON_GEOMETRY: 'MULTIPLICITY_ARRAY_ON_GEOMETRY',
} as const;

// ============================================================
// Hjelper: valider felt i et lag eller datatype
// ============================================================

const validateFields = (
  fields: Field[],
  allLayers: Layer[],
  sharedTypes: SharedType[],
  sharedEnums: any[] = [],
  layerId?: string
): ModelValidationIssue[] => {
  const issues: ModelValidationIssue[] = [];

  // Check for duplicate field names
  const fieldNames = new Set<string>();
  fields.forEach(f => {
    if (!f.name) return;
    if (fieldNames.has(f.name)) {
      issues.push({
        severity: 'error',
        layerId,
        fieldId: f.id,
        code: RULES.FIELD_DUPLICATE_NAME,
        message: `Duplicate field name "${f.name}" in the same layer/type.`,
        messageNo: `Duplikat feltnavn «${f.name}» i samme lag/type.`,
      });
    }
    fieldNames.add(f.name);
  });

  fields.forEach(f => {
    const ft = f.fieldType;

    // Check for field name too long (PostgreSQL 63-char limit)
    if (f.name && f.name.length > 63) {
      issues.push({
        severity: 'warning',
        layerId,
        fieldId: f.id,
        code: RULES.FIELD_NAME_TOO_LONG,
        message: `Field "${f.name}" exceeds 63 characters. PostgreSQL will silently truncate it.`,
        messageNo: `Feltet «${f.name}» er lengre enn 63 tegn. PostgreSQL vil stille det.`,
      });
    }

    if (ft.kind === 'datatype-ref' && !ft.typeId) {
      issues.push({
        severity: 'error',
        layerId,
        fieldId: f.id,
        code: RULES.FIELD_DATATYPE_REF_EMPTY,
        message: `Field "${f.name}" has type "datatype-ref" but no type is selected.`,
        messageNo: `Feltet «${f.name}» er satt til datatype-referanse, men ingen type er valgt.`,
      });
    }

    if (ft.kind === 'feature-ref' && !ft.layerId) {
      issues.push({
        severity: 'error',
        layerId,
        fieldId: f.id,
        code: RULES.FIELD_FEATURE_REF_EMPTY,
        message: `Field "${f.name}" is a relation but no target layer is selected.`,
        messageNo: `Feltet «${f.name}» er en relasjon, men mållag er ikke valgt.`,
      });
    }

    if (ft.kind === 'feature-ref' && ft.layerId) {
      const targetLayer = allLayers.find(l => l.id === ft.layerId);

      // Check for hint: relation targeting non-spatial layer
      if (targetLayer && targetLayer.geometryType === 'None') {
        issues.push({
          severity: 'hint',
          layerId,
          fieldId: f.id,
          code: RULES.FIELD_REF_TO_NONSPATIAL,
          message: `Field "${f.name}" references a non-spatial (attribute-only) layer. This is valid but unusual.`,
          messageNo: `Feltet «${f.name}» refererer til et lag uten geometri. Dette er gyldig men uvanlig.`,
        });
      }

      if (ft.inverseFieldId && targetLayer) {
        const inverseField = targetLayer.properties.find(p => p.id === ft.inverseFieldId);
        if (!inverseField) {
          issues.push({
            severity: 'hint',
            layerId,
            fieldId: f.id,
            code: RULES.FIELD_FEATURE_REF_INVERSE_MISMATCH,
            message: `Field "${f.name}" declares an inverse field that no longer exists in the target layer.`,
            messageNo: `Feltet «${f.name}» har deklarert et invers-felt som ikke finnes i mållaget.`,
          });
        } else if (inverseField.fieldType.kind !== 'feature-ref') {
          issues.push({
            severity: 'hint',
            layerId,
            fieldId: f.id,
            code: RULES.FIELD_FEATURE_REF_INVERSE_MISMATCH,
            message: `Field "${f.name}": the declared inverse field "${inverseField.name}" is not a relation.`,
            messageNo: `Feltet «${f.name}»: det erklærte invers-feltet «${inverseField.name}» er ikke av type relasjon.`,
          });
        }
      }
    }

    // Check for missing shared enum reference
    if (ft.kind === 'codelist' && ft.mode === 'shared' && !ft.enumRef) {
      issues.push({
        severity: 'error',
        layerId,
        fieldId: f.id,
        code: RULES.FIELD_SHARED_ENUM_REF_MISSING,
        message: `Field "${f.name}" is a shared codelist but no enum is selected.`,
        messageNo: `Feltet «${f.name}» er en delt kodeliste, men ingen kodeliste er valgt.`,
      });
    } else if (ft.kind === 'codelist' && ft.mode === 'shared' && ft.enumRef) {
      const enumExists = sharedEnums.find(e => e.id === ft.enumRef);
      if (!enumExists) {
        issues.push({
          severity: 'error',
          layerId,
          fieldId: f.id,
          code: RULES.FIELD_SHARED_ENUM_REF_MISSING,
          message: `Field "${f.name}" references a shared codelist that no longer exists (ID: ${ft.enumRef}).`,
          messageNo: `Feltet «${f.name}» refererer til en kodeliste som ikke finnes (ID: ${ft.enumRef}).`,
        });
      }
    }

    if (ft.kind === 'geometry' && (f.multiplicity === '0..*' || f.multiplicity === '1..*')) {
      issues.push({
        severity: 'hint',
        layerId,
        fieldId: f.id,
        code: RULES.MULTIPLICITY_ARRAY_ON_GEOMETRY,
        message: `Field "${f.name}" is a geometry field with multiplicity > 1. Most databases do not support this.`,
        messageNo: `Feltet «${f.name}» er et geometrifelt med multiplisitet > 1. De fleste databaser støtter ikke dette.`,
      });
    }
  });

  return issues;
};

// ============================================================
// Validering av ett lag
// ============================================================

export const validateLayer = (layer: Layer, allLayers: Layer[], sharedTypes: SharedType[] = [], sharedEnums: any[] = []): ModelValidationIssue[] => {
  const issues: ModelValidationIssue[] = [];

  // Abstrakte lag har slakkere regler (de er maler, ikke faktiske tabeller)
  if (!layer.isAbstract) {
    // Warn if layer has no properties
    if (layer.properties.length === 0) {
      issues.push({
        severity: 'warning',
        layerId: layer.id,
        code: RULES.LAYER_NO_PROPERTIES,
        message: `Layer "${layer.name}" has no properties. An empty layer is likely a mistake.`,
        messageNo: `Laget «${layer.name}» har ingen egenskaper. Et tomt lag er sannsynligvis en feil.`,
      });
    }

    // Primary key as warning (best practice, not blocking)
    const hasPk = layer.properties.some(p => p.constraints?.isPrimaryKey);
    if (!hasPk) {
      issues.push({
        severity: 'warning',
        layerId: layer.id,
        code: RULES.LAYER_NO_PK,
        message: `Layer "${layer.name}" has no primary key field. Recommended for database export.`,
        messageNo: `Laget «${layer.name}» mangler primærnøkkel-felt. Anbefalt for databaseeksport.`,
      });
    }

    // Check for PK multiplicity issues (nullable or array PK is invalid)
    const pkField = layer.properties.find(p => p.constraints?.isPrimaryKey);
    if (pkField && (pkField.multiplicity === '0..1' || pkField.multiplicity === '0..*')) {
      issues.push({
        severity: 'warning',
        layerId: layer.id,
        code: RULES.LAYER_PK_MULTIPLICITY,
        message: `Layer "${layer.name}": primary key field "${pkField.name}" has invalid multiplicity (nullable or array).`,
        messageNo: `Laget «${layer.name}»: primærnøkkel-feltet «${pkField.name}» har ugyldig multiplisitet (nullable eller array).`,
      });
    }

    // Hint if PK is not an integer-like type
    if (pkField && pkField.fieldType.kind === 'primitive') {
      const baseType = pkField.fieldType.baseType;
      const validPkTypes = ['integer', 'bigint', 'serial', 'int', 'long', 'uuid'];
      if (!validPkTypes.includes(baseType)) {
        const typeNameEn = getTypeDisplayName(baseType, 'en');
        const typeNameNo = getTypeDisplayName(baseType, 'no');
        issues.push({
          severity: 'hint',
          layerId: layer.id,
          code: RULES.LAYER_PK_TYPE,
          message: `Layer "${layer.name}": primary key field uses type "${typeNameEn}". Integer types are recommended for auto-increment.`,
          messageNo: `Laget «${layer.name}»: primærnøkkel-feltet bruker type «${typeNameNo}». Heltallstyper anbefales for auto-increment.`,
        });
      }
    }

    // Warn if multiple primary key fields (composite PK)
    const pkCount = layer.properties.filter(p => p.constraints?.isPrimaryKey).length;
    if (pkCount > 1) {
      issues.push({
        severity: 'warning',
        layerId: layer.id,
        code: RULES.LAYER_MULTIPLE_PKS,
        message: `Layer "${layer.name}" has ${pkCount} primary key fields — this creates a composite primary key.`,
        messageNo: `Laget «${layer.name}» har ${pkCount} primærnøkkel-felt — dette skaper en sammensatt primærnøkkel.`,
      });
    }

    // Geometri-kolonne mangler navn (men geometritype er satt)
    if (layer.geometryType !== 'None' && !layer.geometryColumnName) {
      issues.push({
        severity: 'warning',
        layerId: layer.id,
        code: RULES.LAYER_NO_GEOM_COLUMN,
        message: `Layer "${layer.name}" has a geometry type set but no geometry column name.`,
        messageNo: `Laget «${layer.name}» har geometritype, men mangler geometrikolonne-navn.`,
      });
    }
  }

  // Hint: layer has no description
  if (!layer.description || layer.description.trim() === '') {
    issues.push({
      severity: 'hint',
      layerId: layer.id,
      code: RULES.LAYER_NO_DESCRIPTION,
      message: `Layer "${layer.name}" has no description. Consider adding documentation.`,
      messageNo: `Laget «${layer.name}» har ingen beskrivelse. Vurder å legge til dokumentasjon.`,
    });
  }

  // Abstrakt lag som ingen andre arver fra
  if (layer.isAbstract) {
    const hasChildren = allLayers.some(l => l.extends === layer.id);
    if (!hasChildren) {
      issues.push({
        severity: 'hint',
        layerId: layer.id,
        code: RULES.LAYER_ABSTRACT_UNUSED,
        message: `Layer "${layer.name}" is abstract but no layers inherit from it.`,
        messageNo: `Laget «${layer.name}» er abstrakt, men ingen andre lag arver fra det.`,
      });
    }
  }

  // Arv fra ukjent lag
  if (layer.extends) {
    const parent = allLayers.find(l => l.id === layer.extends);
    if (!parent) {
      issues.push({
        severity: 'error',
        layerId: layer.id,
        code: RULES.LAYER_EXTENDS_UNKNOWN,
        message: `Layer "${layer.name}" extends an unknown layer (ID: ${layer.extends}).`,
        messageNo: `Laget «${layer.name}» arver fra et ukjent lag (ID: ${layer.extends}).`,
      });
    }
  }

  // Felt-validering
  issues.push(...validateFields(layer.properties, allLayers, sharedTypes, sharedEnums, layer.id));

  return issues;
};

// ============================================================
// Validering av hele modellen
// ============================================================

export const validateModel = (model: DataModel): ModelValidationIssue[] => {
  const issues: ModelValidationIssue[] = [];
  const sharedTypes = model.sharedTypes || [];
  const sharedEnums = model.sharedEnums || [];

  // Check for duplicate layer names
  const layerNames = new Map<string, string[]>();
  model.layers.forEach(layer => {
    const name = layer.name || '(unnamed)';
    const ids = layerNames.get(name) || [];
    ids.push(layer.id);
    layerNames.set(name, ids);
  });

  layerNames.forEach((ids, name) => {
    if (ids.length > 1) {
      ids.forEach(id => {
        issues.push({
          severity: 'error',
          layerId: id,
          code: RULES.LAYER_DUPLICATE_NAME,
          message: `Layer name "${name}" is duplicated. Each layer must have a unique name.`,
          messageNo: `Lagnavnet «${name}» er duplisert. Hvert lag må ha et unikt navn.`,
        });
      });
    }
  });

  // Deep circular inheritance check using DFS
  model.layers.forEach(startLayer => {
    const visited = new Set<string>();
    let current: Layer | undefined = startLayer;

    while (current?.extends) {
      if (visited.has(current.id)) {
        issues.push({
          severity: 'error',
          layerId: startLayer.id,
          code: RULES.LAYER_EXTENDS_CIRCULAR_DEEP,
          message: `Circular inheritance detected in inheritance chain of "${startLayer.name}".`,
          messageNo: `Sirkulær arv oppdaget i arvekjeden til «${startLayer.name}».`,
        });
        break;
      }
      visited.add(current.id);
      current = model.layers.find(l => l.id === current!.extends);
    }
  });

  // Validate all layers
  model.layers.forEach(layer => {
    issues.push(...validateLayer(layer, model.layers, sharedTypes, sharedEnums));
  });

  // Validate SharedType properties
  (sharedTypes || []).forEach(st => {
    issues.push(...validateFields(st.properties, model.layers, sharedTypes, sharedEnums, `sharedtype:${st.id}`));
  });

  return issues;
};

// ============================================================
// Hjelper: gruppér issues etter lag-ID for rask oppslag i UI
// ============================================================

export const groupIssuesByLayer = (
  issues: ModelValidationIssue[]
): Map<string, ModelValidationIssue[]> => {
  const map = new Map<string, ModelValidationIssue[]>();
  issues.forEach(issue => {
    const key = issue.layerId || '__model__';
    const existing = map.get(key) || [];
    existing.push(issue);
    map.set(key, existing);
  });
  return map;
};
