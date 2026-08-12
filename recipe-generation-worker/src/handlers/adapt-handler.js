import { buildGenerationConstraints, normalizeCulinaryProfile } from '../../../shared/culinary-profile.js';
import {
  AllergenSafetyError,
  enforceAllergenSafety
} from '../../../shared/allergen-graph.js';

const ADAPT_CONSTRAINT_FIELDS = [
  'dietary',
  'hardAllergens',
  'softAvoids',
  'cuisine',
  'equipment',
  'servings',
  'maxCookTime',
  'spiceLevel',
  'skillLevel',
  'excludeIngredients',
  'nutritionGoals',
  'units',
  'preserve'
];

const MOCK_SUBSTITUTIONS = [
  {
    allergen: 'milk',
    terms: /\b(?:milk|butter|ghee|cream|cheese|yogurt|yoghurt|whey)\b/i,
    replacement: 'olive oil or an unsweetened plant-based alternative',
    reason: 'Replaces dairy while preserving richness and moisture.'
  },
  {
    allergen: 'eggs',
    terms: /\b(?:eggs?|mayonnaise)\b/i,
    replacement: '1 tablespoon ground flaxseed mixed with 3 tablespoons water',
    reason: 'Provides binding without using eggs.'
  },
  {
    allergen: 'fish',
    terms: /\b(?:fish|salmon|tuna|cod|anchov(?:y|ies)|sardines?|fish sauce)\b/i,
    replacement: 'mushrooms and a splash of tamari-free vegetable broth',
    reason: 'Adds savory depth without fish.'
  },
  {
    allergen: 'shellfish',
    terms: /\b(?:shellfish|shrimp|prawn|crab|lobster|scallop|mussel|oyster|clam)\b/i,
    replacement: 'hearts of palm or mushrooms',
    reason: 'Preserves a satisfying bite without shellfish.'
  },
  {
    allergen: 'tree_nuts',
    terms: /\b(?:almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamias?|pine nuts?|marzipan)\b/i,
    replacement: 'toasted pumpkin seeds',
    reason: 'Adds crunch without tree nuts.'
  },
  {
    allergen: 'peanuts',
    terms: /\b(?:peanuts?|groundnuts?|peanut butter)\b/i,
    replacement: 'sunflower seed butter',
    reason: 'Preserves the creamy, nutty role without peanuts.'
  },
  {
    allergen: 'wheat',
    terms: /\b(?:wheat|gluten|flour|bread|pasta|semolina|couscous|panko|breadcrumb)\b/i,
    replacement: 'certified rice noodles or corn-based alternative',
    reason: 'Keeps the recipe structure while avoiding wheat.'
  },
  {
    allergen: 'soy',
    terms: /\b(?:soy|soya|soybean|tofu|tempeh|edamame|miso|tamari|soy sauce|lecithin)\b/i,
    replacement: 'coconut aminos',
    reason: 'Adds umami without soy.'
  },
  {
    allergen: 'sesame',
    terms: /\b(?:sesame|tahini|benne|gomasio)\b/i,
    replacement: 'toasted pumpkin seeds',
    reason: 'Adds a similar toasted finish without sesame.'
  }
];

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function recipeLines(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

function buildConstraintOverrides(requestBody) {
  const nested = objectOrEmpty(requestBody.constraints);
  const topLevel = {};
  for (const field of ADAPT_CONSTRAINT_FIELDS) {
    if (requestBody[field] !== undefined) topLevel[field] = requestBody[field];
  }
  return { ...nested, ...topLevel };
}

function findSubstitution(line, constraints) {
  const allergens = new Set([
    ...(constraints.hardAllergens || []),
    ...((constraints.dietary || []).includes('dairy_free') || (constraints.dietary || []).includes('vegan') ? ['milk'] : []),
    ...((constraints.dietary || []).includes('vegan') ? ['eggs'] : []),
    ...((constraints.dietary || []).includes('gluten_free') ? ['wheat'] : [])
  ]);
  for (const substitution of MOCK_SUBSTITUTIONS) {
    if (allergens.has(substitution.allergen) && substitution.terms.test(line)) {
      return substitution;
    }
  }
  return null;
}

function mockAdaptRecipe(baseRecipe, constraints) {
  const substitutions = [];
  const ingredients = recipeLines(baseRecipe.ingredients).map((line) => {
    const substitution = findSubstitution(line, constraints);
    if (!substitution) return line;
    const adaptedLine = line.replace(substitution.terms, substitution.replacement);
    substitutions.push({
      from: line,
      to: adaptedLine,
      reason: substitution.reason
    });
    return adaptedLine;
  });

  const adaptationNotes = [
    'The dish identity, cuisine, and cooking sequence were preserved where possible.'
  ];
  if (constraints.maxCookTime) {
    adaptationNotes.push(`Keep the total cook time at or below ${constraints.maxCookTime} minutes.`);
  }
  if (constraints.equipment?.length) {
    adaptationNotes.push(`Use only the available equipment: ${constraints.equipment.join(', ')}.`);
  }
  if (substitutions.length === 0) {
    adaptationNotes.push('No direct ingredient substitutions were required for the selected constraints.');
  }

  return {
    ...baseRecipe,
    ingredients: ingredients.length > 0 ? ingredients : baseRecipe.ingredients || [],
    instructions: recipeLines(baseRecipe.instructions),
    substitutions,
    adaptationNotes,
    adaptationMethod: 'mock-ai',
    mockMode: true
  };
}

function normalizeAdaptedRecipe(response, baseRecipe) {
  let adapted = response;
  if (typeof adapted === 'string') {
    try {
      adapted = JSON.parse(adapted);
    } catch {
      throw new Error('AI returned invalid JSON for recipe adaptation');
    }
  }
  if (adapted?.recipe && typeof adapted.recipe === 'object') adapted = adapted.recipe;
  if (!adapted || typeof adapted !== 'object' || Array.isArray(adapted)) {
    throw new Error('AI returned an invalid recipe adaptation');
  }

  const normalized = { ...adapted };
  if (normalized.Ingredients && !normalized.ingredients) normalized.ingredients = normalized.Ingredients;
  if (normalized.Instructions && !normalized.instructions) normalized.instructions = normalized.Instructions;
  if (normalized.Name && !normalized.name) normalized.name = normalized.Name;
  if (normalized.Description && !normalized.description) normalized.description = normalized.Description;
  if (normalized.dietaryConsiderations && !normalized.dietary) normalized.dietary = normalized.dietaryConsiderations;

  return {
    ...baseRecipe,
    ...normalized,
    name: asString(normalized.name, baseRecipe.name || 'Adapted recipe'),
    description: asString(normalized.description, baseRecipe.description || ''),
    ingredients: recipeLines(normalized.ingredients).length > 0
      ? recipeLines(normalized.ingredients)
      : recipeLines(baseRecipe.ingredients),
    instructions: recipeLines(normalized.instructions).length > 0
      ? recipeLines(normalized.instructions)
      : recipeLines(baseRecipe.instructions),
    substitutions: Array.isArray(normalized.substitutions) ? normalized.substitutions : [],
    adaptationNotes: Array.isArray(normalized.adaptationNotes)
      ? normalized.adaptationNotes
      : Array.isArray(normalized.adaptation_notes) ? normalized.adaptation_notes : [],
    dietary: Array.isArray(normalized.dietary) ? normalized.dietary : baseRecipe.dietary || []
  };
}

function applyLineage(recipe, baseRecipe, constraints, method) {
  const baseId = baseRecipe.id || baseRecipe.recipeId || baseRecipe.source_url || baseRecipe.url || null;
  return {
    ...recipe,
    source: 'adapted',
    adapted_from: baseId,
    adaptedFrom: baseId,
    adaptation_constraints: constraints,
    adaptationConstraints: constraints,
    adaptationMethod: recipe.adaptationMethod || method,
    adaptedAt: new Date().toISOString(),
    substitutions: Array.isArray(recipe.substitutions) ? recipe.substitutions : [],
    adaptationNotes: Array.isArray(recipe.adaptationNotes) ? recipe.adaptationNotes : []
  };
}

async function adaptWithAI(baseRecipe, constraints, env) {
  const systemPrompt = `You are a careful culinary adaptation expert. Rewrite an existing recipe to fit the requested constraints while preserving its recognizable dish identity, cuisine, core protein, and cooking sequence whenever possible.

Return valid JSON only. Never include commentary outside the JSON. Hard allergens are absolute: do not include them, even in optional garnishes or substitutions. Keep measurements and times honest. Explain every meaningful ingredient change in substitutions and adaptationNotes. Unknown packaged ingredients should be called out for label verification.

Required JSON fields: name, description, ingredients, instructions, prepTime, cookTime, totalTime, servings, difficulty, cuisine, dietary, substitutions, adaptationNotes.`;
  const userPrompt = `Adapt this recipe without turning it into a completely different dish.

Base recipe:
${JSON.stringify(baseRecipe)}

Requested constraints:
${JSON.stringify(constraints)}

Preserve these aspects where possible: flavor profile, cuisine, core protein, recognizable name, and overall recipe structure.
Hard allergens to exclude: ${(constraints.hardAllergens || []).join(', ') || 'none'}.
Return substitutions as objects with from, to, and reason fields. Return adaptationNotes as concise strings.`;

  const response = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'recipe_adaptation',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            ingredients: { type: 'array', items: { type: 'string' } },
            instructions: { type: 'array', items: { type: 'string' } },
            prepTime: { type: 'string' },
            cookTime: { type: 'string' },
            totalTime: { type: 'string' },
            servings: { type: 'string' },
            difficulty: { type: 'string' },
            cuisine: { type: 'string' },
            dietary: { type: 'array', items: { type: 'string' } },
            substitutions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  reason: { type: 'string' }
                },
                required: ['from', 'to', 'reason']
              }
            },
            adaptationNotes: { type: 'array', items: { type: 'string' } }
          },
          required: ['name', 'description', 'ingredients', 'instructions', 'substitutions', 'adaptationNotes']
        }
      }
    },
    max_tokens: 3072,
    temperature: 0.35
  });

  if (!response || response.response === undefined) {
    throw new Error('Invalid response from LLaMA model for recipe adaptation');
  }
  return normalizeAdaptedRecipe(response.response, baseRecipe);
}

