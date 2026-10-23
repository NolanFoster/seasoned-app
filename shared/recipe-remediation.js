/**
 * Pure helpers for bounded, deterministic recipe gate remediation.
 *
 * This module has no worker bindings, model client, network calls, logging, or
 * profile inference. The deterministic safety gates remain the approver; these
 * helpers only describe violations and propose a small set of graph-checked
 * edits for the worker to validate again.
 */
import {
  analyzeRecipeAllergens,
  detectAllergens,
  normalizeAllergenList,
} from './allergen-graph.js';
import {
  analyzeProcessSafety,
  PROCESS_SAFETY_POLICIES,
} from './food-process-safety.js';

export const RECIPE_REMEDIATION_MODEL_ID = 'recipe-remediation-v1';
export const RECIPE_REMEDIATION_FLAG = 'RECIPE_REMEDIATION_V1';
export const MAX_RECIPE_REMEDIATION_ATTEMPTS = 2;

const INGREDIENT_FIELDS = ['ingredients', 'sourceIngredients', 'recipeIngredient'];
const INSTRUCTION_FIELDS = ['instructions', 'steps', 'directions', 'recipeInstructions'];
const NAME_FIELDS = ['name', 'title', 'recipeName'];
const TEXT_FIELDS = ['name', 'text', 'ingredient', 'original', 'step'];

