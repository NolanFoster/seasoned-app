// YouTube recipe extractor
// Detects YouTube URLs, fetches metadata + transcript, and asks the
// existing Cloudflare Workers AI binding to synthesize a Google Recipe
// JSON object from the spoken/written content.
import {
  extractRecipeFromAIResponse,
  cleanRecipeData
} from './recipe-clipper.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
]);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_TRANSCRIPT_CHARS = 10000;

/**
 * Returns the canonical 11-character YouTube video ID for a URL, or null
 * if the URL is not a recognized YouTube watch/shorts/share link.
 */
export function isYouTubeUrl(input) {
  if (!input || typeof input !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return isValidVideoId(id) ? id : null;
  }

  if (parsed.pathname === '/watch') {
    const id = parsed.searchParams.get('v');
    return isValidVideoId(id) ? id : null;
  }

  const shortsMatch = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
  if (shortsMatch) {
    return isValidVideoId(shortsMatch[1]) ? shortsMatch[1] : null;
  }

  return null;
}

function isValidVideoId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

/**
 * Fetches a YouTube watch page and pulls structured metadata out of the
 * embedded ytInitialPlayerResponse JSON blob. Falls back to the public
 * oEmbed endpoint for title/author/thumbnail when scraping fails.
 */
export async function fetchYouTubeMetadata(videoId, fetchImpl = fetch) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let html;
  try {
    const res = await fetchImpl(watchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (res && res.ok) {
      html = await res.text();
    }
  } catch (err) {
    console.warn('YouTube watch page fetch failed:', err.message);
  }

  let player = null;
  if (html) {
    player = extractPlayerResponse(html);
  }

  if (player && player.videoDetails) {
    const details = player.videoDetails;
    const captionTracks =
      player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const thumbnails = details.thumbnail?.thumbnails || [];
    const bestThumb = thumbnails.length
      ? thumbnails[thumbnails.length - 1].url
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    return {
      videoId,
      title: details.title || '',
      description: details.shortDescription || '',
      author: details.author || '',
      lengthSeconds: Number(details.lengthSeconds) || null,
      thumbnail: bestThumb,
      watchUrl,
      captionTracks
    };
  }

  // oEmbed fallback — gives us title/author/thumbnail even when the watch
  // page is age-restricted or the layout changes. No captions here.
  try {
    const oembedRes = await fetchImpl(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (oembedRes && oembedRes.ok) {
      const data = await oembedRes.json();
      return {
        videoId,
        title: data.title || '',
        description: '',
        author: data.author_name || '',
        lengthSeconds: null,
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        watchUrl,
        captionTracks: []
      };
    }
  } catch (err) {
    console.warn('YouTube oEmbed fallback failed:', err.message);
  }

  throw new Error('Unable to fetch YouTube video metadata');
}

function extractPlayerResponse(html) {
  // The blob appears as `var ytInitialPlayerResponse = {...};` in the page.
  // Use a balanced-brace scan to avoid greedy/lazy regex pitfalls.
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const braceStart = html.indexOf('{', idx);
  if (braceStart === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const json = html.slice(braceStart, i + 1);
        try {
          return JSON.parse(json);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Picks the best English caption track and downloads it as plain text.
 * Returns null when no usable tracks exist.
 */
export async function fetchTranscript(captionTracks, fetchImpl = fetch) {
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    return null;
  }

  const track = pickCaptionTrack(captionTracks);
  if (!track || !track.baseUrl) return null;

  const url = track.baseUrl.includes('fmt=')
    ? track.baseUrl
    : `${track.baseUrl}&fmt=json3`;

  let res;
  try {
    res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch (err) {
    console.warn('Transcript fetch failed:', err.message);
    return null;
  }
  if (!res || !res.ok) return null;

  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed.events || !Array.isArray(parsed.events)) return null;

  const parts = [];
  for (const event of parsed.events) {
    if (!event.segs) continue;
    for (const seg of event.segs) {
      if (typeof seg.utf8 === 'string') parts.push(seg.utf8);
    }
  }
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

function pickCaptionTrack(tracks) {
  const preferred = ['en', 'en-US', 'en-GB'];
  // Prefer manually authored English tracks over auto-generated ones.
  for (const lang of preferred) {
    const manual = tracks.find(
      (t) => t.languageCode === lang && t.kind !== 'asr'
    );
    if (manual) return manual;
  }
  for (const lang of preferred) {
    const asr = tracks.find((t) => t.languageCode === lang);
    if (asr) return asr;
  }
  // Last resort: any non-asr, then anything at all.
  return tracks.find((t) => t.kind !== 'asr') || tracks[0];
}

/**
 * Builds the LLM prompt asking for a Google Recipe-shaped JSON object
 * derived from the video's title, description, and transcript.
 */
export function buildYouTubeRecipePrompt({ title, description, author, thumbnail, transcript }) {
  const truncatedTranscript =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + '...[truncated]'
      : transcript;

  return `You are a recipe extraction expert. The following is a YouTube cooking video. Synthesize a recipe from the title, description, and spoken transcript. Return ONLY a valid JSON object matching Google's Recipe structured data schema. No markdown, no explanations.

Required JSON shape:
{
  "name": "Recipe name (derived from the video title)",
  "image": "${thumbnail}",
  "description": "One-sentence description (use the first sentence of the video description if it fits)",
  "author": "${author}",
  "prepTime": "ISO 8601 duration (e.g. PT15M) if mentioned, otherwise empty string",
  "cookTime": "ISO 8601 duration if mentioned, otherwise empty string",
  "totalTime": "",
  "recipeYield": "Servings if mentioned (e.g. '4 servings')",
  "recipeCategory": "",
  "recipeCuisine": "",
  "keywords": "",
  "recipeIngredient": ["ingredient 1 with quantity", "ingredient 2 with quantity"],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Step 1 derived from the spoken steps"},
    {"@type": "HowToStep", "text": "Step 2 derived from the spoken steps"}
  ]
}

CRITICAL:
- Always set "image" to exactly: ${thumbnail}
- Always set "author" to exactly: ${author}
- NO markdown code blocks
- NO trailing commas
- Derive ingredients with quantities from the transcript and description; do not invent ingredients you cannot infer
- Derive instructions from the spoken steps in the order they happen
- If no recipe can be reliably extracted, return: null

VIDEO TITLE: ${title}

VIDEO DESCRIPTION:
${description || '(none)'}

TRANSCRIPT:
${truncatedTranscript}`;
}

/**
 * Top-level orchestration. Throws when no transcript is available so the
 * /clip handler returns its existing 404.
 */
export async function extractRecipeFromYouTube(pageUrl, env, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const videoId = isYouTubeUrl(pageUrl);
  if (!videoId) {
    throw new Error('Not a YouTube URL');
  }

  if (!env || !env.AI) {
    throw new Error('AI binding not available - YouTube extraction requires Cloudflare Workers AI');
  }

  const meta = await fetchYouTubeMetadata(videoId, fetchImpl);
  const transcript = await fetchTranscript(meta.captionTracks, fetchImpl);
  if (!transcript) {
    throw new Error('No transcript available for this YouTube video');
  }

  const prompt = buildYouTubeRecipePrompt({
    title: meta.title,
    description: meta.description,
    author: meta.author,
    thumbnail: meta.thumbnail,
    transcript
  });

  const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    prompt,
    max_tokens: 1024
  });

  const recipe = extractRecipeFromAIResponse(aiResponse, pageUrl);
  if (!recipe) return null;

  // Ensure video-specific fields are populated regardless of what the LLM produced.
  if (!recipe.image) recipe.image = meta.thumbnail;
  if (!recipe.image_url) recipe.image_url = recipe.image;
  if (!recipe.author) recipe.author = meta.author;
  if (!recipe.name) recipe.name = meta.title;
  // The validator passes empty strings through; replace any blank with the thumbnail.
  if (typeof recipe.image === 'string' && recipe.image.trim() === '') {
    recipe.image = meta.thumbnail;
    recipe.image_url = meta.thumbnail;
  }
  recipe.video = {
    '@type': 'VideoObject',
    name: meta.title,
    description: meta.description,
    contentUrl: meta.watchUrl,
    thumbnailUrl: meta.thumbnail
  };
  recipe.sourceType = 'youtube';

  return cleanRecipeData(recipe);
}
