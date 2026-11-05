import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../src/index.js';
import { mockAI } from '../__mocks__/ai-mock.js';

function makeBucket() {
  const store = new Map();
  return {
    store,
    put: vi.fn(async (key, value, options) => {
      store.set(key, { value, options });
    }),
    get: vi.fn(async (key) => {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        body: new Uint8Array(entry.value),
        size: entry.value.byteLength,
        httpEtag: '"etag-1"',
        httpMetadata: entry.options?.httpMetadata
      };
    }),
    head: vi.fn(async (key) => {
      const entry = store.get(key);
      return entry ? { size: entry.value.byteLength, httpMetadata: entry.options?.httpMetadata } : null;
    })
  };
}

describe('GET /images/<key>', () => {
  let env;

  beforeEach(() => {
    env = {
      IMAGE_DOMAIN: 'https://ai-image-generation-worker.example.workers.dev/images',
      AI: mockAI,
      AI_GENERATED_RECIPE_IMAGES: makeBucket()
    };
  });

  it('serves the image that /generate just returned a URL for', async () => {
    const genResponse = await worker.fetch(new Request('https://ai-image-generation-worker/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: { name: 'Tomato Soup', ingredients: ['tomato'] } })
    }), env, {});
    const { imageUrl } = await genResponse.json();

    expect(imageUrl).toMatch(
      /^https:\/\/ai-image-generation-worker\.example\.workers\.dev\/images\/ai-generated\/recipe-tomato-soup-[a-z0-9-]+\.png$/
    );

    const response = await worker.fetch(new Request(imageUrl), env, {});
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('ETag')).toBe('"etag-1"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('answers HEAD without a body', async () => {
    env.AI_GENERATED_RECIPE_IMAGES.store.set('ai-generated/recipe-x-1.png', {
      value: new Uint8Array([1, 2, 3]).buffer,
      options: { httpMetadata: { contentType: 'image/png' } }
    });
    const response = await worker.fetch(
      new Request('https://w.example/images/ai-generated/recipe-x-1.png', { method: 'HEAD' }), env, {}
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('3');
    expect(env.AI_GENERATED_RECIPE_IMAGES.get).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing image', async () => {
    const response = await worker.fetch(
      new Request('https://w.example/images/ai-generated/recipe-missing-1.png'), env, {}
    );
    expect(response.status).toBe(404);
  });

  it.each([
    '/images/other-prefix/recipe-1.png',
    '/images/ai-generated/../secret.png',
    '/images/ai-generated/%2e%2e%2fsecret.png',
    '/images/ai-generated/recipe-1.jpg',
    '/images/'
  ])('refuses keys outside ai-generated/*.png: %s', async (path) => {
    const response = await worker.fetch(new Request(`https://w.example${path}`), env, {});
    expect(response.status).toBe(404);
    expect(env.AI_GENERATED_RECIPE_IMAGES.get).not.toHaveBeenCalled();
  });

  it('returns 404 when the bucket binding is missing', async () => {
    delete env.AI_GENERATED_RECIPE_IMAGES;
    const response = await worker.fetch(
      new Request('https://w.example/images/ai-generated/recipe-x-1.png'), env, {}
    );
    expect(response.status).toBe(404);
  });
});
