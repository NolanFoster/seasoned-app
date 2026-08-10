import type { CulinaryProfile, CulinaryProfileInput, ConsentFlags, NutritionGoals } from '../types/database';

export const DEFAULT_PROFILE: Omit<CulinaryProfile, 'user_id' | 'created_at' | 'updated_at'> = {
  diet_tags: [],
  hard_allergens: [],
  soft_avoids: [],
  cuisine_likes: [],
  cuisine_dislikes: [],
  spice_level: 2,
  skill_level: 'intermediate',
  default_servings: 4,
  max_cook_time_min: 60,
  equipment: [],
  nutrition_goals: { focus: null, targets: {} },
  units_pref: 'us',
  exclude_ingredients: [],
  notes_freeform: '',
  consent_flags: { learn_from_activity: false, share_anon_evals: false },
};

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const UNITS = ['us', 'metric'] as const;
const ALLERGEN_ALIASES: Record<string, string> = {
  dairy: 'milk',
  milk: 'milk',
  egg: 'eggs',
  eggs: 'eggs',
  seafood: 'shellfish',
  shellfish: 'shellfish',
  'tree nuts': 'tree_nuts',
  'tree nut': 'tree_nuts',
  treenuts: 'tree_nuts',
  peanut: 'peanuts',
  peanuts: 'peanuts',
  gluten: 'wheat',
  wheat: 'wheat',
  soybeans: 'soy',
  soy: 'soy',
  sesame: 'sesame',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeList(value: unknown, aliases: Record<string, string> = {}): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!tag) continue;
    const normalized = aliases[tag] || aliases[tag.replace(/_/g, ' ')] || tag;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result.slice(0, 100);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeNutritionGoals(value: unknown): NutritionGoals {
  const source = isRecord(value) ? value : {};
  const rawTargets = isRecord(source.targets) ? source.targets : {};
  const targets: Record<string, number> = {};
  for (const key of ['protein_g', 'sodium_mg', 'calories_min', 'calories_max']) {
    const parsed = Number(rawTargets[key]);
    if (Number.isFinite(parsed) && parsed >= 0) targets[key] = Math.round(parsed);
  }
  return {
    focus: typeof source.focus === 'string' && source.focus.trim()
      ? source.focus.trim().toLowerCase().replace(/[\s-]+/g, '_')
      : null,
    targets,
  };
}

function normalizeConsentFlags(value: unknown): ConsentFlags {
  const source = isRecord(value) ? value : {};
  return {
    learn_from_activity: source.learn_from_activity === true,
    share_anon_evals: source.share_anon_evals === true,
  };
}

export function normalizeCulinaryProfile(
  input: CulinaryProfileInput | Record<string, unknown> = {},
  base: Partial<CulinaryProfile> = DEFAULT_PROFILE,
): Omit<CulinaryProfile, 'user_id' | 'created_at' | 'updated_at'> {
  const source = isRecord(input) ? input : {};
  const fallback = { ...DEFAULT_PROFILE, ...base };
  const pick = (snake: string, camel: string, defaultValue: unknown) =>
    source[snake] !== undefined ? source[snake] : source[camel] !== undefined ? source[camel] : defaultValue;
  const skill = pick('skill_level', 'skillLevel', fallback.skill_level);
  const units = pick('units_pref', 'unitsPref', fallback.units_pref);

  return {
    diet_tags: normalizeList(pick('diet_tags', 'dietTags', fallback.diet_tags)),
    hard_allergens: normalizeList(pick('hard_allergens', 'hardAllergens', fallback.hard_allergens), ALLERGEN_ALIASES),
    soft_avoids: normalizeList(pick('soft_avoids', 'softAvoids', fallback.soft_avoids)),
    cuisine_likes: normalizeList(pick('cuisine_likes', 'cuisineLikes', fallback.cuisine_likes)),
    cuisine_dislikes: normalizeList(pick('cuisine_dislikes', 'cuisineDislikes', fallback.cuisine_dislikes)),
    spice_level: boundedNumber(pick('spice_level', 'spiceLevel', fallback.spice_level), 2, 0, 5),
    skill_level: SKILL_LEVELS.includes(skill as typeof SKILL_LEVELS[number]) ? skill as typeof SKILL_LEVELS[number] : 'intermediate',
    default_servings: boundedNumber(pick('default_servings', 'defaultServings', fallback.default_servings), 4, 1, 24),
    max_cook_time_min: boundedNumber(pick('max_cook_time_min', 'maxCookTimeMin', fallback.max_cook_time_min), 60, 5, 720),
    equipment: normalizeList(pick('equipment', 'equipment', fallback.equipment)),
    nutrition_goals: normalizeNutritionGoals(pick('nutrition_goals', 'nutritionGoals', fallback.nutrition_goals)),
    units_pref: UNITS.includes(units as typeof UNITS[number]) ? units as typeof UNITS[number] : 'us',
    exclude_ingredients: normalizeList(pick('exclude_ingredients', 'excludeIngredients', fallback.exclude_ingredients)),
    notes_freeform: typeof pick('notes_freeform', 'notesFreeform', fallback.notes_freeform) === 'string'
      ? String(pick('notes_freeform', 'notesFreeform', fallback.notes_freeform)).trim().slice(0, 500)
      : '',
    consent_flags: normalizeConsentFlags(pick('consent_flags', 'consentFlags', fallback.consent_flags)),
  };
}

