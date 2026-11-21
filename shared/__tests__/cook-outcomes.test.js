import { describe, it, expect } from 'vitest';
import {
  OUTCOME_OVERALL,
  OUTCOME_TAGS,
  normalizeCookOutcome,
  aggregateCookOutcomes
} from '../cook-outcomes.js';

describe('cook-outcomes schema and helpers', () => {
  it('exports expected constants', () => {
    expect(OUTCOME_OVERALL).toEqual(['again', 'ok', 'nope']);
    expect(OUTCOME_TAGS).toContain('too_salty');
    expect(OUTCOME_TAGS).toContain('crowd_pleaser');
  });

  it('normalizes valid cook outcome event', () => {
    const raw = {
      recipeId: 'rec-123',
      recipeName: 'Lemon Herb Salmon',
      overall: 'again',
      tags: ['hit_macros', 'quick_cleanup', 'invalid_tag'],
      spiceDelta: 1,
      notes: 'Delicious with rice',
      source: 'navigator',
      consent: true
    };

    const normalized = normalizeCookOutcome(raw);
    expect(normalized.recipeId).toBe('rec-123');
    expect(normalized.recipeName).toBe('Lemon Herb Salmon');
    expect(normalized.overall).toBe('again');
    expect(normalized.tags).toEqual(['hit_macros', 'quick_cleanup']);
    expect(normalized.spiceDelta).toBe(1);
    expect(normalized.source).toBe('navigator');
    expect(normalized.consent).toBe(true);
  });

  it('throws when recipeId is missing', () => {
    expect(() => normalizeCookOutcome({})).toThrow(/recipeId is required/);
  });

  it('aggregates multiple cook outcome events', () => {
    const events = [
      {
        recipeId: 'rec-1',
        recipeName: 'Pasta',
        overall: 'again',
        tags: ['flavor_bomb'],
        spiceDelta: 1,
        consent: true
      },
      {
        recipeId: 'rec-2',
        recipeName: 'Chicken Curry',
        overall: 'nope',
        tags: ['too_spicy', 'too_salty'],
        spiceDelta: -2,
        consent: true
      },
      {
        recipeId: 'rec-3',
        recipeName: 'Salad',
        overall: 'ok',
        tags: [],
        consent: false // should be skipped
      }
    ];

    const agg = aggregateCookOutcomes(events);
    expect(agg.totalCooks).toBe(2);
    expect(agg.againCount).toBe(1);
    expect(agg.nopeCount).toBe(1);
    expect(agg.tagFrequencies['too_spicy']).toBe(1);
    expect(agg.tagFrequencies['flavor_bomb']).toBe(1);
    expect(agg.spiceBias).toBe(-0.5);
    expect(agg.fixSuggestions).toHaveLength(1);
    expect(agg.fixSuggestions[0].recipeId).toBe('rec-2');
  });
});
