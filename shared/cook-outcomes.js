/**
 * Structured Cook Outcome feedback schema & aggregation helpers (#342 / #301)
 */

export const OUTCOME_OVERALL = Object.freeze(['again', 'ok', 'nope']);

export const OUTCOME_TAGS = Object.freeze([
  'too_salty',
  'too_bland',
  'too_spicy',
  'not_spicy_enough',
  'too_dry',
  'too_wet',
  'underdone',
  'overdone',
  'too_much_work',
  'too_long',
  'kid_no',
  'hit_macros',
  'great_texture',
  'flavor_bomb',
  'quick_cleanup',
  'crowd_pleaser'
]);

/**
 * Validate and normalize a cook outcome event object
 */
export function normalizeCookOutcome(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('Invalid cook outcome payload');
  }

  const recipeId = event.recipeId ? String(event.recipeId).trim() : null;
  if (!recipeId) {
    throw new Error('recipeId is required');
  }

  const overall = OUTCOME_OVERALL.includes(event.overall) ? event.overall : 'ok';
  
  const rawTags = Array.isArray(event.tags) ? event.tags : [];
  const tags = rawTags.filter(t => OUTCOME_TAGS.includes(t));

  let spiceDelta = null;
  if (typeof event.spiceDelta === 'number' && Number.isInteger(event.spiceDelta)) {
    spiceDelta = Math.max(-2, Math.min(2, event.spiceDelta));
  }

  const cookedAt = event.cookedAt && !Number.isNaN(new Date(event.cookedAt).getTime())
    ? new Date(event.cookedAt).toISOString()
    : new Date().toISOString();

  const source = ['navigator', 'card', 'agent'].includes(event.source) ? event.source : 'navigator';
  const notes = typeof event.notes === 'string' ? event.notes.slice(0, 500) : '';
  const consent = event.consent !== false;

  return {
    recipeId,
    variantId: event.variantId ? String(event.variantId) : null,
    recipeName: typeof event.recipeName === 'string' ? event.recipeName.slice(0, 200) : '',
    cookedAt,
    overall,
    tags,
    spiceDelta,
    notes,
    source,
    consent
  };
}

/**
 * Aggregates a list of outcome events into user profile soft adjustments
 */
export function aggregateCookOutcomes(outcomes = []) {
  const aggregated = {
    totalCooks: 0,
    againCount: 0,
    nopeCount: 0,
    tagFrequencies: {},
    spiceBias: 0,
    fixSuggestions: []
  };

  let totalSpiceDelta = 0;
  let spiceDeltaCount = 0;

  outcomes.forEach((o) => {
    if (!o.consent) return;
    aggregated.totalCooks += 1;
    if (o.overall === 'again') aggregated.againCount += 1;
    if (o.overall === 'nope') aggregated.nopeCount += 1;

    (o.tags || []).forEach((tag) => {
      aggregated.tagFrequencies[tag] = (aggregated.tagFrequencies[tag] || 0) + 1;
    });

    if (typeof o.spiceDelta === 'number') {
      totalSpiceDelta += o.spiceDelta;
      spiceDeltaCount += 1;
    }

    if (o.overall === 'nope' || (o.tags && o.tags.some(t => t.startsWith('too_') || t === 'underdone' || t === 'overdone'))) {
      aggregated.fixSuggestions.push({
        recipeId: o.recipeId,
        recipeName: o.recipeName,
        tags: o.tags,
        cookedAt: o.cookedAt
      });
    }
  });

  if (spiceDeltaCount > 0) {
    aggregated.spiceBias = Math.round((totalSpiceDelta / spiceDeltaCount) * 10) / 10;
  }

  return aggregated;
}
