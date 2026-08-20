/**
 * Workers AI model IDs used by the generation worker.
 *
 * Keep every `env.AI.run(...)` call in this worker pointed at a constant from
 * this module so model reviews stay a one-line change.
 */

/**
 * Model behind recipe generation, elevation, and adaptation.
 *
 * gpt-oss-120b replaced `@cf/meta/llama-4-scout-17b-16e-instruct`. Input costs
 * ~30% more per token and output ~12% less, so the swap breaks even when output
 * exceeds 0.8x input — which these calls do, running max_tokens of 2048-3072
 * against prompts of a few hundred tokens.
 */
export const RECIPE_LLM_MODEL = '@cf/openai/gpt-oss-120b';

/**
 * Model behind grocery list aggregation.
 *
 * Granite 4.0 H Micro replaced `@cf/meta/llama-3.2-3b-instruct` at ~67% lower cost
 * on both input and output. Granite 4.0 is tuned for instruction following, which
 * is what the multi-rule aggregation prompt leans on.
 */
export const GROCERY_LLM_MODEL = '@cf/ibm-granite/granite-4.0-h-micro';

/**
 * Embedding model for similar-recipe lookup.
 *
 * Pinned to bge-small because the Vectorize index (`recipe-vectors-384`) is built
 * for its 384 dimensions. Cheaper and stronger 1024-dim models exist, but adopting
 * one requires a new index and a full re-embed of the corpus.
 */
export const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
