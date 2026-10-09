import assert from 'node:assert/strict';
import worker from '../src/recipe-clipper.js';

const pageUrl = 'https://recipes.example.test/roma-tomatoes';
const html = `
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": "Roma tomato salad",
      "image": "https://recipes.example.test/salad.jpg",
      "recipeCuisine": "Thai",
      "recipeIngredient": ["2 cups fresh diced Roma tomatoes", "1 tsp salt"],
      "recipeInstructions": ["Mix and serve."]
    }
  </script>
`;

async function clip(mode) {
  let persistedRecipe = null;
  const env = {
    INGREDIENT_ENTITY_V1: mode,
    RECIPE_STORAGE: { get: async () => null },
    RECIPE_SAVE_WORKER: {
      fetch: async (_path, init) => {
        persistedRecipe = JSON.parse(init.body).recipe;
        return new Response(JSON.stringify({ success: true, id: 'saved-recipe' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  };
  globalThis.fetch = async () => ({ ok: true, text: async () => html });
  const request = new Request('https://clipper.example.test/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: pageUrl })
  });
  const response = await worker.fetch(request, env);
  return { response, persistedRecipe };
}

const enabled = await clip('on');
assert.equal(enabled.response.status, 200);
const enabledRecipe = await enabled.response.json();
assert.equal(enabledRecipe.ingredientEntities.length, 2);
assert.equal(enabledRecipe.ingredientEntities[0].attributes.state, 'diced');
assert.equal(enabled.persistedRecipe.ingredientEntities.length, 2);
assert.equal(enabledRecipe.geoCultural.source, 'absent');

const shadow = await clip('shadow');
assert.equal(shadow.response.status, 200);
const shadowRecipe = await shadow.response.json();
assert.equal(Object.hasOwn(shadowRecipe, 'ingredientEntities'), false);
assert.equal(Object.hasOwn(shadow.persistedRecipe, 'ingredientEntities'), false);

console.log('Ingredient entity clipper integration checks passed.');