// These are finite, intentionally conservative edits rather than model-invented
// substitutions. Every candidate is checked against the allergen graph at the
// point where a move is proposed; an unrecognized/custom profile allergen fails
// closed. This is not a guarantee for allergies absent from the graph.
const GRAPH_SAFE_REPLACEMENTS = Object.freeze({
  milk: [
    { terms: ['butter', 'ghee'], replacement: 'olive oil' },
    { terms: ['milk'], replacement: 'oat milk' },
  ],
  eggs: [{ terms: ['egg', 'eggs'], replacement: 'ground flaxseed' }],
  fish: [{ terms: ['fish', 'anchovy', 'anchovies'], replacement: 'mushrooms' }],
  shellfish: [{ terms: ['shrimp', 'prawn', 'crab', 'lobster'], replacement: 'hearts of palm' }],
  tree_nuts: [{ terms: ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut'], replacement: 'pumpkin seeds' }],
  peanuts: [{ terms: ['peanut', 'peanuts', 'groundnut'], replacement: 'sunflower seed butter' }],
  wheat: [{ terms: ['pasta'], replacement: 'rice noodles' }],
  soy: [{ terms: ['soy', 'soya', 'soybean', 'soy sauce'], replacement: 'coconut aminos' }],
  sesame: [{ terms: ['sesame', 'tahini', 'benne'], replacement: 'pumpkin seeds' }],
});

function asText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  for (const field of TEXT_FIELDS) {
    if (typeof value[field] === 'string' && value[field].trim()) return value[field].trim();
  }
  return '';
}

function normalizeText(value) {
  return asText(value).toLocaleLowerCase('en-US').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTerm(value, from, to) {
  const text = asText(value);
  if (!text || !from) return value;
  const pattern = new RegExp(`(^|[^a-z0-9])(${escapeRegex(from)})(?=$|[^a-z0-9])`, 'gi');
  return text.replace(pattern, (_match, prefix, matchedTerm) => {
    const replacement = matchedTerm === matchedTerm.toLocaleUpperCase('en-US')
      ? to.toLocaleUpperCase('en-US')
      : /^[A-Z]/.test(matchedTerm)
        ? `${to[0].toLocaleUpperCase('en-US')}${to.slice(1)}`
        : to;
    return `${prefix}${replacement}`;
  });
}

function lineMatches(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function collectArrayLocations(recipe, fields, kind, parentPath = []) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return [];
  const locations = [];
  for (const field of fields) {
    const value = recipe[field];
    if (!Array.isArray(value)) continue;
    value.forEach((item, index) => {
      const line = asText(item);
      if (line) locations.push({ kind, path: [...parentPath, field], index, line });
    });
  }
  if (recipe.data && typeof recipe.data === 'object' && !Array.isArray(recipe.data)) {
    locations.push(...collectArrayLocations(recipe.data, fields, kind, [...parentPath, 'data']));
  }
  return locations;
}

function findLocations(recipe, line) {
  const all = [
    ...collectArrayLocations(recipe, INGREDIENT_FIELDS, 'ingredient'),
    ...collectArrayLocations(recipe, INSTRUCTION_FIELDS, 'instruction'),
  ];
  return all.filter((location) => lineMatches(location.line, line));
}

function cloneAndUpdateArrayItem(recipe, path, index, update) {
  const copy = { ...recipe };
  let source = recipe;
  let target = copy;
  for (const part of path.slice(0, -1)) {
    const sourceChild = source?.[part];
    const targetChild = sourceChild && typeof sourceChild === 'object' && !Array.isArray(sourceChild)
      ? { ...sourceChild }
      : sourceChild;
    target[part] = targetChild;
    source = sourceChild;
    target = targetChild;
  }
  const field = path[path.length - 1];
  const sourceArray = source?.[field];
  if (!Array.isArray(sourceArray)) return copy;
  const nextArray = [...sourceArray];
  nextArray[index] = update(sourceArray[index]);
  target[field] = nextArray;
  return copy;
}

function removeArrayItem(recipe, path, index) {
  const copy = { ...recipe };
  let source = recipe;
  let target = copy;
  for (const part of path.slice(0, -1)) {
    const sourceChild = source?.[part];
    const targetChild = sourceChild && typeof sourceChild === 'object' && !Array.isArray(sourceChild)
      ? { ...sourceChild }
      : sourceChild;
    target[part] = targetChild;
    source = sourceChild;
    target = targetChild;
  }
  const field = path[path.length - 1];
  const sourceArray = source?.[field];
  if (!Array.isArray(sourceArray)) return copy;
  target[field] = sourceArray.filter((_item, itemIndex) => itemIndex !== index);
  return copy;
}

function replaceObjectText(value, from, to) {
  if (typeof value === 'string') return replaceTerm(value, from, to);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const field = TEXT_FIELDS.find((candidate) => typeof value[candidate] === 'string');
  return field ? { ...value, [field]: replaceTerm(value[field], from, to) } : value;
}

function titleContains(recipe, term) {
  return NAME_FIELDS.some((field) => typeof recipe?.[field] === 'string'
    && new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}(?=$|[^a-z0-9])`, 'i').test(recipe[field]));
}

function setTitleReplacement(recipe, from, to) {
  const next = { ...recipe };
  for (const field of NAME_FIELDS) {
    if (typeof next[field] === 'string') next[field] = replaceTerm(next[field], from, to);
  }
  return next;
}

function qualityIssueList(qualityIssues) {
  if (Array.isArray(qualityIssues)) return qualityIssues;
  if (Array.isArray(qualityIssues?.blockingIssues)) return qualityIssues.blockingIssues;
  return [];
}

/** Feature flag parser: absent, invalid, or false values always remain off. */
export function getRecipeRemediationMode(envOrValue) {
  const raw = envOrValue && typeof envOrValue === 'object'
    ? envOrValue[RECIPE_REMEDIATION_FLAG] ?? envOrValue.recipe_remediation_v1
    : envOrValue;
  const value = String(raw ?? '').trim().toLocaleLowerCase('en-US');
  if (value === 'shadow') return 'shadow';
  if (['1', 'true', 'on', 'enabled'].includes(value)) return 'on';
  return 'off';
}

/**
 * Convert deterministic allergen/process/quality failures to structured
 * violations. Recipe line text is included for the repair and user-facing
 * abstention, but callers must not put it in telemetry.
 */
export function collectViolations(recipe, constraints = {}, options = {}) {
  const violations = [];
  const hardAllergens = normalizeAllergenList(constraints.hardAllergens ?? constraints.hard_allergens ?? []);
  if (hardAllergens.length > 0) {
    const summary = analyzeRecipeAllergens(recipe, hardAllergens);
    const blocked = new Set(summary.blocked);
    for (const match of summary.matches) {
      if (!blocked.has(match.allergen)) continue;
      const locations = findLocations(recipe, match.ingredient);
      if (locations.length === 0) {
        violations.push({
          gate: 'allergen', code: 'ALLERGEN_SAFETY_BLOCK', allergen: match.allergen,
          matchedTerm: match.matchedTerm, lineIndex: null, line: match.ingredient,
          field: 'unknown', allowedMoves: [],
        });
      } else {
        for (const location of locations) {
          violations.push({
            gate: 'allergen', code: 'ALLERGEN_SAFETY_BLOCK', allergen: match.allergen,
            matchedTerm: match.matchedTerm, lineIndex: location.index, line: location.line,
            field: location.kind, sourcePath: location.path, allowedMoves: ['drop', 'swap_graph_known'],
          });
        }
      }
    }
    for (const line of summary.may_contain_uncertain) {
      violations.push({
        gate: 'allergen', code: 'ALLERGEN_SAFETY_BLOCK', reason: 'opaque_or_precautionary_ingredient_terms',
        lineIndex: null, line, field: 'unknown', allowedMoves: [],
      });
    }
    if (!summary.ingredient_data_available) {
      violations.push({
        gate: 'allergen', code: 'ALLERGEN_SAFETY_BLOCK', reason: 'ingredient_data_unavailable',
        lineIndex: null, line: null, field: 'unknown', allowedMoves: [],
      });
    }
    for (const allergen of summary.unknown_hard_allergens) {
      violations.push({
        gate: 'allergen', code: 'ALLERGEN_SAFETY_BLOCK', allergen,
        reason: 'custom_allergen_not_in_graph', lineIndex: null, line: null,
        field: 'unknown', allowedMoves: [],
      });
    }
  }

  if (options.processSafetyEnabled !== false) {
    const process = analyzeProcessSafety(recipe);
    for (const tag of process.blocked) {
      const matches = process.matches.filter((match) => match.tag === tag);
      if (matches.length === 0) {
        violations.push({
          gate: 'process', code: 'PROCESS_SAFETY_BLOCK', tag,
          policy: PROCESS_SAFETY_POLICIES.BLOCK, lineIndex: null, line: null,
          allowedMoves: ['abstain'],
        });
      } else {
        for (const match of matches) {
          violations.push({
            gate: 'process', code: 'PROCESS_SAFETY_BLOCK', tag,
            policy: match.policy, lineIndex: match.index, line: match.evidence,
            field: match.field, sourceField: match.sourceField, allowedMoves: ['abstain'],
          });
        }
      }
    }
  }

  for (const issue of qualityIssueList(options.qualityIssues)) {
    violations.push({
      gate: 'quality', code: 'RECIPE_QUALITY_BLOCK', issue: String(issue),
      lineIndex: null, line: null, allowedMoves: ['revise_cited_lines'],
    });
  }

  return violations;
}

function candidateIsGraphSafe(candidate, hardAllergens) {
  return detectAllergens([candidate]).length === 0
    && analyzeRecipeAllergens({ ingredients: [candidate] }, hardAllergens).safe;
}

function replacementFor(violation, hardAllergens) {
  const options = GRAPH_SAFE_REPLACEMENTS[violation.allergen] || [];
  const term = String(violation.matchedTerm || '').toLocaleLowerCase('en-US');
  const option = options.find((candidate) => candidate.terms.some((sourceTerm) => {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(sourceTerm)}(?=$|[^a-z0-9])`, 'i');
    return pattern.test(term);
  }));
  if (!option || !candidateIsGraphSafe(option.replacement, hardAllergens)) return null;
  return option;
}

