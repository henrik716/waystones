import { DataModel } from '../../types';
import { hexToRgb } from '../colorUtils';
import { generateBaseHtml } from './templates/base';

export { generateBaseHtml } from './templates/base';
export { generateCollectionsHtml } from './templates/collections';
export { generateItemsHtml } from './templates/items';
export { generateCollectionHtml } from './templates/collection';
export { generateIndexHtml } from './templates/index';
export { generateItemHtml } from './templates/item';

/**
 * Toggle this to true to invert the colors of the Waystones logo and favicon 
 * (White background with Indigo icon). Set to false for the original 
 * Indigo background with White icon.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const INVERT_BRAND_COLORS = true;

export function deriveBrandColor(_model: DataModel): string {
  // Always use Waystones's primary indigo brand color for the API interface
  // rather than inheriting random feature layer styling.
  return '#4338ca'; // Waystones Indigo
}

function darken(hex: string, amount = 30): string {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r - amount)}${toHex(g - amount)}${toHex(b - amount)}`;
}

export function generatePygeoapiTheme(model: DataModel): string {
  const brand = deriveBrandColor(model);
  const brandDark = darken(brand);
  return generateBaseHtml(brand, brandDark, model.name);
}
