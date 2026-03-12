import { DataModel, Layer, ModelProperty, CodeValue, SharedType } from '../types';
import { COLORS } from '../constants';

export const uid = () => Math.random().toString(36).slice(2, 9);

export const createEmptyCodeValue = (): CodeValue => ({
  id: uid(),
  code: "",
  label: "",
  description: ""
});

export const createEmptyProperty = (): ModelProperty => ({
  id: uid(),
  name: "",
  title: "",
  type: "string",
  required: false,
  description: "",
  defaultValue: "",
  codelistMode: "inline",
  codelistUrl: "",
  codelistValues: [],
  constraints: {},
  subProperties: []
});

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
  name: name || "Ny Type",
  description: "",
  properties: []
});

export const createEmptyModel = (): DataModel => ({
  id: uid(),
  name: "",
  namespace: "",
  description: "",
  version: "1.0.0",
  layers: [createEmptyLayer("Lag 1")],
  sharedTypes: [],
  crs: "EPSG:4326",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