/**
 * Propose a finite set of edits. `graphContext` carries the draft and profile
 * needed to validate candidates; no free-text model substitution is accepted.
 */
export function proposeLegalMoves(violations, graphContext = {}) {
  const recipe = graphContext.recipe || {};
  const hardAllergens = normalizeAllergenList(graphContext.hardAllergens || []);
  const allergenViolations = violations.filter((violation) => violation.gate === 'allergen');
  const grouped = new Map();
  for (const violation of allergenViolations) {
    if (!violation.matchedTerm || !violation.allergen || !violation.line) continue;
    const key = `${violation.allergen}:${violation.matchedTerm.toLocaleLowerCase('en-US')}`;
    const group = grouped.get(key) || { ...violation, locations: [] };
    if (violation.sourcePath && Number.isInteger(violation.lineIndex)) {
      if (!group.locations.some((location) => location.path.join('.') === violation.sourcePath.join('.')
        && location.index === violation.lineIndex)) {
        group.locations.push({ path: violation.sourcePath, index: violation.lineIndex, field: violation.field });
      }
    }
    grouped.set(key, group);
  }

  const moves = [];
  for (const violation of grouped.values()) {
    const option = replacementFor(violation, hardAllergens);
    if (option) {
      moves.push({
        move: 'swap_graph_known', allergen: violation.allergen,
        matchedTerm: violation.matchedTerm, replacement: option.replacement,
        line: violation.line, locations: violation.locations,
        requiresModelRevision: violation.locations.some((location) => location.field === 'instruction'),
      });
      continue;
    }

    const sameLineViolations = allergenViolations.filter((candidate) =>
      candidate.line === violation.line && candidate.field === violation.field
      && candidate.lineIndex === violation.lineIndex);
    const hasInstructionReference = collectArrayLocations(recipe, INSTRUCTION_FIELDS, 'instruction')
      .some((location) => new RegExp(`(^|[^a-z0-9])${escapeRegex(violation.matchedTerm)}(?=$|[^a-z0-9])`, 'i').test(location.line));
    if (violation.field === 'ingredient'
      && Number.isInteger(violation.lineIndex)
      && sameLineViolations.length === 1
      && allergenViolations.length === 1
      && !titleContains(recipe, violation.matchedTerm)
      && !hasInstructionReference) {
      moves.push({
        move: 'drop', allergen: violation.allergen, matchedTerm: violation.matchedTerm,
        line: violation.line, locations: violation.sourcePath
          ? [{ path: violation.sourcePath, index: violation.lineIndex, field: violation.field }]
          : [], requiresModelRevision: false,
      });
    }
  }

  if (violations.some((violation) => violation.gate === 'quality')) {
    moves.push({ move: 'revise_cited_lines', requiresModelRevision: true });
  }

  return moves;
}

