import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path, { dirname } from 'node:path'
import { canonicalPortfolioKey, canonicalStringify } from '../flavour-reward-map.js'

const outputPath = fileURLToPath(new URL('../evals/flavour-reward-map-v1.json', import.meta.url))
const seed = 'seasoned-flavour-fixtures-v1-2026-09-20'

// These are transparent, authored QA fixtures rather than human taste labels,
// third-party benchmark data, or product recommendations.
const catalogs = {
  substitution: [
    ['buttermilk-in-biscuits', 'Three complementary swaps for buttermilk in biscuits', ['oat milk', 'soy milk', 'almond milk', 'coconut milk', 'cashew yogurt', 'oat yogurt', 'lemon juice', 'apple cider vinegar']],
    ['cream-in-soup', 'Three dairy-free options to finish a creamy soup', ['oat cream', 'coconut cream', 'cashew cream', 'silken tofu', 'white bean puree', 'avocado puree', 'olive oil', 'unsweetened soy milk']],
    ['egg-in-muffins', 'Three plant-based binders for muffins', ['flaxseed meal', 'chia seeds', 'applesauce', 'mashed banana', 'pumpkin puree', 'silken tofu', 'aquafaba', 'commercial egg replacer']],
    ['fish-sauce-in-stir-fry', 'Three savory alternatives to fish sauce', ['soy sauce', 'tamari', 'coconut aminos', 'miso paste', 'seaweed flakes', 'mushroom powder', 'vegetable broth', 'worcestershire sauce']],
    ['butter-in-cookies', 'Three dairy-free fats for cookie dough', ['vegan butter', 'coconut oil', 'olive oil', 'avocado oil', 'applesauce', 'mashed avocado', 'tahini', 'sunflower seed butter']],
    ['sour-cream-in-dip', 'Three tangy swaps for sour cream in a dip', ['coconut yogurt', 'soy yogurt', 'cashew yogurt', 'labneh', 'greek yogurt', 'blended cottage cheese', 'silken tofu', 'white bean puree']],
    ['mayo-in-sandwiches', 'Three egg-free creamy sandwich spreads', ['vegan mayonnaise', 'mashed avocado', 'hummus', 'white bean spread', 'tahini', 'mustard', 'cashew cream', 'olive tapenade']],
    ['all-purpose-flour-in-pancakes', 'Three gluten-free flour blends for pancakes', ['oat flour', 'rice flour', 'buckwheat flour', 'almond flour', 'sorghum flour', 'cassava flour', 'chickpea flour', 'gluten-free flour blend']],
    ['parmesan-in-pasta', 'Three savory finishes in place of parmesan', ['nutritional yeast', 'vegan parmesan', 'toasted breadcrumbs', 'miso paste', 'pecorino romano', 'aged cheddar', 'lemon zest', 'toasted sunflower seeds']],
    ['bacon-in-beans', 'Three smoky, savory alternatives to bacon in beans', ['smoked paprika', 'smoked mushrooms', 'miso paste', 'chipotle pepper', 'sun-dried tomatoes', 'smoked tempeh', 'soy sauce', 'caramelized onion']],
    ['soy-sauce-in-sauce', 'Three lower-soy alternatives for a savory sauce', ['coconut aminos', 'liquid aminos', 'miso paste', 'fish sauce', 'mushroom soy sauce', 'worcestershire sauce', 'vegetable stock', 'seaweed broth']],
    ['honey-in-dressing', 'Three sweeteners for a balanced vinaigrette', ['maple syrup', 'agave nectar', 'date syrup', 'brown sugar', 'white sugar', 'apple juice concentrate', 'molasses', 'pear puree']],
    ['cornstarch-in-gravy', 'Three thickeners for a glossy gravy', ['arrowroot starch', 'potato starch', 'tapioca starch', 'all-purpose flour', 'rice flour', 'instant potato flakes', 'pureed beans', 'reduced stock']],
    ['coconut-milk-in-curry', 'Three creamy bases for a coconut-free curry', ['oat cream', 'cashew cream', 'soy cream', 'dairy cream', 'greek yogurt', 'blended silken tofu', 'almond milk', 'white bean puree']],
    ['yogurt-in-marinade', 'Three tenderizing bases for a yogurt-free marinade', ['buttermilk', 'coconut yogurt', 'lemon juice', 'coconut milk', 'vinegar', 'pureed tomato', 'tahini', 'olive oil']],
    ['ricotta-in-filling', 'Three alternatives to ricotta in a savory filling', ['tofu ricotta', 'cottage cheese', 'cashew ricotta', 'mashed white beans', 'goat cheese', 'cream cheese', 'paneer', 'pureed cauliflower']],
    ['egg-wash-on-pastry', 'Three egg-free finishes for baked pastry', ['oat milk', 'soy milk', 'coconut milk', 'aquafaba', 'melted vegan butter', 'olive oil', 'maple syrup', 'water']],
  ],
  pairing: [
    ['roasted-squash', 'Pick three complementary finishes for roasted squash', ['sage', 'pepitas', 'feta', 'pomegranate seeds', 'brown butter', 'cumin', 'chili crisp', 'tahini']],
    ['chickpea-bowl', 'Pick three additions for a bright chickpea bowl', ['lemon', 'parsley', 'tahini', 'yogurt', 'mint', 'sumac', 'cucumber', 'olive oil']],
    ['tomato-lentils', 'Pick three accents for tomato-braised lentils', ['cumin', 'coriander', 'red wine vinegar', 'parsley', 'yogurt', 'smoked paprika', 'spinach', 'feta']],
    ['mushroom-risotto', 'Pick three finishes for mushroom risotto', ['thyme', 'parmesan', 'lemon zest', 'chives', 'truffle oil', 'peas', 'white wine', 'toasted hazelnuts']],
    ['avocado-tostada', 'Pick three toppings for an avocado tostada', ['pickled onion', 'cilantro', 'black beans', 'radish', 'cotija', 'lime', 'jalapeno', 'pumpkin seeds']],
    ['brown-rice-bowl', 'Pick three toppings for a brown rice bowl', ['scallions', 'sesame seeds', 'kimchi', 'edamame', 'carrot', 'ginger', 'crispy tofu', 'rice vinegar']],
    ['roasted-eggplant', 'Pick three accents for roasted eggplant', ['pomegranate molasses', 'mint', 'tahini', 'parsley', 'yogurt', 'sumac', 'pine nuts', 'lemon']],
    ['zucchini-fritters', 'Pick three finishes for zucchini fritters', ['dill', 'feta', 'lemon', 'yogurt', 'scallions', 'chili flakes', 'mint', 'garlic']],
    ['salmon-supper', 'Pick three pairings for a salmon supper', ['dill', 'lemon', 'capers', 'mustard', 'fennel', 'yogurt', 'potatoes', 'asparagus']],
    ['crispy-tofu', 'Pick three sauces or garnishes for crispy tofu', ['ginger', 'scallions', 'sesame oil', 'lime', 'chili crisp', 'peanuts', 'coconut aminos', 'cilantro']],
    ['roast-chicken', 'Pick three herbs and sides to pair with roast chicken', ['rosemary', 'lemon', 'garlic', 'thyme', 'olives', 'fennel', 'potatoes', 'tarragon']],
    ['apple-oatmeal', 'Pick three toppings for an apple oatmeal bowl', ['cinnamon', 'walnuts', 'maple syrup', 'yogurt', 'raisins', 'cardamom', 'pumpkin seeds', 'brown sugar']],
    ['berry-yogurt', 'Pick three additions for a berry yogurt bowl', ['granola', 'honey', 'chia seeds', 'lemon zest', 'almonds', 'mint', 'cocoa nibs', 'oats']],
    ['potato-soup', 'Pick three finishes for a potato soup', ['chives', 'cheddar', 'crispy onions', 'black pepper', 'sour cream', 'smoked paprika', 'dill', 'olive oil']],
    ['braised-greens', 'Pick three accents for braised greens', ['garlic', 'lemon', 'chili flakes', 'white beans', 'parmesan', 'vinegar', 'tahini', 'toasted breadcrumbs']],
    ['pear-salad', 'Pick three pairings for a pear salad', ['blue cheese', 'walnuts', 'arugula', 'balsamic vinegar', 'hazelnuts', 'radicchio', 'honey', 'dijon mustard']],
    ['grilled-corn', 'Pick three toppings for grilled corn', ['lime', 'cotija', 'chili powder', 'cilantro', 'butter', 'smoked paprika', 'mayo', 'pumpkin seeds']],
  ],
  constraint: [
    ['peanut-free-grain-bowl', 'Select a peanut-free trio for a grain bowl', ['peanut oil', 'tofu', 'scallions', 'lime', 'cucumber', 'crispy chickpeas', 'cilantro', 'brown rice'], ['peanut oil']],
    ['sesame-free-noodles', 'Select a sesame-free trio for noodles', ['sesame oil', 'tahini', 'ginger', 'scallions', 'lime', 'chili crisp', 'peanuts', 'rice vinegar'], ['sesame oil', 'tahini']],
    ['dairy-free-potato-soup', 'Select a dairy-free trio to finish potato soup', ['whole milk', 'heavy cream', 'chives', 'olive oil', 'crispy onions', 'white beans', 'black pepper', 'dill'], ['whole milk', 'heavy cream']],
    ['wheat-free-salad-dressing', 'Select a wheat-free trio for salad dressing', ['wheat soy sauce', 'malt vinegar', 'lemon juice', 'olive oil', 'dijon mustard', 'honey', 'garlic', 'rice vinegar'], ['wheat soy sauce', 'malt vinegar']],
    ['vegan-bean-chili', 'Select a vegan trio of chili toppings', ['chorizo', 'sour cream', 'cheddar cheese', 'scallions', 'avocado', 'cilantro', 'lime', 'crispy tortilla strips'], ['chorizo', 'sour cream', 'cheddar cheese']],
    ['low-sodium-savory-sauce', 'Select a lower-sodium trio for a savory sauce', ['soy sauce', 'fish sauce', 'miso paste', 'lime juice', 'ginger', 'garlic', 'rice vinegar', 'sesame oil'], ['soy sauce', 'fish sauce']],
    ['shellfish-free-noodle-bowl', 'Select a shellfish-free trio for a noodle bowl', ['shrimp', 'oyster sauce', 'tofu', 'bok choy', 'ginger', 'scallions', 'lime', 'rice noodles'], ['shrimp', 'oyster sauce']],
    ['tree-nut-free-pesto', 'Select a tree-nut-free trio for pesto', ['almonds', 'cashews', 'pine nuts', 'basil', 'olive oil', 'nutritional yeast', 'pumpkin seeds', 'lemon'], ['almonds', 'cashews', 'pine nuts']],
    ['egg-free-binder', 'Select an egg-free trio of binders for fritters', ['whole egg', 'mayonnaise', 'flaxseed meal', 'mashed potato', 'chickpea flour', 'aquafaba', 'chia seeds', 'oat flour'], ['whole egg', 'mayonnaise']],
    ['soy-free-stir-fry', 'Select a soy-free trio for stir-fry', ['tofu', 'soy sauce', 'edamame', 'ginger', 'garlic', 'coconut aminos', 'rice vinegar', 'scallions'], ['tofu', 'soy sauce', 'edamame']],
    ['wheat-free-dumpling-bowl', 'Select a wheat-free trio for a dumpling bowl', ['wheat noodles', 'seitan', 'rice noodles', 'tofu', 'bok choy', 'ginger', 'scallions', 'tamari'], ['wheat noodles', 'seitan']],
    ['peanut-free-satay', 'Select a peanut-free trio for satay-style sauce', ['peanut butter', 'peanut oil', 'sunflower seed butter', 'coconut milk', 'lime', 'ginger', 'coconut aminos', 'chili paste'], ['peanut butter', 'peanut oil']],
    ['milk-free-curry', 'Select a milk-free trio to finish a curry', ['ghee', 'plain yogurt', 'heavy cream', 'coconut milk', 'tomato puree', 'lime', 'cilantro', 'toasted cumin'], ['ghee', 'plain yogurt', 'heavy cream']],
    ['fish-free-salad', 'Select a fish-free trio for a savory salad', ['anchovy', 'fish sauce', 'lemon', 'olive oil', 'capers', 'dijon mustard', 'parsley', 'white beans'], ['anchovy', 'fish sauce']],
    ['sesame-free-grain-bowl', 'Select a sesame-free trio for a grain bowl', ['sesame seeds', 'sesame oil', 'tahini', 'avocado', 'lime', 'pumpkin seeds', 'cilantro', 'brown rice'], ['sesame seeds', 'sesame oil', 'tahini']],
    ['vegetarian-broth-bowl', 'Select a vegetarian trio for broth-based soup', ['chicken stock', 'beef broth', 'gelatin', 'mushroom broth', 'miso paste', 'tofu', 'greens', 'rice noodles'], ['chicken stock', 'beef broth', 'gelatin']],
  ],
}

