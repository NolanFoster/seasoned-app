export const COOK_PROGRAM_MODEL_ID = 'cook-program-v1';
export const COOK_PROGRAM_FLAG = 'cook_program_v1';
export const COOK_PROGRAM_MAX_DURATION_SEC = 8 * 60 * 60;

const ACTION_LIBRARY = Object.freeze([
  { verb: 'heat', kind: 'continuous', pattern: 'heat(?:ing|ed)?' },
  { verb: 'simmer', kind: 'continuous', pattern: 'simmer(?:ing|ed)?' },
  { verb: 'boil', kind: 'continuous', pattern: 'boil(?:ing|ed)?' },
  { verb: 'saute', kind: 'continuous', pattern: '(?:saute|sauté)(?:ing|d|ed)?' },
  { verb: 'stir', kind: 'continuous', pattern: 'stir(?:ring|red)?' },
  { verb: 'bake', kind: 'continuous', pattern: 'bak(?:e|ing|ed)' },
  { verb: 'rest', kind: 'continuous', pattern: 'rest(?:ing|ed)?' },
  { verb: 'add', kind: 'instantaneous', pattern: 'add(?:ing|ed)?' },
  { verb: 'season', kind: 'instantaneous', pattern: 'season(?:ing|ed)?' },
  { verb: 'transfer', kind: 'instantaneous', pattern: 'transfer(?:ring|red)?' },
  { verb: 'mix', kind: 'instantaneous', pattern: 'mix(?:ing|ed)?' },
  { verb: 'hold', kind: 'instantaneous', pattern: 'hold(?:ing|s)?' },
]);

export const COOK_PROGRAM_VERBS = Object.freeze(
  ACTION_LIBRARY.map(({ verb, kind }) => Object.freeze({ verb, kind }))
);

const OBSERVABLES = Object.freeze([
  { observable: 'fork_tender', pattern: 'fork[\\s_-]+tender' },
  { observable: 'golden', pattern: 'golden' },
  { observable: 'browned', pattern: 'browned' },
  { observable: 'fragrant', pattern: 'fragrant' },
  { observable: 'soft', pattern: 'soft' },
  { observable: 'tender', pattern: 'tender' },
  { observable: 'shimmering', pattern: 'shimmer(?:ing|s)?' },
  { observable: 'simmering', pattern: 'simmering' },
  { observable: 'boiling', pattern: 'boiling' },
  { observable: 'reduced', pattern: 'reduced' },
  { observable: 'thickened', pattern: 'thickened' },
  { observable: 'set', pattern: 'set' },
  { observable: 'translucent', pattern: 'translucent' },
  { observable: 'wilted', pattern: 'wilted' },
  { observable: 'crisp', pattern: 'crisp' },
]);

export const COOK_PROGRAM_OBSERVABLES = Object.freeze(
  OBSERVABLES.map(({ observable }) => observable)
);

const TIME_PATTERN = /(\d+)(?:-(\d+))?\s*(second|minute|min|hour|hr)s?\b/i;
const SETPOINT_PATTERN = /\b\d+(?:\.\d+)?\s*°\s*[fc]\b/i;
const TARGETS = Object.freeze([
  'baking sheet', 'skillet', 'saucepan', 'pan', 'pot', 'oven', 'bowl', 'dish', 'water', 'oil',
]);
const UNSUPPORTED_ACTION_PATTERN = /(?:^|[;,]\s*|\b(?:and|then)\s+)(?:preheat|roast|fry|grill|whisk|toss|pour|drizzle|chop|slice|mince|peel|grate|drain|rinse|cool|chill|freeze|ferment|temper|pressure[\s-]+cook|can|serve|prepare)(?:ing|ed|s|es)?\b/i;

