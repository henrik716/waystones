export type AiProvider = 'claude' | 'gemini';

export interface AiConstraintSuggestion {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  required?: boolean;
  enumeration?: string[];
}

const PROVIDER_KEY = 'waystones-ai-provider';
const API_KEY_PREFIX = 'waystones-ai-key-';
const TRIAL_USES_KEY = 'waystones-ai-trial-uses';
export const MAX_TRIAL_USES = 10;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const GEMINI_MODEL = 'gemini-2.5-flash';
const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class AiKeyMissingError extends Error {
  constructor() {
    super('AI key not configured');
    this.name = 'AiKeyMissingError';
  }
}

export class AiAuthError extends Error {
  constructor() {
    super('Invalid API key');
    this.name = 'AiAuthError';
  }
}

export class AiRateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number = 60) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
    this.name = 'AiRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class AiNetworkError extends Error {
  constructor(message: string = 'Network error') {
    super(message);
    this.name = 'AiNetworkError';
  }
}

export function getProvider(): AiProvider {
  const saved = localStorage.getItem(PROVIDER_KEY);
  if (saved === 'claude' || saved === 'gemini') return saved;
  const hasUserKey = !!localStorage.getItem(API_KEY_PREFIX + 'claude') || !!localStorage.getItem(API_KEY_PREFIX + 'gemini');

  if (!hasUserKey && import.meta.env.VITE_DEFAULT_AI_KEY && getTrialUsesLeft() > 0) {
    const defaultProvider = import.meta.env.VITE_DEFAULT_AI_PROVIDER;
    if (defaultProvider === 'claude' || defaultProvider === 'gemini') {
      return defaultProvider;
    }
    if (import.meta.env.VITE_DEFAULT_AI_KEY.startsWith('sk-ant-')) {
      return 'claude';
    } else {
      return 'gemini';
    }
  }

  return 'claude';
}

export function setProvider(p: AiProvider): void {
  localStorage.setItem(PROVIDER_KEY, p);
}

export function getApiKey(p?: AiProvider): string | null {
  return localStorage.getItem(API_KEY_PREFIX + (p ?? getProvider()));
}

export function hasApiKey(p?: AiProvider): boolean {
  if (getApiKey(p)) return true;
  if (import.meta.env.VITE_DEFAULT_AI_KEY && getTrialUsesLeft() > 0) return true;
  return false;
}

export function saveApiKey(key: string, p?: AiProvider): void {
  localStorage.setItem(API_KEY_PREFIX + (p ?? getProvider()), key.trim());
  // Dispatch custom event to notify components about the API key change
  window.dispatchEvent(new CustomEvent('ai-key-changed', {
    detail: { provider: p ?? getProvider(), hasKey: true }
  }));
}

export function clearApiKey(p?: AiProvider): void {
  localStorage.removeItem(API_KEY_PREFIX + (p ?? getProvider()));
  // Dispatch custom event to notify components about the API key change
  window.dispatchEvent(new CustomEvent('ai-key-changed', {
    detail: { provider: p ?? getProvider(), hasKey: false }
  }));
}

export function getTrialUsesLeft(): number {
  const usesInfo = localStorage.getItem(TRIAL_USES_KEY);
  if (!usesInfo) return MAX_TRIAL_USES;
  const uses = parseInt(usesInfo, 10);
  if (isNaN(uses)) return MAX_TRIAL_USES;
  return Math.max(0, MAX_TRIAL_USES - uses);
}

export function incrementTrialUses(): void {
  const usesInfo = localStorage.getItem(TRIAL_USES_KEY);
  const currentUses = usesInfo ? parseInt(usesInfo, 10) || 0 : 0;
  const newUses = currentUses + 1;
  localStorage.setItem(TRIAL_USES_KEY, newUses.toString());
  window.dispatchEvent(new CustomEvent('ai-trial-updated', {
    detail: { usesLeft: Math.max(0, MAX_TRIAL_USES - newUses) }
  }));
}

async function callAI(system: string, user: string): Promise<string> {
  const provider = getProvider();
  let key = getApiKey();
  let isTrial = false;

  if (!key) {
    const defaultKey = import.meta.env.VITE_DEFAULT_AI_KEY;
    if (defaultKey && getTrialUsesLeft() > 0) {
      key = defaultKey;
      isTrial = true;
      // When relying on the trial key, the provider is dictated by `getProvider()`.
    } else {
      throw new AiKeyMissingError();
    }
  }

  try {
    if (provider === 'claude') {
      const res = await fetch(CLAUDE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 512,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });

      if (!res.ok) {
        if (res.status === 401) throw new AiAuthError();
        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after');
          throw new AiRateLimitError(retryAfter ? parseInt(retryAfter) : 60);
        }
        if (res.status >= 500) throw new AiNetworkError(`Server error: ${res.status}`);
        throw new Error(`API error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const result = data.content?.[0]?.text?.trim() ?? '';
      if (!result) throw new Error('AI returned empty response');
      if (isTrial) incrementTrialUses();
      return result;

    } else {
      const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
        }),
      });

      if (!res.ok) {
        if (res.status === 400 || res.status === 403) throw new AiAuthError();
        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after');
          throw new AiRateLimitError(retryAfter ? parseInt(retryAfter) : 60);
        }
        if (res.status >= 500) throw new AiNetworkError(`Server error: ${res.status}`);
        throw new Error(`API error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      if (!result) throw new Error('AI returned empty response');
      if (isTrial) incrementTrialUses();
      return result;
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AiNetworkError('Network connection failed');
    }
    throw error;
  }
}

