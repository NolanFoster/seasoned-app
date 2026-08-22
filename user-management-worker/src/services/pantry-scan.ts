export const PANTRY_SCAN_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
export const MAX_PANTRY_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PANTRY_SCAN_ITEMS = 50;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PANTRY_LOCATIONS = new Set(['fridge', 'freezer', 'pantry', 'other']);
const MAX_NAME_LENGTH = 200;
const MAX_UNIT_LENGTH = 40;
const MAX_TAG_LENGTH = 40;

export const PANTRY_SCAN_PROMPT = `You identify food items in a refrigerator, freezer, pantry, or kitchen shelf photo.
Return ONLY valid JSON with this shape: {"items":[{"name":"string","quantity":number|null,"unit":"string|null","location":"fridge|freezer|pantry|other","confidence":number}]}
Include only food or cooking ingredients that are visibly present. Do not infer hidden items, brands, expiration dates, allergens, or safety. Quantity is an estimate only; use null when it cannot be read. Use confidence from 0 to 1. Keep names short and specific. If no items are visible, return {"items":[]}.`;

export interface PantryScanFile {
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface PantryScanAI {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface PantryScanItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  location: 'fridge' | 'freezer' | 'pantry' | 'other';
  tags: string[];
  confidence: number;
  needsReview: true;
}

export function validatePantryPhoto(file: unknown): string[] {
  if (!file || typeof file !== 'object') return ['Choose a pantry photo first'];
  const candidate = file as Partial<PantryScanFile>;
  const size = Number(candidate.size);
  if (!Number.isFinite(size) || size <= 0) return ['The pantry photo is empty'];
  if (size > MAX_PANTRY_PHOTO_BYTES) return ['Pantry photos must be 10 MB or smaller'];
  if (typeof candidate.type !== 'string' || !ALLOWED_IMAGE_TYPES.has(candidate.type.toLowerCase())) {
    return ['Use a JPG, PNG, or WebP pantry photo'];
  }
  if (typeof candidate.arrayBuffer !== 'function') return ['The pantry photo could not be read'];
  return [];
}

function responseText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  const object = value as Record<string, unknown>;
  if (Array.isArray(object.items) || Array.isArray(object.ingredients)) return JSON.stringify(value);
  for (const key of ['description', 'response', 'text', 'output', 'output_text', 'content', 'result']) {
    const nested = object[key];
    if (typeof nested === 'string') return nested;
    if (nested && typeof nested === 'object') {
      const text = responseText(nested);
      if (text) return text;
    }
  }
  return '';
}

function jsonFromResponse(text: string): unknown {
  const withoutFence = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!withoutFence) return null;
  try {
    return JSON.parse(withoutFence);
  } catch {
    // Models occasionally add a short sentence around otherwise valid JSON.
    const starts = [withoutFence.indexOf('{'), withoutFence.indexOf('[')].filter((index) => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(withoutFence.lastIndexOf('}'), withoutFence.lastIndexOf(']'));
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(withoutFence.slice(start, end + 1)); } catch { return null; }
  }
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function confidenceValue(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed === null) return 0.5;
  const normalized = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, normalized));
}

function quantityValue(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function candidateArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return Array.isArray(object.items) ? object.items : Array.isArray(object.ingredients) ? object.ingredients : [];
}

function normalizedCandidate(value: unknown): PantryScanItem | null {
  if (!value || typeof value !== 'object') return null;
  const object = value as Record<string, unknown>;
  const rawName = object.name ?? object.item ?? object.ingredient;
  if (typeof rawName !== 'string') return null;
  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  if (!name) return null;
  const rawLocation = typeof object.location === 'string' ? object.location.toLowerCase() : '';
  const location = PANTRY_LOCATIONS.has(rawLocation) ? rawLocation as PantryScanItem['location'] : 'other';
  const rawUnit = object.unit;
  const unit = typeof rawUnit === 'string' && rawUnit.trim() ? rawUnit.trim().replace(/\s+/g, ' ').slice(0, MAX_UNIT_LENGTH) : null;
  const rawTags = Array.isArray(object.tags) ? object.tags : [];
  const tags = rawTags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase().slice(0, MAX_TAG_LENGTH))
    .filter(Boolean)
    .slice(0, 10);
  return {
    name,
    quantity: quantityValue(object.quantity),
    unit,
    location,
    tags,
    confidence: confidenceValue(object.confidence),
    needsReview: true,
  };
}

export function parsePantryScanResponse(value: unknown): PantryScanItem[] {
  const parsed = typeof value === 'string' ? jsonFromResponse(value) : value;
  const items = candidateArray(parsed)
    .map(normalizedCandidate)
    .filter((item): item is PantryScanItem => item !== null);
  const deduped = new Map<string, PantryScanItem>();
  for (const item of items) {
    const key = `${item.location}:${item.name.toLocaleLowerCase()}`;
    const previous = deduped.get(key);
    if (!previous || item.confidence > previous.confidence) deduped.set(key, item);
  }
  return [...deduped.values()].slice(0, MAX_PANTRY_SCAN_ITEMS);
}

export async function detectPantryItems(file: PantryScanFile, ai: PantryScanAI): Promise<PantryScanItem[]> {
  const errors = validatePantryPhoto(file);
  if (errors.length > 0) throw new Error(errors[0]);
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const response = await ai.run(PANTRY_SCAN_MODEL, {
    image: bytes,
    prompt: PANTRY_SCAN_PROMPT,
    max_tokens: 1024,
  });
  return parsePantryScanResponse(responseText(response));
}
