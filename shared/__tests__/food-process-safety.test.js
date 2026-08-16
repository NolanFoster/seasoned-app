import { describe, expect, it } from 'vitest'
import {
  PROCESS_HAZARD_TAGS,
  PROCESS_SAFETY_POLICIES,
  ProcessSafetyError,
  analyzeProcessSafety,
  applyProcessSafetyPolicy,
  collectProcessLines,
  containsProcessSchedule,
  describeProcessSafetyDecision,
  detectProcessHazards,
  redactProcessSchedules,
  enforceProcessSafety,
  isProcessSafetyEnabled,
  withProcessSafetySummary,
} from '../food-process-safety.js'
import {
  HAZARD_FIXTURES,
  PROCESS_SAFETY_FIXTURES,
  SAFE_FIXTURES,
} from './fixtures/food-process-safety-fixtures.js'

function instructionText(recipe) {
  return (recipe.instructions || [])
    .map((step) => (typeof step === 'string' ? step : step?.text || ''))
    .join(' ')
}

describe('food process safety eval fixtures', () => {
  it('covers at least 30 cases with expected policy outcomes', () => {
    expect(PROCESS_SAFETY_FIXTURES.length).toBeGreaterThanOrEqual(30)
  })

  it.each(PROCESS_SAFETY_FIXTURES)('$id resolves to its expected policy', (fixture) => {
    const summary = analyzeProcessSafety(fixture.recipe)
    expect(summary.status).toBe(fixture.expect.status)
    expect([...summary.tags].sort()).toEqual([...fixture.expect.tags].sort())
  })

  it('never returns cookable instructions for a blocked technique', () => {
    const blockedFixtures = HAZARD_FIXTURES.filter((fixture) => fixture.expect.status === 'blocked')
    expect(blockedFixtures.length).toBeGreaterThan(0)

    for (const fixture of blockedFixtures) {
      expect(() => enforceProcessSafety(fixture.recipe)).toThrow(ProcessSafetyError)
    }
  })

  it('keeps numeric process schedules out of canning and forage results', () => {
    const preservationFixtures = HAZARD_FIXTURES.filter((fixture) =>
      fixture.expect.tags.some((tag) => tag.includes('canning') || tag.includes('preserve') || tag === 'wild_forage_id'))

    for (const fixture of preservationFixtures) {
      let returned = null
      try {
        returned = enforceProcessSafety(fixture.recipe)
      } catch (error) {
        expect(error).toBeInstanceOf(ProcessSafetyError)
        // The refusal payload explains itself without quoting the model's
        // invented PSI and processing times back to the client.
        expect(containsProcessSchedule(JSON.stringify(error.summary))).toBe(false)
        continue
      }
      expect(containsProcessSchedule(instructionText(returned))).toBe(false)
      expect(containsProcessSchedule(JSON.stringify(returned.processSafetySummary))).toBe(false)
    }
  })

  it('holds the false-positive rate on ordinary recipes below 2%', () => {
    const flagged = SAFE_FIXTURES.filter((fixture) => analyzeProcessSafety(fixture.recipe).tags.length > 0)
    expect(flagged.map((fixture) => fixture.id)).toEqual([])
    expect(flagged.length / SAFE_FIXTURES.length).toBeLessThan(0.02)
  })
})