export async function generatePropertyDescription(params: {
  fieldName: string;
  fieldType: string;
  layerName: string;
  lang: string;
}): Promise<string> {
  const langInstruction = params.lang === 'no' ? 'Svar kun på norsk.' : 'Reply in English only.';
  const system = `You are a geospatial data modeler. Generate a concise, professional field description for use in a geographic data model (1-2 sentences max). ${langInstruction} Output ONLY the description text, no quotes, no preamble.`;
  const user = `Layer: "${params.layerName}"\nField name: "${params.fieldName}"\nData type: ${params.fieldType}`;
  return callAI(system, user);
}

export async function suggestFieldType(params: {
  fieldName: string;
  description: string;
  lang: string;
}): Promise<string> {
  const validTypes = 'string, number, integer, boolean, date, date-time, geometry, codelist, json, object, array';
  const system = `You are a geospatial data modeler. Given a field name and optional description, choose the single most appropriate data type from this exact list: ${validTypes}. Output ONLY the type keyword (e.g. "integer"). No explanation, no punctuation.`;
  const user = `Field name: "${params.fieldName}"\nDescription: "${params.description || '(none)'}"`;
  return callAI(system, user);
}

export async function inferConstraints(params: {
  fieldName: string;
  fieldType: string;
  description: string;
  lang: string;
}): Promise<AiConstraintSuggestion> {
  const system = `You are a geospatial data modeler. Given a field's name, type, and description, suggest applicable constraints as a JSON object. Only include keys that are clearly relevant. Valid keys: min (number), max (number), minLength (number), maxLength (number), pattern (regex string), required (boolean), enumeration (array of strings). Output ONLY valid JSON. No markdown, no explanation.`;
  const user = `Field name: "${params.fieldName}"\nType: ${params.fieldType}\nDescription: "${params.description || '(none)'}"`;
  const raw = await callAI(system, user);
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as AiConstraintSuggestion;
  } catch {
    throw new Error('AI returned invalid JSON for constraints');
  }
}

export async function suggestTheme(params: {
  modelName: string;
  layers: Array<{ name: string; properties: Array<{ name: string; type: string }> }>;
  lang: string;
  validThemes: Record<string, string>;
}): Promise<string> {
  const themeList = Object.entries(params.validThemes).map(([k, v]) => `${k}: ${v}`).join('\n');
  const layerSummary = params.layers.map(l => {
    const topProps = l.properties.slice(0, 4).map(p => p.name).join(', ');
    return `- ${l.name}: ${topProps || '(no properties)'}`;
  }).join('\n');
  const system = `You are a geospatial metadata specialist. Given a dataset name and its layers, choose the single most appropriate INSPIRE/GeoDCAT theme from this list:\n${themeList}\n\nOutput ONLY the two-letter key (e.g. "tn"). No explanation, no punctuation.`;
  const user = `Dataset: "${params.modelName}"\nLayers:\n${layerSummary}`;
  return callAI(system, user);
}

export async function suggestKeywords(params: {
  modelName: string;
  layers: Array<{ name: string; properties: Array<{ name: string; type: string }> }>;
  lang: string;
}): Promise<string[]> {
  const langInstruction = params.lang === 'no' ? 'Svar kun på norsk.' : 'Reply in English only.';
  const layerSummary = params.layers.map(l => {
    const topProps = l.properties.slice(0, 4).map(p => p.name).join(', ');
    return `- ${l.name}: ${topProps || '(no properties)'}`;
  }).join('\n');
  const system = `You are a geospatial metadata specialist. Given a dataset name and its layers, suggest 5-8 relevant search keywords/tags. ${langInstruction} Output ONLY a JSON array of strings (e.g. ["roads","transport"]). No explanation, no markdown.`;
  const user = `Dataset: "${params.modelName}"\nLayers:\n${layerSummary}`;
  const raw = await callAI(system, user);
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as string[];
  } catch {
    return raw.split(',').map(s => s.replace(/["'\[\]]/g, '').trim()).filter(Boolean);
  }
}

export async function generateLayerDescription(params: {
  layerName: string;
  geometryType: string;
  properties: Array<{ name: string; type: string }>;
  lang: string;
}): Promise<string> {
  const langInstruction = params.lang === 'no' ? 'Svar kun på norsk.' : 'Reply in English only.';
  const propsSummary = params.properties.slice(0, 8).map(p => `${p.name} (${p.type})`).join(', ');
  const system = `You are a geospatial metadata specialist. Write a concise, professional layer description for use in a geographic data model (2-3 sentences max). Describe what this layer contains, its purpose, and key attributes. ${langInstruction} Output ONLY the description text, no quotes, no preamble.`;
  const user = `Layer name: "${params.layerName}"\nGeometry type: ${params.geometryType}\nProperties: ${propsSummary || '(no properties)'}`;
  return callAI(system, user);
}

export async function generateModelAbstract(params: {
  modelName: string;
  layers: Array<{ name: string; properties: Array<{ name: string; type: string }> }>;
  lang: string;
}): Promise<string> {
  const langInstruction = params.lang === 'no' ? 'Svar kun på norsk.' : 'Reply in English only.';
  const layerSummary = params.layers.map(l => {
    const topProps = l.properties.slice(0, 6).map(p => `${p.name} (${p.type})`).join(', ');
    return `- ${l.name}: ${topProps || '(no properties)'}`;
  }).join('\n');
  const system = `You are a geospatial metadata specialist. Write a GeoDCAT-ready abstract paragraph for the dataset described below (3-5 sentences). Describe what the dataset contains, its geographic purpose, and key attributes. ${langInstruction} Output ONLY the abstract text, no quotes, no preamble.`;
  const user = `Dataset name: "${params.modelName}"\nLayers:\n${layerSummary}`;
  return callAI(system, user);
}
