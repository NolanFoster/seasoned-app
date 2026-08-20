/**
 * Workers AI model IDs used by the clipper.
 *
 * Keep every `env.AI.run(...)` call in this worker pointed at a constant from
 * this module so model reviews stay a one-line change.
 */

/**
 * Extraction model for turning page text and video transcripts into recipe JSON.
 *
 * Gemma 4 26B-A4B (26B MoE, ~4B active) replaced `@cf/meta/llama-3.1-8b-instruct`:
 * it is ~65% cheaper per token on both input and output, and its 256K context
 * window removes the truncation risk the previous model's ~8K window created for
 * long article bodies and transcripts.
 */
export const CLIPPER_LLM_MODEL = '@cf/google/gemma-4-26b-a4b-it';