function wordPattern(value) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${value})(?![\\p{L}\\p{N}])`, 'giu');
}

function findActionMentions(text) {
  const mentions = [];
  for (const definition of ACTION_LIBRARY) {
    const pattern = wordPattern(definition.pattern);
    for (const match of text.matchAll(pattern)) {
      const end = match.index + match[0].length;
      const before = text.slice(Math.max(0, match.index - 18), match.index);
      const after = text.slice(end, end + 18);
      const priorText = text.slice(0, match.index);
      const matchedText = match[0].toLocaleLowerCase('en-US');
      if (/\buntil\b/i.test(priorText)
        && ((definition.verb === 'simmer' && matchedText === 'simmering')
          || (definition.verb === 'boil' && matchedText === 'boiling'))) continue;
      if (definition.verb === 'heat' && /\b(?:low|medium|high)\s+$/i.test(before)) continue;
      if (definition.verb === 'bake' && /^\s+sheet\b/i.test(after)) continue;
      if (definition.verb === 'mix' && /^\s+bowl\b/i.test(after)) continue;
      mentions.push({
        verb: definition.verb,
        kind: definition.kind,
        index: match.index,
        end,
      });
    }
  }
  return mentions.sort((left, right) => left.index - right.index || left.end - right.end);
}

function getInstructionText(instruction) {
  if (typeof instruction === 'string') return instruction.trim();
  if (!instruction || typeof instruction !== 'object' || Array.isArray(instruction)) return '';
  for (const field of ['text', 'name', 'step']) {
    if (typeof instruction[field] === 'string' && instruction[field].trim()) {
      return instruction[field].trim();
    }
  }
  try {
    return JSON.stringify(instruction);
  } catch {
    return '';
  }
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[\p{L}\p{N}])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitExplicitClauses(text) {
  const separators = [...text.matchAll(/;\s*|,\s*and\s+/giu)];
  for (const separator of separators) {
    const left = text.slice(0, separator.index).trim();
    const right = text.slice(separator.index + separator[0].length).trim();
    if (findActionMentions(left).length > 0 && findActionMentions(right).length > 0) {
      return [...splitExplicitClauses(left), ...splitExplicitClauses(right)];
    }
  }
  return [text.trim()].filter(Boolean);
}

function splitInstruction(text) {
  return splitSentences(text).flatMap(splitExplicitClauses);
}

function parseDuration(text) {
  const match = TIME_PATTERN.exec(text);
  if (!match) return { seconds: null, range: false, invalid: false };
  const value = Number(match[2] || match[1]);
  const unit = match[3].toLocaleLowerCase('en-US');
  const multiplier = unit === 'second'
    ? 1
    : unit === 'hour' || unit === 'hr'
      ? 3600
      : 60;
  const seconds = value * multiplier;
  return {
    seconds,
    range: match[2] !== undefined,
    invalid: !Number.isFinite(seconds) || seconds <= 0 || seconds > COOK_PROGRAM_MAX_DURATION_SEC,
  };
}

function findUntil(text, actionEnd) {
  const suffix = text.slice(actionEnd);
  const untilMatch = /\buntil\b/i.exec(suffix);
  if (!untilMatch) return null;
  const untilStart = actionEnd + untilMatch.index;
  const cueStart = untilStart + untilMatch[0].length;
  const cueText = text.slice(cueStart);
  const matches = [];
  for (const definition of OBSERVABLES) {
    const match = wordPattern(definition.pattern).exec(cueText);
    if (match) matches.push({ observable: definition.observable, end: cueStart + match.index + match[0].length });
  }
  matches.sort((left, right) => left.end - right.end);
  const firstCue = matches[0];
  if (!firstCue) return null;
  return {
    observable: firstCue.observable,
    cue: text.slice(untilStart, firstCue.end).trim().replace(/[,.!?;]+$/u, ''),
  };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function entityName(entity) {
  if (typeof entity === 'string') return entity;
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return '';
  return entity.attributes?.name || entity.name || entity.normalizedName || '';
}

function includesWholeIngredientName(text, name) {
  const tokens = String(name).toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return false;
  const phrase = tokens.map(escapeRegex).join('[^\\p{L}\\p{N}]+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

function findIngredientIndexes(text, ingredientEntities) {
  if (!Array.isArray(ingredientEntities)) return [];
  const indexes = [];
  ingredientEntities.forEach((entity, position) => {
    const index = Number.isInteger(entity?.index) && entity.index >= 0 ? entity.index : position;
    if (includesWholeIngredientName(text, entityName(entity))) indexes.push(index);
  });
  return [...new Set(indexes)];
}

function findExplicitTarget(text, actionEnd) {
  const suffix = text.slice(actionEnd).toLocaleLowerCase('en-US');
  for (const target of TARGETS) {
    const phrase = target.split(' ').map(escapeRegex).join('[^\\p{L}\\p{N}]+');
    if (new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, 'iu').test(suffix)) {
      return target;
    }
  }
  return null;
}

function findProcessSafetyContext(summary, sourceIndex) {
  if (!Array.isArray(summary?.matches)) return { note: null, tags: [] };
  const matches = summary.matches.filter((match) => match?.index === sourceIndex);
  if (matches.length === 0) return { note: null, tags: [] };
  const notes = matches.map((match) => {
    const detail = summary.warnings?.find((warning) => warning?.tag === match.tag)
      || summary.policyActions?.find((action) => action?.tag === match.tag);
    if (!detail) return null;
    return [detail.reason, detail.guidance].filter((part) => typeof part === 'string' && part.trim()).join(' ');
  }).filter(Boolean);
  return {
    note: notes.length > 0 ? [...new Set(notes)].join(' ') : null,
    tags: [...new Set(matches.map((match) => match.tag).filter((tag) => typeof tag === 'string'))],
  };
}

function makeUncompiled(sourceIndex, clauseIndex, text, reason) {
  return { sourceIndex, clauseIndex, text, reason };
}

function validateStep(step) {
  const errors = [];
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    return { valid: false, errors: [{ code: 'invalid_step' }] };
  }
  const action = ACTION_LIBRARY.find((candidate) => candidate.verb === step.action?.verb);
  if (!action) errors.push({ code: 'verb_not_in_library' });
  if (action && step.kind !== action.kind) errors.push({ code: 'action_kind_mismatch' });
  if (!step.action || typeof step.action !== 'object' || Array.isArray(step.action)
    || !step.action.arguments || typeof step.action.arguments !== 'object'
    || Array.isArray(step.action.arguments)) errors.push({ code: 'invalid_action' });
  if (action?.kind === 'continuous' && !step.until && step.maxDurationSec == null) {
    errors.push({ code: 'no_stop_condition' });
  }
  if (!Object.hasOwn(step, 'maxDurationSec')) errors.push({ code: 'invalid_duration' });
  else if (step.maxDurationSec !== null
    && (!Number.isFinite(step.maxDurationSec) || step.maxDurationSec <= 0
      || step.maxDurationSec > COOK_PROGRAM_MAX_DURATION_SEC)) {
    errors.push({ code: 'duration_implausible' });
  }
  if (step.until && (!COOK_PROGRAM_OBSERVABLES.includes(step.until.observable)
    || typeof step.until.cue !== 'string' || !step.until.cue.trim())) {
    errors.push({ code: 'invalid_until' });
  }
  if (action?.verb === 'hold' && Array.isArray(step.safetyTags) && step.safetyTags.length > 0
    && (typeof step.safetyNote !== 'string' || !step.safetyNote.trim())) {
    errors.push({ code: 'hold_missing_safety_note' });
  }
  if (!Number.isInteger(step.sourceIndex) || step.sourceIndex < 0) errors.push({ code: 'invalid_source_index' });
  if (!Number.isInteger(step.clauseIndex) || step.clauseIndex < 0) errors.push({ code: 'invalid_clause_index' });
  if (!Array.isArray(step.ingredientIndexes)
    || step.ingredientIndexes.some((index) => !Number.isInteger(index) || index < 0)) {
    errors.push({ code: 'invalid_ingredient_indexes' });
  }
  return { valid: errors.length === 0, errors };
}

function compileClause(text, sourceIndex, clauseIndex, options) {
  const actions = findActionMentions(text);
  if (actions.length > 1) {
    return { uncompiled: makeUncompiled(sourceIndex, clauseIndex, text, 'multiple_actions') };
  }
  if (actions.length === 0 || UNSUPPORTED_ACTION_PATTERN.test(text)) {
    return { uncompiled: makeUncompiled(sourceIndex, clauseIndex, text, 'verb_not_in_library') };
  }

  const action = actions[0];
  const duration = parseDuration(text);
  if (duration.invalid) {
    return { uncompiled: makeUncompiled(sourceIndex, clauseIndex, text, 'duration_implausible') };
  }
  const until = action.kind === 'continuous' ? findUntil(text, action.end) : null;
  if (action.kind === 'continuous' && !until && duration.seconds === null) {
    return { uncompiled: makeUncompiled(sourceIndex, clauseIndex, text, 'no_stop_condition') };
  }

  const arguments_ = {};
  if (action.verb === 'heat') {
    arguments_.target = findExplicitTarget(text, action.end);
    arguments_.level = /\b(low|medium|high)\b/i.exec(text)?.[1]?.toLocaleLowerCase('en-US') || null;
  }
  if (['heat', 'bake', 'simmer'].includes(action.verb)) {
    arguments_.setpoint = SETPOINT_PATTERN.exec(text)?.[0]?.replace(/\s+/g, '') || null;
  }

  const step = {
    id: `s${options.steps.length}`,
    sourceIndex,
    clauseIndex,
    kind: action.kind,
    action: { verb: action.verb, arguments: arguments_ },
    until,
    maxDurationSec: duration.seconds,
    durationSource: duration.seconds === null ? 'absent' : 'source_text',
    range: duration.range,
    requiresConfirm: action.verb !== 'stir' || !until,
    ingredientIndexes: findIngredientIndexes(text, options.ingredientEntities),
    uncompiledSpans: [],
  };

  if (action.verb === 'hold') {
    const safety = findProcessSafetyContext(options.processSafetySummary, sourceIndex);
    if (safety.tags.length > 0) {
      step.safetyTags = safety.tags;
      if (safety.note) step.safetyNote = safety.note;
    }
  }

  const validation = validateStep(step);
  if (!validation.valid) {
    return { uncompiled: makeUncompiled(sourceIndex, clauseIndex, text, validation.errors[0].code) };
  }
  return { step };
}

/** Compile instruction prose to a conservative, linear cook program. */
export function compileCookProgram(instructions, options = {}) {
  const compileOptions = options && typeof options === 'object' ? options : {};
  const normalizedInstructions = Array.isArray(instructions) ? instructions.map(getInstructionText) : [];
  const hasMethod = normalizedInstructions.some((instruction) => instruction.length > 0);
  const program = {
    modelId: COOK_PROGRAM_MODEL_ID,
    status: hasMethod ? 'compiled' : 'abstained',
    source: 'instructions',
    steps: [],
    uncompiled: [],
  };
  if (!hasMethod) return program;

  const clauseOptions = {
    steps: program.steps,
    ingredientEntities: Array.isArray(compileOptions.ingredientEntities) ? compileOptions.ingredientEntities : [],
    processSafetySummary: compileOptions.processSafetySummary || null,
  };
  normalizedInstructions.forEach((instruction, sourceIndex) => {
    if (!instruction) return;
    splitInstruction(instruction).forEach((clause, clauseIndex) => {
      const result = compileClause(clause, sourceIndex, clauseIndex, clauseOptions);
      if (result.step) program.steps.push(result.step);
      if (result.uncompiled) program.uncompiled.push(result.uncompiled);
    });
  });
  program.status = program.uncompiled.length === 0 ? 'compiled' : 'partial';
  return program;
}

/** Validate an existing program without rewriting or repairing its steps. */
export function validateCookProgram(program) {
  const errors = [];
  if (!program || typeof program !== 'object' || Array.isArray(program)) {
    return { valid: false, errors: [{ code: 'invalid_program' }] };
  }
  if (program.modelId !== COOK_PROGRAM_MODEL_ID) errors.push({ code: 'invalid_model_id' });
  if (!['compiled', 'partial', 'abstained'].includes(program.status)) errors.push({ code: 'invalid_status' });
  if (program.source !== 'instructions') errors.push({ code: 'invalid_source' });
  if (!Array.isArray(program.steps) || !Array.isArray(program.uncompiled)) {
    return { valid: false, errors: [...errors, { code: 'invalid_program_shape' }] };
  }

  for (const step of program.steps) {
    const result = validateStep(step);
    for (const error of result.errors) {
      errors.push({ ...error, stepId: step?.id || null, sourceIndex: step?.sourceIndex ?? null });
    }
    if (typeof step?.id !== 'string' || !step.id) errors.push({ code: 'invalid_step_id', sourceIndex: step?.sourceIndex ?? null });
    if (typeof step?.requiresConfirm !== 'boolean') {
      errors.push({ code: 'invalid_confirm_gate', stepId: step?.id || null });
    }
  }
  if (program.uncompiled.some((item) => !Number.isInteger(item?.sourceIndex)
    || item.sourceIndex < 0 || !Number.isInteger(item?.clauseIndex) || item.clauseIndex < 0
    || typeof item?.text !== 'string' || !item.text.trim()
    || typeof item?.reason !== 'string' || !item.reason)) {
    errors.push({ code: 'invalid_uncompiled_entry' });
  }
  if (program.status === 'compiled' && (program.steps.length === 0 || program.uncompiled.length > 0)) {
    errors.push({ code: 'compiled_status_mismatch' });
  }
  if (program.status === 'partial' && program.uncompiled.length === 0) errors.push({ code: 'partial_status_mismatch' });
  if (program.status === 'abstained' && (program.steps.length > 0 || program.uncompiled.length > 0)) {
    errors.push({ code: 'abstained_status_mismatch' });
  }
  return { valid: errors.length === 0, errors };
}

export function getCookProgramMode(envOrValue) {
  const value = envOrValue && typeof envOrValue === 'object'
    ? envOrValue.COOK_PROGRAM_V1 ?? envOrValue[COOK_PROGRAM_FLAG]
    : envOrValue;
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US');
  if (normalized === 'shadow') return 'shadow';
  if (['1', 'true', 'on', 'enabled'].includes(normalized)) return 'on';
  return 'off';
}

/** Apply rollout behavior without logging; telemetry contains counts only. */
export function withCookProgramFeature(recipe, envOrValue, options = {}) {
  const mode = getCookProgramMode(envOrValue);
  const baseRecipe = recipe && typeof recipe === 'object' && !Array.isArray(recipe) ? recipe : {};
  const { cookProgram: _previousCookProgram, ...recipeWithoutProgram } = baseRecipe;
  if (mode === 'off') return { recipe: recipeWithoutProgram, mode, telemetry: null };

  const program = compileCookProgram(baseRecipe.instructions, {
    ingredientEntities: options.ingredientEntities ?? baseRecipe.ingredientEntities,
    processSafetySummary: options.processSafetySummary ?? baseRecipe.processSafetySummary,
  });
  const uncompiledReasons = {};
  for (const item of program.uncompiled) {
    uncompiledReasons[item.reason] = (uncompiledReasons[item.reason] || 0) + 1;
  }
  const telemetry = {
    status: program.status,
    compiled_steps: program.steps.length,
    uncompiled_steps: program.uncompiled.length,
    uncompiled_reasons: uncompiledReasons,
  };
  return {
    recipe: mode === 'on' ? { ...recipeWithoutProgram, cookProgram: program } : recipeWithoutProgram,
    mode,
    telemetry,
  };
}
