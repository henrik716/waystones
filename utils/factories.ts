import { DataModel, Layer, Field, CodeValue, SharedType, SharedEnum } from '../types';
import { COLORS } from '../constants';

export const uid = () => Math.random().toString(36).slice(2, 9);

export const createEmptyCodeValue = (): CodeValue => ({
  id: uid(),
  code: "",
  label: "",
  description: ""
});

export const createEmptyField = (): Field => ({
  id: uid(),
  name: "",
  title: "",
  description: "",
  multiplicity: '0..1',
  defaultValue: "",
  constraints: {},
  fieldType: { kind: 'primitive', baseType: 'string' },
});

/** @deprecated Use createEmptyField instead */
export const createEmptyProperty = createEmptyField;

export const createEmptyLayer = (name = ""): Layer => ({
  id: uid(),
  name: name || "",
  description: "",
  properties: [],
  geometryType: "Polygon",
  geometryColumnName: "geom",
  style: {
    type: 'simple',
    simpleColor: COLORS.primary,
    categorizedColors: {},
    pointSize: 8,
    pointIcon: 'circle',
    lineWidth: 2,
    lineDash: 'solid',
    fillOpacity: 0.5,
    hatchStyle: 'solid',
    hatchThickness: 1,
    hatchSpacing: 6
  }
});

export const createEmptySharedType = (name = ""): SharedType => ({
  id: uid(),
  name: name || "New Type",
  description: "",
  properties: []
});

export const createEmptySharedEnum = (): SharedEnum => ({
  id: uid(),
  name: '',
  description: '',
  values: []
});

export const createEmptyModel = (): DataModel => ({
  id: uid(),
  name: "",
  namespace: "",
  description: "",
  version: "1.0.0",
  layers: [createEmptyLayer("Layer 1")],
  sharedTypes: [],
  sharedEnums: [],
  crs: "EPSG:4326",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
