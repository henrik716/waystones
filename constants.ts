export { i18n } from './i18n';
export { uid, createEmptyCodeValue, createEmptyProperty, createEmptyLayer, createEmptySharedType, createEmptyModel } from './utils/factories';

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

export const TYPE_CONFIG = {
  string: { color: "#3B82F6", bg: "#EFF6FF", icon: "Aa" },
  number: { color: "#F59E0B", bg: "#FEF3C7", icon: "#" },
  integer: { color: "#F59E0B", bg: "#FEF3C7", icon: "#" },
  boolean: { color: "#A855F7", bg: "#F3E8FF", icon: "⊙" },
  date: { color: "#10B981", bg: "#ECFDF5", icon: "▦" },
  geometry: { color: COLORS.primary, bg: COLORS.primaryLight, icon: "◈" },
  codelist: { color: "#0EA5E9", bg: "#E0F2FE", icon: "≡" },
  json: { color: "#6366F1", bg: "#EEF2FF", icon: "{ }" },
  relation: { color: "#F43F5E", bg: "#FFF1F2", icon: "🔗" },
  object: { color: "#EC4899", bg: "#FDF2F8", icon: "{...}" },
  array: { color: "#8B5CF6", bg: "#FAF5FF", icon: "[ ]" },
  shared_type: { color: "#D946EF", bg: "#FDF4FF", icon: "❖" },
};