function hashInt(value) {
  let hash = 2166136261
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return hash >>> 0
}

function ingredientId(label) {
  const id = label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`Invalid ingredient label '${label}'`)
  return id
}

function choose(candidateIds, k = 3) {
  const portfolios = []
  const selected = []
  function walk(start) {
    if (selected.length === k) {
      portfolios.push([...selected])
      return
    }
    const needed = k - selected.length
    for (let i = start; i <= candidateIds.length - needed; i += 1) {
      selected.push(candidateIds[i])
      walk(i + 1)
      selected.pop()
    }
  }
  walk(0)
  return portfolios
}

function fixtureScore(taskId, portfolio) {
  const orderedIds = [...portfolio].sort()
  let raw = orderedIds.reduce((sum, id) => sum + (hashInt(`${seed}|${taskId}|${id}|item`) % 21) - 10, 0)
  for (let left = 0; left < orderedIds.length; left += 1) {
    for (let right = left + 1; right < orderedIds.length; right += 1) {
      raw += (hashInt(`${seed}|${taskId}|${orderedIds[left]}|${orderedIds[right]}|pair`) % 13) - 6
    }
  }
  raw += (hashInt(`${seed}|${taskId}|${orderedIds.join('|')}|trio`) % 9) - 4
  return raw
}