describe('hazard detection', () => {
  it('reads hazards from titles, ingredients, instructions, and notes', () => {
    const lines = collectProcessLines({
      name: 'Canned Green Beans',
      description: 'A pantry staple.',
      ingredients: ['3 lbs green beans'],
      instructions: ['Process the jars for 25 minutes.'],
      storage: 'Keep on the pantry shelf for a year.',
    })

    expect(lines.map((line) => line.field)).toEqual(
      expect.arrayContaining(['title', 'description', 'ingredient', 'instruction']),
    )
  })

  it('explains each finding with the line that produced it', () => {
    const matches = detectProcessHazards({
      name: 'Pantry Green Beans',
      ingredients: ['3 lbs green beans'],
      instructions: ['Pack into jars.', 'Process the jars for 25 minutes at 10 lbs pressure.'],
    })

    const canning = matches.find((match) => match.tag === 'home_canning_low_acid')
    expect(canning).toMatchObject({
      policy: PROCESS_SAFETY_POLICIES.BLOCK,
      field: 'instruction',
      sourceField: 'instructions',
    })
    expect(canning.evidence).toContain('Process the jars')
    expect(canning.matchedTerm).toBeTruthy()
  })

  it('reads the process from a step and the food from the title', () => {
    const summary = analyzeProcessSafety({
      name: 'Green Bean Harvest Jars',
      ingredients: ['green beans'],
      instructions: ['Process the jars for 25 minutes.'],
    })

    expect(summary.blocked).toContain('home_canning_low_acid')
  })

  it('does not report a generic water-bath finding once low-acid canning blocks', () => {
    const summary = analyzeProcessSafety({
      name: 'Canned Green Beans',
      ingredients: ['green beans'],
      instructions: ['Pressure can the jars for the pantry.'],
    })

    expect(summary.tags).toEqual(['home_canning_low_acid'])
  })

  it('treats an acidified vegetable as a template case rather than a block', () => {
    const summary = analyzeProcessSafety({
      name: 'Dilly Beans',
      ingredients: ['green beans', '2 cups vinegar', 'dill'],
      instructions: ['Water bath process the jars for the pantry.'],
    })

    expect(summary.blocked).toEqual([])
    expect(summary.requires_template).toEqual(['water_bath_preserve'])
  })

  it('blocks a pressure schedule regardless of added acid', () => {
    const summary = analyzeProcessSafety({
      name: 'Canned Carrots',
      ingredients: ['carrots', '1 cup vinegar'],
      instructions: ['Pressure can the jars at 11 lbs pressure.'],
    })

    expect(summary.blocked).toEqual(['home_canning_low_acid'])
  })

  it('exempts sous vide that documents a pasteurization hold', () => {
    const withHold = analyzeProcessSafety({
      name: 'Sous Vide Chicken',
      instructions: ['Sous vide at 145F.', 'Hold at 145F for 90 minutes to pasteurize the chicken.'],
    })
    const withoutHold = analyzeProcessSafety({
      name: 'Sous Vide Chicken',
      instructions: ['Sous vide the chicken at 145F and serve.'],
    })

    expect(withHold.tags).toEqual([])
    expect(withoutHold.tags).toEqual(['sous_vide_low_temp_protein'])
  })

  it('separates a fermented ingredient from running a fermentation', () => {
    const staple = analyzeProcessSafety({
      name: 'Miso Glazed Eggplant',
      ingredients: ['3 tbsp miso paste'],
      instructions: ['Whisk the miso paste into the glaze and roast for 20 minutes.'],
    })
    const ferment = analyzeProcessSafety({
      name: 'Sauerkraut',
      ingredients: ['cabbage', 'salt'],
      instructions: ['Ferment in a crock for 3 weeks at room temperature.'],
    })

    expect(staple.tags).toEqual([])
    expect(ferment.tags).toEqual(['fermentation_anaerobic'])
  })

  it('reads preservation context from a different step than the technique', () => {
    const summary = analyzeProcessSafety({
      name: 'Garden Green Beans',
      ingredients: ['3 lbs green beans'],
      instructions: ['Can them after cooking.', 'Store in the pantry until winter.'],
    })

    expect(summary.blocked).toEqual(['home_canning_low_acid'])
  })

  it('still needs preservation context somewhere before a weak signal counts', () => {
    const summary = analyzeProcessSafety({
      name: 'Green Bean Salad',
      ingredients: ['1 lb green beans'],
      instructions: ['Blanch the beans, then shock them in ice water.', 'Toss with vinaigrette and serve.'],
    })

    expect(summary.tags).toEqual([])
  })

  it('does not treat refrigerated preserves as canning', () => {
    const summary = analyzeProcessSafety({
      name: 'Refrigerator Pickles',
      ingredients: ['cucumbers', 'vinegar'],
      instructions: ['Seal the jars and refrigerate for 24 hours.'],
    })

    expect(summary.tags).toEqual([])
  })
})