export function profileFromRow(row: Record<string, unknown>): Omit<CulinaryProfile, 'user_id' | 'created_at' | 'updated_at'> & Pick<CulinaryProfile, 'user_id' | 'created_at' | 'updated_at'> {
  const json = (value: unknown, fallback: unknown) => {
    if (typeof value !== 'string') return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  };
  return {
    ...normalizeCulinaryProfile({
      diet_tags: json(row.diet_tags, []),
      hard_allergens: json(row.hard_allergens, []),
      soft_avoids: json(row.soft_avoids, []),
      cuisine_likes: json(row.cuisine_likes, []),
      cuisine_dislikes: json(row.cuisine_dislikes, []),
      spice_level: row.spice_level,
      skill_level: row.skill_level,
      default_servings: row.default_servings,
      max_cook_time_min: row.max_cook_time_min,
      equipment: json(row.equipment, []),
      nutrition_goals: json(row.nutrition_goals, {}),
      units_pref: row.units_pref,
      exclude_ingredients: json(row.exclude_ingredients, []),
      notes_freeform: row.notes_freeform,
      consent_flags: json(row.consent_flags, {}),
    }),
    user_id: String(row.user_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function profileValues(profile: Omit<CulinaryProfile, 'user_id' | 'created_at' | 'updated_at'>): unknown[] {
  return [
    JSON.stringify(profile.diet_tags),
    JSON.stringify(profile.hard_allergens),
    JSON.stringify(profile.soft_avoids),
    JSON.stringify(profile.cuisine_likes),
    JSON.stringify(profile.cuisine_dislikes),
    profile.spice_level,
    profile.skill_level,
    profile.default_servings,
    profile.max_cook_time_min,
    JSON.stringify(profile.equipment),
    JSON.stringify(profile.nutrition_goals),
    profile.units_pref,
    JSON.stringify(profile.exclude_ingredients),
    profile.notes_freeform,
    JSON.stringify(profile.consent_flags),
  ];
}

export function validateCulinaryProfileInput(input: unknown): string[] {
  if (!isRecord(input)) return ['Profile must be a JSON object'];
  const errors: string[] = [];
  const lists = ['diet_tags', 'hard_allergens', 'soft_avoids', 'cuisine_likes', 'cuisine_dislikes', 'equipment', 'exclude_ingredients'];
  for (const field of lists) {
    const value = input[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      errors.push(`${field} must be an array of strings`);
    }
  }
  const numbers: Record<string, [number, number]> = {
    spice_level: [0, 5], default_servings: [1, 24], max_cook_time_min: [5, 720],
  };
  for (const [field, [min, max]] of Object.entries(numbers)) {
    const value = input[field];
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max)) {
      errors.push(`${field} must be between ${min} and ${max}`);
    }
  }
  if (input.skill_level !== undefined && !SKILL_LEVELS.includes(input.skill_level as typeof SKILL_LEVELS[number])) {
    errors.push('skill_level must be beginner, intermediate, or advanced');
  }
  if (input.units_pref !== undefined && !UNITS.includes(input.units_pref as typeof UNITS[number])) {
    errors.push('units_pref must be us or metric');
  }
  if (input.notes_freeform !== undefined && typeof input.notes_freeform !== 'string') errors.push('notes_freeform must be a string');
  for (const field of ['nutrition_goals', 'consent_flags']) {
    if (input[field] !== undefined && !isRecord(input[field])) errors.push(`${field} must be an object`);
  }
  return errors;
}