function buildTask([taskId, family, prompt, candidateLabels, blockedLabels = []]) {
  const candidates = candidateLabels.map((label) => ({ id: ingredientId(label), label }))
  if (new Set(candidates.map((candidate) => candidate.id)).size !== 8) {
    throw new Error(`Task '${taskId}' must have 8 unique ingredient ids`)
  }
  const rows = choose(candidates.map((candidate) => candidate.id)).map((ids) => ({
    key: canonicalPortfolioKey(ids),
    raw: fixtureScore(taskId, ids),
  }))
  const minimum = Math.min(...rows.map((row) => row.raw))
  const maximum = Math.max(...rows.map((row) => row.raw))
  const scores = Object.fromEntries(
    rows
      .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
      .map(({ key, raw }) => [key, maximum === minimum ? 100 : Math.round(((raw - minimum) / (maximum - minimum)) * 100)])
  )
  const hardBlockedIds = blockedLabels.map(ingredientId)
  return {
    taskId,
    family,
    prompt,
    candidates,
    k: 3,
    ...(hardBlockedIds.length ? { constraints: { hardBlockedIds } } : {}),
    scores,
  }
}

const taskDefinitions = Object.entries(catalogs).flatMap(([family, definitions]) =>
  definitions.map(([taskId, prompt, candidates, blockedLabels]) => [
    taskId,
    family,
    prompt,
    candidates,
    blockedLabels,
  ])
)