/**
 * Adapt an existing recipe to explicit constraints while preserving its identity.
 * The endpoint is deliberately separate from /generate and the legacy Elevate flow.
 */
export async function handleAdapt(request, env, corsHeaders) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestBody = objectOrEmpty(await request.json());
    const baseRecipe = objectOrEmpty(requestBody.baseRecipe || requestBody.recipe);
    if (!baseRecipe.name || !Array.isArray(baseRecipe.ingredients) || baseRecipe.ingredients.length === 0) {
      return new Response(JSON.stringify({
        error: 'baseRecipe with a name and non-empty ingredients array is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const profile = requestBody.culinaryProfile || requestBody.profile || {};
    const constraintOverrides = buildConstraintOverrides(requestBody);
    const constraints = buildGenerationConstraints(profile, constraintOverrides);
    // A profile's hard allergens are safety policy, not a per-adaptation toggle.
    // Explicit additions are accepted, but an adaptation cannot clear saved blocks.
    const profileHardAllergens = normalizeCulinaryProfile(profile).hard_allergens;
    const requestedHardAllergens = Array.isArray(constraintOverrides.hardAllergens)
      ? constraintOverrides.hardAllergens
      : [];
    constraints.hardAllergens = [...new Set([...profileHardAllergens, ...requestedHardAllergens])];
    constraints.preserve = Array.isArray(constraintOverrides.preserve)
      ? constraintOverrides.preserve.filter((item) => typeof item === 'string' && item.trim()).slice(0, 10)
      : [];

    const adapted = env.AI
      ? await adaptWithAI(baseRecipe, constraints, env)
      : mockAdaptRecipe(baseRecipe, constraints);
    const finalRecipe = enforceAllergenSafety(
      applyLineage(adapted, baseRecipe, constraints, env.AI ? 'llama-ai-recipe-adapt' : 'mock-ai'),
      constraints.hardAllergens
    );

    return new Response(JSON.stringify({
      success: true,
      recipe: finalRecipe,
      appliedConstraints: constraints,
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    if (error instanceof AllergenSafetyError) {
      return new Response(JSON.stringify({
        error: 'Recipe adaptation failed allergen safety validation',
        code: error.code,
        allergenSummary: error.summary
      }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: 'Failed to adapt recipe',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

export { buildConstraintOverrides, mockAdaptRecipe, normalizeAdaptedRecipe };
