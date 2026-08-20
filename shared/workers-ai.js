/**
 * Helpers for reading Cloudflare Workers AI text-generation responses.
 *
 * Workers AI does not use one response shape across models. Native models
 * (Llama, Granite, gpt-oss via the `prompt` input) return `{ response: ... }`;
 * models served through the OpenAI-compatible layer -- Gemma 4 always, gpt-oss
 * when called with `messages` -- return a chat completion whose content sits at
 * `choices[0].message.content`; streaming and some fallbacks return a bare
 * string. Reading only `.response` silently breaks when the model changes, so
 * route every text completion through these helpers.
 */

/**
 * Pull the model's content out of a raw `env.AI.run(...)` result, preserving its
 * native type. With `response_format: json_schema` some models return an already
 * parsed object rather than a JSON string, so callers that need an object should
 * use {@link extractAiObject} instead of assuming either.
 *
 * @param {unknown} response Raw value returned by `env.AI.run(...)`.
 * @returns {object|string|null} The generated content, or null when absent.
 */
export function extractAiContent(response) {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return null;

  // OpenAI-compatible chat completion.
  const choice = Array.isArray(response.choices) ? response.choices[0] : null;
  if (choice) {
    const content = choice.message?.content ?? choice.text ?? choice.delta?.content;
    if (content !== undefined && content !== null) return content;
  }

  // Native Workers AI shape, plus the loose aliases older call sites accepted.
  for (const key of ['response', 'result', 'text', 'content']) {
    const value = response[key];
    if (typeof value === 'string' || (value && typeof value === 'object')) return value;
  }

  return null;
}

/**
 * Same as {@link extractAiContent}, but always returns text. Objects are
 * stringified so callers that scan for embedded JSON still have something to work
 * with.
 *
 * @param {unknown} response Raw value returned by `env.AI.run(...)`.
 * @returns {string|null} The generated text, or null when absent.
 */
export function extractAiText(response) {
  const content = extractAiContent(response);
  if (content === null) return null;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * Same as {@link extractAiContent}, but always returns a parsed object, parsing a
 * JSON string when the model returned text instead of structured output.
 *
 * @param {unknown} response Raw value returned by `env.AI.run(...)`.
 * @returns {object|null} The parsed object, or null when absent or unparseable.
 */
export function extractAiObject(response) {
  const content = extractAiContent(response);
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string') return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
