/**
 * Serves generated images straight from the AI_GENERATED_RECIPE_IMAGES bucket.
 *
 * The bucket has no public custom domain of its own (images.seasonedapp.com
 * points at the clipper's recipe-images bucket), so this worker is the public
 * host for the images it generates: /images/<key> serves R2 object <key>.
 */

export const IMAGE_ROUTE_PREFIX = '/images/';

// Only keys this worker writes: ai-generated/<slug>.png
const IMAGE_KEY_PATTERN = /^ai-generated\/[a-z0-9-]+\.png$/;

const baseHeaders = {
  'Access-Control-Allow-Origin': '*'
};

function notFound() {
  return new Response(JSON.stringify({ error: 'Image not found' }), {
    status: 404,
    headers: { ...baseHeaders, 'Content-Type': 'application/json' }
  });
}

export async function handleImage(request, env) {
  const { pathname } = new URL(request.url);
  let key;
  try {
    key = decodeURIComponent(pathname.slice(IMAGE_ROUTE_PREFIX.length));
  } catch {
    return notFound();
  }
  if (!IMAGE_KEY_PATTERN.test(key) || !env.AI_GENERATED_RECIPE_IMAGES) {
    return notFound();
  }

  const object = request.method === 'HEAD'
    ? await env.AI_GENERATED_RECIPE_IMAGES.head(key)
    : await env.AI_GENERATED_RECIPE_IMAGES.get(key);
  if (!object) return notFound();

  const headers = new Headers(baseHeaders);
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', object.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  if (typeof object.size === 'number') headers.set('Content-Length', String(object.size));

  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}
