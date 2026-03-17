import { DataModel, Layer, Field, SharedType } from '../types';

export type ValidationSeverity = 'error' | 'warning';

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
  FIELD_DUPLICATE_NAME: 'FIELD_DUPLICATE_NAME',
  FIELD_DATATYPE_REF_EMPTY: 'FIELD_DATATYPE_REF_EMPTY',
  FIELD_FEATURE_REF_EMPTY: 'FIELD_FEATURE_REF_EMPTY',
  FIELD_FEATURE_REF_INVERSE_MISMATCH: 'FIELD_FEATURE_REF_INVERSE_MISMATCH',
  FIELD_SHARED_ENUM_REF_MISSING: 'FIELD_SHARED_ENUM_REF_MISSING',
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

    if (ft.kind === 'feature-ref' && ft.inverseFieldId && ft.layerId) {
      const targetLayer = allLayers.find(l => l.id === ft.layerId);
      if (targetLayer) {
        const inverseField = targetLayer.properties.find(p => p.id === ft.inverseFieldId);
        if (!inverseField) {
          issues.push({
            severity: 'warning',
            layerId,
            fieldId: f.id,
            code: RULES.FIELD_FEATURE_REF_INVERSE_MISMATCH,
            message: `Field "${f.name}" declares an inverse field that no longer exists in the target layer.`,
            messageNo: `Feltet «${f.name}» har deklarert et invers-felt som ikke finnes i mållaget.`,
          });
        } else if (inverseField.fieldType.kind !== 'feature-ref') {
          issues.push({
            severity: 'warning',
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
        severity: 'warning',
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
    // Krav om primærnøkkel (minst ett felt med isPrimaryKey)
    const hasPk = layer.properties.some(p => p.constraints?.isPrimaryKey);
    if (!hasPk) {
      issues.push({
        severity: 'error',
        layerId: layer.id,
        code: RULES.LAYER_NO_PK,
        message: `Layer "${layer.name}" has no primary key field. Add a field with isPrimaryKey = true.`,
        messageNo: `Laget «${layer.name}» mangler primærnøkkel-felt. Legg til et felt med isPrimaryKey = true.`,
      });
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

  // Abstrakt lag som ingen andre arver fra
  if (layer.isAbstract) {
    const hasChildren = allLayers.some(l => l.extends === layer.id);
    if (!hasChildren) {
      issues.push({
        severity: 'warning',
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