/** Apply one deterministic move without mutating the caller's draft. */
export function applyGraphMove(recipe, move) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe) || !move) {
    return { recipe, repair: null, characterChange: false };
  }
  if (move.move === 'revise_cited_lines') {
    return { recipe, repair: null, characterChange: false };
  }

  const term = move.matchedTerm;
  const titleChanged = Boolean(term && titleContains(recipe, term));
  let next = recipe;
  if (move.move === 'drop') {
    const location = move.locations?.[0];
    if (!location) return { recipe, repair: null, characterChange: false };
    next = removeArrayItem(next, location.path, location.index);
  } else if (move.move === 'swap_graph_known') {
    for (const location of move.locations || []) {
      // A cited instruction line is revised by the handler-owned model call;
      // only ingredient entries are edited deterministically here.
      if (location.field !== 'ingredient') continue;
      next = cloneAndUpdateArrayItem(next, location.path, location.index, (item) =>
        replaceObjectText(item, term, move.replacement));
    }
    if (titleChanged) next = setTitleReplacement(next, term, move.replacement);
  } else {
    return { recipe, repair: null, characterChange: false };
  }

  return {
    recipe: next,
    repair: {
      lineIndex: move.locations?.[0]?.index ?? null,
      move: move.move,
      from: term || move.line || null,
      to: move.move === 'swap_graph_known' ? move.replacement : null,
      graphChecked: move.move === 'swap_graph_known',
      characterChange: titleChanged,
    },
    characterChange: titleChanged,
  };
}

/** Decide whether a deterministic re-check passed, needs retry, or must abstain. */
export function decideStatus(before, after, attempts) {
  const beforeFailed = Array.isArray(before) && before.length > 0;
  const afterFailed = Array.isArray(after) && after.length > 0;
  if (!afterFailed) return { status: beforeFailed ? 'repaired' : 'unchanged', attempts, abstained: false };
  if (attempts >= MAX_RECIPE_REMEDIATION_ATTEMPTS) {
    return { status: 'abstained', attempts, abstained: true };
  }
  return { status: 'retry', attempts, abstained: false };
}

export { candidateIsGraphSafe, findLocations, replaceTerm };
