import { describe, expect, it } from 'vitest';
import {
  COOK_PROGRAM_FLAG,
  COOK_PROGRAM_MAX_DURATION_SEC,
  COOK_PROGRAM_MODEL_ID,
  COOK_PROGRAM_OBSERVABLES,
  COOK_PROGRAM_VERBS,
  compileCookProgram,
  getCookProgramMode,
  validateCookProgram,
  withCookProgramFeature,
} from '../cook-program.js';

describe('cook program compiler', () => {
  it('exports a closed action library and observable vocabulary', () => {
    expect(COOK_PROGRAM_MODEL_ID).toBe('cook-program-v1');
    expect(COOK_PROGRAM_FLAG).toBe('cook_program_v1');
    expect(COOK_PROGRAM_MAX_DURATION_SEC).toBe(28800);
    expect(COOK_PROGRAM_VERBS.map(({ verb }) => verb)).toEqual([
      'heat', 'simmer', 'boil', 'saute', 'stir', 'bake', 'rest',
      'add', 'season', 'transfer', 'mix', 'hold',
    ]);
    expect(COOK_PROGRAM_OBSERVABLES).toContain('fork_tender');
    expect(COOK_PROGRAM_OBSERVABLES).toContain('translucent');
  });

  it('compiles an explicit continuous action without inventing time or settings', () => {
    const program = compileCookProgram(
      ['Heat the pan on medium heat until the olive oil shimmers.'],
      {
        ingredientEntities: [
          { index: 0, attributes: { name: 'olive oil' } },
          { index: 1, attributes: { name: 'oil' } },
          { index: 2, attributes: { name: 'garlic' } },
        ],
      }
    );

    expect(program.status).toBe('compiled');
    expect(program.steps).toHaveLength(1);
    expect(program.steps[0]).toMatchObject({
      id: 's0',
      sourceIndex: 0,
      clauseIndex: 0,
      kind: 'continuous',
      action: { verb: 'heat', arguments: { target: 'pan', level: 'medium', setpoint: null } },
      until: { observable: 'shimmering', cue: 'until the olive oil shimmers' },
      maxDurationSec: null,
      durationSource: 'absent',
      range: false,
      requiresConfirm: true,
      ingredientIndexes: [0, 1],
      uncompiledSpans: [],
    });
    expect(validateCookProgram(program)).toEqual({ valid: true, errors: [] });
  });

  it('splits only explicit action boundaries and requires the cook to confirm instantaneous work', () => {
    const program = compileCookProgram([
      'Heat the oil until shimmering; add the garlic, and season with salt.',
    ]);

    expect(program.status).toBe('compiled');
    expect(program.steps.map(({ action }) => action.verb)).toEqual(['heat', 'add', 'season']);
    expect(program.steps.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 0, 0]);
    expect(program.steps.map(({ clauseIndex }) => clauseIndex)).toEqual([0, 1, 2]);
    expect(program.steps[1].requiresConfirm).toBe(true);
    expect(program.steps[2].requiresConfirm).toBe(true);
  });

  it('uses the upper end of explicit ranges and preserves only written duration and temperature', () => {
    const program = compileCookProgram([
      'Bake at 375°F for 20 minutes.',
      'Stir until fragrant for 3-5 minutes.',
      'Rest for 8 hours.',
    ]);

    expect(program.status).toBe('compiled');
    expect(program.steps[0]).toMatchObject({
      action: { verb: 'bake', arguments: { setpoint: '375°F' } },
      maxDurationSec: 1200,
      durationSource: 'source_text',
      range: false,
    });
    expect(program.steps[1]).toMatchObject({
      action: { verb: 'stir', arguments: {} },
      until: { observable: 'fragrant', cue: 'until fragrant' },
      maxDurationSec: 300,
      range: true,
      requiresConfirm: false,
    });
    expect(program.steps[2].maxDurationSec).toBe(COOK_PROGRAM_MAX_DURATION_SEC);
  });

  it('does not guess a stop condition and leaves multi-action or unsupported prose uncompiled', () => {
    const program = compileCookProgram([
      'Heat oil, add garlic.',
      'Cook until done.',
      'Mix and serve.',
      'Can the tomatoes for 45 minutes at 10 PSI.',
      'Stir the sauce.',
    ]);

    expect(program.status).toBe('partial');
    expect(program.steps).toHaveLength(0);
    expect(program.uncompiled.map(({ reason }) => reason)).toEqual([
      'multiple_actions',
      'verb_not_in_library',
      'verb_not_in_library',
      'verb_not_in_library',
      'no_stop_condition',
    ]);
  });

  it('splits sentences but refuses to compile a compound action left in one clause', () => {
    const program = compileCookProgram([
      'Chop the tomatoes. Heat the sauce until simmering.',
      'Heat the oil until shimmering, add the garlic.',
    ]);

    expect(program.status).toBe('partial');
    expect(program.steps.map(({ action }) => action.verb)).toEqual(['heat']);
    expect(program.steps[0].sourceIndex).toBe(0);
    expect(program.steps[0].clauseIndex).toBe(1);
    expect(program.uncompiled).toEqual([
      expect.objectContaining({ sourceIndex: 0, clauseIndex: 0, reason: 'verb_not_in_library' }),
      expect.objectContaining({ sourceIndex: 1, reason: 'multiple_actions' }),
    ]);
  });

  it('rejects zero and implausible durations without capping them', () => {
    const program = compileCookProgram([
      'Rest for 0 minutes.',
      'Rest for 24 hours.',
    ]);

    expect(program.status).toBe('partial');
    expect(program.uncompiled.map(({ reason }) => reason)).toEqual([
      'duration_implausible', 'duration_implausible',
    ]);
  });

  it('requires an inherited process-safety note on flagged hold steps', () => {
    const processSafetySummary = {
      matches: [{ index: 0, tag: 'reheat_rice_cooling' }],
      warnings: [{
        tag: 'reheat_rice_cooling',
        reason: 'Use safe cooling practices.',
        guidance: 'Follow the published food-safety guidance.',
      }],
    };
    const withNote = compileCookProgram(['Hold the rice.'], { processSafetySummary });
    const withoutNote = compileCookProgram(['Hold the rice.'], {
      processSafetySummary: { matches: [{ index: 0, tag: 'reheat_rice_cooling' }] },
    });

    expect(withNote.status).toBe('compiled');
    expect(withNote.steps[0]).toMatchObject({
      safetyTags: ['reheat_rice_cooling'],
      safetyNote: 'Use safe cooling practices. Follow the published food-safety guidance.',
    });
    expect(withoutNote.status).toBe('partial');
    expect(withoutNote.uncompiled[0].reason).toBe('hold_missing_safety_note');
  });

  it('abstains when no method exists, but marks malformed or unsupported method text partial', () => {
    expect(compileCookProgram([])).toMatchObject({ status: 'abstained', steps: [], uncompiled: [] });
    expect(compileCookProgram(undefined)).toMatchObject({ status: 'abstained', steps: [], uncompiled: [] });
    expect(compileCookProgram([' ', null])).toMatchObject({ status: 'abstained', steps: [], uncompiled: [] });
    expect(compileCookProgram(['Do the thing.'])).toMatchObject({
      status: 'partial',
      steps: [],
      uncompiled: [expect.objectContaining({ reason: 'verb_not_in_library' })],
    });
    expect(compileCookProgram(['Add garlic.'], null).status).toBe('compiled');
  });

  it('validates malformed programs fail-closed with structured reason codes', () => {
    expect(validateCookProgram(null)).toEqual({
      valid: false,
      errors: [{ code: 'invalid_program' }],
    });

    const invalid = validateCookProgram({
      modelId: 'other',
      status: 'compiled',
      source: 'model',
      steps: [{
        id: '',
        sourceIndex: -1,
        clauseIndex: -1,
        kind: 'instantaneous',
        action: null,
        until: { observable: 'not-real', cue: '' },
        maxDurationSec: 28801,
        requiresConfirm: 'no',
        ingredientIndexes: ['1'],
      }],
      uncompiled: [{ sourceIndex: -1, clauseIndex: 0, text: '', reason: '' }],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'invalid_model_id', 'invalid_source', 'verb_not_in_library', 'invalid_action',
      'duration_implausible', 'invalid_until', 'invalid_source_index', 'invalid_clause_index',
      'invalid_ingredient_indexes', 'invalid_step_id', 'invalid_confirm_gate',
      'invalid_uncompiled_entry', 'compiled_status_mismatch',
    ]));
    expect(validateCookProgram({ modelId: COOK_PROGRAM_MODEL_ID, status: 'unknown', source: 'instructions', steps: [], uncompiled: [] })
      .errors.map(({ code }) => code)).toContain('invalid_status');
    expect(validateCookProgram({ modelId: COOK_PROGRAM_MODEL_ID, status: 'abstained', source: 'instructions', steps: [{}], uncompiled: [] })
      .errors.map(({ code }) => code)).toContain('abstained_status_mismatch');
    expect(validateCookProgram({ modelId: COOK_PROGRAM_MODEL_ID, status: 'partial', source: 'instructions', steps: [], uncompiled: [] })
      .errors.map(({ code }) => code)).toContain('partial_status_mismatch');
    expect(validateCookProgram({ modelId: COOK_PROGRAM_MODEL_ID, status: 'compiled', source: 'instructions', steps: [], uncompiled: [] })
      .errors.map(({ code }) => code)).toContain('compiled_status_mismatch');
    expect(validateCookProgram({ modelId: COOK_PROGRAM_MODEL_ID, status: 'compiled', source: 'instructions', steps: null, uncompiled: [] })
      .errors.map(({ code }) => code)).toContain('invalid_program_shape');
  });
});