if (
  catalogs.substitution.length !== 17 ||
  catalogs.pairing.length !== 17 ||
  catalogs.constraint.length !== 16
) {
  throw new Error('Fixture catalog must contain 17 substitution, 17 pairing, and 16 constraint tasks')
}

const artifact = {
  schemaVersion: 'FlavourRewardMapV1',
  mapId: 'seasoned-flavour-fixtures-v1',
  source: {
    name: 'Seasoned-authored synthetic QA fixtures',
    provenance:
      'Reproducibly generated from the task catalog and deterministic synthetic item/pair/trio utilities in shared/scripts/build-flavour-reward-map.js. No third-party dataset, model weights, user data, or external service is used.',
    license: 'MIT (shared package)',
  },
  families: ['substitution', 'pairing', 'constraint'],
  generation: {
    generatorVersion: 'synthetic-fixture-v1',
    seed,
    scoreModel:
      'Seeded item, pairwise, and trio utility; scores are min-max normalized to integer 0-100 within each task before hard constraints are applied.',
    intendedUse: 'Offline verifier and API fixtures only; not product recommendations or human taste evidence.',
  },
  tasks: taskDefinitions.map(buildTask),
}

artifact.artifactHash = `sha256:${createHash('sha256').update(canonicalStringify(artifact)).digest('hex')}`
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`)
console.log(`Wrote ${artifact.tasks.length} tasks to ${path.relative(process.cwd(), outputPath)}`)
console.log(`Artifact hash: ${artifact.artifactHash}`)
