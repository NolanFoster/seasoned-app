/**
 * Workers AI model IDs used by the recommendation worker.
 *
 * Keep every `env.AI.run(...)` call in this worker pointed at a constant from
 * this module so model reviews stay a one-line change.
 */

/**
 * Model behind category recommendations and AI-only recipe generation.
 *
 * Gemma 4 26B-A4B (26B MoE, ~4B active) replaced `@cf/meta/llama-3.1-8b-instruct`,
 * which was the most expensive 8B variant on Workers AI. This is ~65% cheaper per
 * token on both input and output with a 256K context window instead of ~8K.
 */
export const RECOMMENDATION_LLM_MODEL = '@cf/google/gemma-4-26b-a4b-it';