describe('cook program rollout flag', () => {
  const recipe = {
    instructions: ['Heat the sauce until simmering.'],
    cookProgram: { modelId: 'old-program' },
  };

  it('defaults off, recognizes the supported flag values, and strips stale output', () => {
    expect(getCookProgramMode()).toBe('off');
    expect(getCookProgramMode({ COOK_PROGRAM_V1: ' SHADOW ' })).toBe('shadow');
    expect(getCookProgramMode({ cook_program_v1: 'enabled' })).toBe('on');
    expect(getCookProgramMode('true')).toBe('on');
    expect(getCookProgramMode('anything-else')).toBe('off');
    expect(getCookProgramMode('0')).toBe('off');

    const result = withCookProgramFeature(recipe, 'off');
    expect(result).toEqual({
      recipe: { instructions: recipe.instructions },
      mode: 'off',
      telemetry: null,
    });
  });

  it('computes counts only in shadow mode and attaches the validated program only when on', () => {
    const shadow = withCookProgramFeature(recipe, 'shadow');
    expect(shadow.mode).toBe('shadow');
    expect(Object.hasOwn(shadow.recipe, 'cookProgram')).toBe(false);
    expect(shadow.telemetry).toEqual({
      status: 'compiled',
      compiled_steps: 1,
      uncompiled_steps: 0,
      uncompiled_reasons: {},
    });
    expect(JSON.stringify(shadow.telemetry)).not.toContain('sauce');

    const enabled = withCookProgramFeature(recipe, { COOK_PROGRAM_V1: 'on' });
    expect(enabled.mode).toBe('on');
    expect(enabled.recipe.cookProgram).toMatchObject({ modelId: COOK_PROGRAM_MODEL_ID, status: 'compiled' });
    expect(validateCookProgram(enabled.recipe.cookProgram).valid).toBe(true);

    const abstained = withCookProgramFeature({ name: 'No method' }, 'on');
    expect(abstained.recipe.cookProgram.status).toBe('abstained');
  });
});