describe('process safety summary', () => {
  it('passes a plain recipe with an explicit disclaimer', () => {
    const summary = analyzeProcessSafety({
      name: 'Roast Chicken',
      ingredients: ['1 chicken'],
      instructions: ['Roast at 425F until it reaches 165F.'],
    })

    expect(summary).toMatchObject({
      checked: true,
      safe: true,
      status: 'passed',
      policy: 'allow',
      cook_gate: 'allow',
      needs_review: false,
    })
    expect(summary.disclaimer).toMatch(/does not certify/i)
  })

  it('reports warnings without withholding the recipe', () => {
    const summary = analyzeProcessSafety({
      name: 'Kimchi',
      ingredients: ['napa cabbage', 'salt'],
      instructions: ['Ferment in a jar at room temperature for 5 days.'],
    })

    expect(summary.safe).toBe(true)
    expect(summary.needs_review).toBe(true)
    expect(summary.cook_gate).toBe('confirm')
    expect(summary.warnings[0]).toMatchObject({
      tag: 'fermentation_anaerobic',
      policy: PROCESS_SAFETY_POLICIES.WARN_NEEDS_REVIEW,
    })
    expect(summary.warnings[0].guidance).toBeTruthy()
  })

  it('escalates to the most restrictive policy when hazards combine', () => {
    const summary = analyzeProcessSafety({
      name: 'Canned Foraged Mushroom Ferment',
      ingredients: ['foraged mushrooms', 'salt'],
      instructions: [
        'Ferment the mushrooms in a jar for 5 days at room temperature.',
        'Pressure can the jars for the pantry.',
      ],
    })

    expect(summary.policy).toBe(PROCESS_SAFETY_POLICIES.BLOCK)
    expect(summary.status).toBe('blocked')
    expect(summary.cook_gate).toBe('block')
    expect(summary.blocked).toEqual(expect.arrayContaining(['home_canning_low_acid', 'wild_forage_id']))
  })

  it('lists authoritative sources for every detected tag', () => {
    const summary = analyzeProcessSafety({
      name: 'Canned Green Beans',
      ingredients: ['green beans'],
      instructions: ['Pressure can the jars.'],
    })

    expect(summary.sources.length).toBeGreaterThan(0)
    for (const source of summary.sources) {
      expect(source.url).toMatch(/^https:\/\//)
      expect(source.label).toBeTruthy()
    }
  })

  it('publishes a serializable taxonomy without regexes', () => {
    const tags = Object.values(PROCESS_HAZARD_TAGS)
    expect(tags.length).toBeGreaterThanOrEqual(9)
    for (const tag of tags) {
      expect(Object.values(PROCESS_SAFETY_POLICIES)).toContain(tag.policy)
      expect(JSON.parse(JSON.stringify(tag))).toEqual(tag)
    }
  })
})

describe('policy application', () => {
  it('replaces an improvised preserving step with a referral to a tested guide', () => {
    const { recipe, rewrittenSteps } = applyProcessSafetyPolicy({
      name: 'Strawberry Jam',
      ingredients: ['berries', 'sugar', 'lemon juice'],
      instructions: ['Cook the jam until set.', 'Water bath can the jars for 10 minutes.'],
    })

    expect(rewrittenSteps).toBe(1)
    expect(recipe.instructions[0]).toBe('Cook the jam until set.')
    expect(recipe.instructions[1]).toMatch(/National Center for Home Food Preservation/)
    expect(containsProcessSchedule(instructionText(recipe))).toBe(false)
  })

  it('rewrites unsafe holding advice while keeping the rest of the recipe', () => {
    const annotated = withProcessSafetySummary({
      name: 'Fried Rice',
      ingredients: ['4 cups cooked rice'],
      instructions: ['Leave the rice on the counter overnight.', 'Fry with soy sauce and peas.'],
    })

    expect(annotated.instructions[0]).toMatch(/refrigerate within two hours/i)
    expect(annotated.instructions[1]).toBe('Fry with soy sauce and peas.')
    expect(annotated.processSafetySummary.rewritten_steps).toBe(1)
  })

  it('preserves object-shaped instruction steps', () => {
    const { recipe } = applyProcessSafetyPolicy({
      name: 'Strawberry Jam',
      ingredients: ['berries', 'lemon juice'],
      instructions: [
        { '@type': 'HowToStep', text: 'Cook the jam until set.' },
        { '@type': 'HowToStep', text: 'Water bath can the jars for 10 minutes.' },
      ],
    })

    expect(recipe.instructions[1]['@type']).toBe('HowToStep')
    expect(recipe.instructions[1].text).toMatch(/Step removed by Seasoned/)
  })

  it('does not mutate the recipe it was given', () => {
    const original = {
      name: 'Strawberry Jam',
      ingredients: ['berries', 'lemon juice'],
      instructions: ['Cook the jam.', 'Water bath can the jars for 10 minutes.'],
    }
    applyProcessSafetyPolicy(original)

    expect(original.instructions[1]).toBe('Water bath can the jars for 10 minutes.')
  })

  it('fails closed when a process schedule survives the rewrite', () => {
    const annotated = withProcessSafetySummary({
      name: 'Strawberry Jam',
      // The schedule lives in a description, which is never rewritten, so the
      // template pass cannot remove it and the recipe must be withheld.
      description: 'Water bath can the jars: process for 10 minutes at sea level.',
      ingredients: ['berries', 'lemon juice'],
      instructions: ['Cook the jam until set.'],
    })

    expect(annotated.processSafetySummary.status).toBe('blocked')
    expect(annotated.processSafetySummary.escalated).toBe('residual_process_schedule')
    expect(annotated.processSafetyValidation).toBe('BLOCKED')
  })

  it('detects numeric preservation schedules', () => {
    expect(containsProcessSchedule('Process the jars for 25 minutes.')).toBe(true)
    expect(containsProcessSchedule('Can at 10 lbs pressure.')).toBe(true)
    expect(containsProcessSchedule('Roast for 25 minutes at 400F.')).toBe(false)
  })

  it('redacts schedules from evidence without discarding the explanation', () => {
    const redacted = redactProcessSchedules('Process the jars for 25 minutes at 10 lbs pressure.')

    expect(containsProcessSchedule(redacted)).toBe(false)
    expect(redacted).toBe('Process the jars for [redacted] minutes at [redacted] lbs pressure.')
    expect(redactProcessSchedules('Sauté the onions.')).toBe('Sauté the onions.')
  })

  it('redacts every quantity in a schedule split across clauses', () => {
    // Matching each fragment independently used to redact the pressure and
    // leave the processing time behind in the 422 payload.
    const redacted = redactProcessSchedules('Pressure can the jars at 10 lbs pressure for 25 minutes.')

    expect(redacted).toBe('Pressure can the jars at [redacted] lbs pressure for [redacted] minutes.')
    expect(containsProcessSchedule(redacted)).toBe(false)
  })

  it('leaves ordinary cooking times and temperatures alone', () => {
    expect(redactProcessSchedules('Roast for 25 minutes at 400F, then rest 10 minutes.'))
      .toBe('Roast for 25 minutes at 400F, then rest 10 minutes.')
  })
})

describe('boundary helpers', () => {
  it('annotates a passing recipe without changing its steps', () => {
    const annotated = withProcessSafetySummary({
      name: 'Roast Chicken',
      ingredients: ['1 chicken'],
      instructions: ['Roast until 165F.'],
    })

    expect(annotated.processSafetyValidation).toBe('PASSED')
    expect(annotated.instructions).toEqual(['Roast until 165F.'])
    expect(annotated.processSafetySummary.rewritten_steps).toBe(0)
  })

  it('throws a 422 error carrying the summary for a blocked recipe', () => {
    expect.assertions(4)
    try {
      enforceProcessSafety({
        name: 'Canned Green Beans',
        ingredients: ['green beans'],
        instructions: ['Pressure can the jars at 10 lbs pressure for 25 minutes.'],
      })
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessSafetyError)
      expect(error.code).toBe('PROCESS_SAFETY_BLOCK')
      expect(error.status).toBe(422)
      expect(error.summary.blocked).toContain('home_canning_low_acid')
    }
  })

  it('returns a template-gated recipe instead of throwing', () => {
    const annotated = enforceProcessSafety({
      name: 'Strawberry Jam',
      ingredients: ['berries', 'lemon juice'],
      instructions: ['Cook the jam.', 'Water bath can the jars for 10 minutes.'],
    })

    expect(annotated.processSafetyValidation).toBe('TEMPLATE_REQUIRED')
    expect(annotated.processSafetySummary.cook_gate).toBe('block')
  })

  it('builds an audit record free of recipe text', () => {
    const summary = analyzeProcessSafety({
      name: 'Canned Green Beans',
      ingredients: ['green beans'],
      instructions: ['Pressure can the jars.'],
    })
    const decision = describeProcessSafetyDecision(summary, { 'process_safety.surface': 'generate' })

    expect(decision).toMatchObject({
      'process_safety.checked': true,
      'process_safety.blocked': true,
      'process_safety.status': 'blocked',
      'process_safety.blocked_tags': ['home_canning_low_acid'],
      'process_safety.surface': 'generate',
    })
    expect(JSON.stringify(decision)).not.toMatch(/green beans/i)
  })

  it('tolerates malformed recipe input', () => {
    expect(analyzeProcessSafety(null).tags).toEqual([])
    expect(analyzeProcessSafety('not a recipe').tags).toEqual([])
    expect(analyzeProcessSafety({ instructions: [null, 42, { text: '' }] }).tags).toEqual([])
    expect(analyzeProcessSafety(['Pressure can the green beans in jars.']).blocked)
      .toEqual(['home_canning_low_acid'])
  })
})

describe('feature flag', () => {
  it('is on by default', () => {
    expect(isProcessSafetyEnabled({})).toBe(true)
    expect(isProcessSafetyEnabled({ ENVIRONMENT: 'production' })).toBe(true)
    expect(isProcessSafetyEnabled({ PROCESS_SAFETY_V1: 'true' })).toBe(true)
  })

  it('cannot be switched off by the flag outside production', () => {
    expect(isProcessSafetyEnabled({ ENVIRONMENT: 'staging', PROCESS_SAFETY_V1: 'false' })).toBe(false)
    expect(isProcessSafetyEnabled({ ENVIRONMENT: 'development', PROCESS_SAFETY_V1: 'off' })).toBe(false)
    expect(isProcessSafetyEnabled({ ENVIRONMENT: 'production', PROCESS_SAFETY_V1: 'false' })).toBe(true)
  })

  it('honours an explicit break-glass switch anywhere', () => {
    expect(isProcessSafetyEnabled({ ENVIRONMENT: 'production', PROCESS_SAFETY_BREAK_GLASS: 'true' })).toBe(false)
  })
})
