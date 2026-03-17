export { i18n } from './i18n';
export { uid, createEmptyCodeValue, createEmptyProperty, createEmptyField, createEmptyLayer, createEmptySharedType, createEmptyModel } from './utils/factories';

export const COLORS = {
  primary: "#6366F1", // Indigo 500
  primaryDark: "#4338CA", // Indigo 700
  primaryLight: "#EEF2FF", // Indigo 50
  blue: "#1A4B8C",
  blueLight: "#E6F0FA",
  green: "#1B6B4A",
  amber: "#D97706",
  danger: "#DC2626",
};

import type { FieldKind } from './types';

export const TYPE_CONFIG: Record<FieldKind, { color: string; bg: string; icon: string }> = {
  'primitive':       { color: "#3B82F6", bg: "#EFF6FF", icon: "Aa" },
  'codelist':        { color: "#0EA5E9", bg: "#E0F2FE", icon: "≡" },
  'geometry':        { color: COLORS.primary, bg: COLORS.primaryLight, icon: "◈" },
  'feature-ref':     { color: "#F43F5E", bg: "#FFF1F2", icon: "🔗" },
  'datatype-inline': { color: "#EC4899", bg: "#FDF2F8", icon: "{...}" },
  'datatype-ref':    { color: "#D946EF", bg: "#FDF4FF", icon: "❖" },
};

// More specific config for primitive baseTypes (used in UI for finer-grained icons)
export const PRIMITIVE_TYPE_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  'string':  { color: "#3B82F6", bg: "#EFF6FF", icon: "Aa" },
  'number':  { color: "#F59E0B", bg: "#FEF3C7", icon: "#" },
  'integer': { color: "#F59E0B", bg: "#FEF3C7", icon: "#" },
  'boolean': { color: "#A855F7", bg: "#F3E8FF", icon: "⊙" },
  'date':    { color: "#10B981", bg: "#ECFDF5", icon: "▦" },
  'date-time': { color: "#059669", bg: "#D1FAE5", icon: "⏱" },
  'json':    { color: "#6366F1", bg: "#EEF2FF", icon: "{ }" },
};

/** Get the visual config for a field, using primitive sub-config when applicable */
export const getFieldConfig = (fieldType: { kind: string; baseType?: string }) => {
  if (fieldType.kind === 'primitive' && fieldType.baseType && PRIMITIVE_TYPE_CONFIG[fieldType.baseType]) {
    return PRIMITIVE_TYPE_CONFIG[fieldType.baseType];
  }
  return TYPE_CONFIG[fieldType.kind as FieldKind] || TYPE_CONFIG['primitive'];
};

import {
  MapPin, GitCommit, Square, Hash, Shapes, LayoutList, Package, Database
} from 'lucide-react';

export const COMMON_CRS = [
  { code: 'EPSG:4326', name: 'WGS 84 (Global)' },
  { code: 'EPSG:3857', name: 'Web Mercator (Online)' },
  { code: 'EPSG:25832', name: 'EUREF89 UTM 32N (Sør)' },
  { code: 'EPSG:25833', name: 'EUREF89 UTM 33N (Hele)' },
  { code: 'EPSG:25835', name: 'EUREF89 UTM 35N (Øst)' },
  { code: 'EPSG:4258', name: 'ETRS89 (Europa)' },
];

export const GEOM_ICONS: Record<string, any> = {
  'Point': MapPin,
  'LineString': GitCommit,
  'Polygon': Square,
  'MultiPoint': Hash,
  'MultiLineString': Shapes,
  'MultiPolygon': LayoutList,
  'GeometryCollection': Package,
  'None': Database // Brukes for atributtabeller
};
