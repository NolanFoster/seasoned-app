/**
 * Complete-meal composer helpers: suggests complementary sides, sauces, and starches
 * paired to a hero dish while enforcing cuisine coherence and allergen safety.
 */

import { analyzeRecipeAllergens } from './allergen-graph.js'

export const COMPONENT_SLOTS = {
  SIDE_VEG: 'side_veg',
  STARCH: 'starch',
  SAUCE: 'sauce',
}

// Each pairing is a complete, cookable recipe written for 4 servings: measured
// ingredients, ordered steps with doneness cues, and hands-on/cook timings.
const CUISINE_SIDE_PAIRINGS = {
  italian: [
    {
      name: 'Garlic Butter Green Beans',
      type: COMPONENT_SLOTS.SIDE_VEG,
      description: 'Blanched green beans tossed in garlicky butter with a squeeze of lemon: bright, crisp, and ready in 15 minutes.',
      prepMinutes: 5,
      cookMinutes: 10,
      ingredients: [
        '1 lb green beans, trimmed',
        '2 tbsp unsalted butter',
        '1 tbsp extra-virgin olive oil',
        '3 cloves garlic, thinly sliced',
        '1/4 tsp red pepper flakes (optional)',
        '1/2 tsp kosher salt, plus more for the blanching water',
        '1/2 lemon, juiced',
      ],
      instructions: [
        'Bring a large pot of generously salted water to a boil and set a bowl of ice water next to the stove.',
        'Add the green beans to the boiling water and blanch for 3 minutes, until bright green and just tender-crisp.',
        'Drain and plunge the beans into the ice water to stop the cooking, then drain again and pat dry.',
        'Melt the butter with the olive oil in a large skillet over medium heat. Add the garlic and red pepper flakes and cook for about 1 minute, until fragrant but not browned.',
        'Add the green beans and 1/2 tsp salt and toss for 3 to 4 minutes, until heated through and glossy.',
        'Squeeze the lemon juice over the beans, toss once more, taste for salt, and serve warm.',
      ],
    },
    {
      name: 'Herb Roasted Baby Potatoes',
      type: COMPONENT_SLOTS.STARCH,
      description: 'Halved baby potatoes roasted cut-side down on a preheated pan with rosemary and garlic until deeply golden and creamy inside.',
      prepMinutes: 10,
      cookMinutes: 30,
      ingredients: [
        '1 1/2 lb baby potatoes, halved',
        '3 tbsp extra-virgin olive oil',
        '2 sprigs fresh rosemary, leaves finely chopped',
        '4 cloves garlic, peeled and lightly smashed',
        '1 tsp kosher salt',
        '1/2 tsp black pepper',
        '1 tbsp chopped fresh flat-leaf parsley',
      ],
      instructions: [
        'Place a rimmed baking sheet on the middle rack and heat the oven to 425°F (220°C).',
        'In a large bowl, toss the potatoes with the olive oil, rosemary, garlic, salt, and pepper until evenly coated.',
        'Carefully tip the potatoes onto the hot baking sheet and turn them cut-side down in a single layer.',
        'Roast for 20 minutes without stirring, until the cut sides are deep golden.',
        'Flip the potatoes and roast for 8 to 10 minutes more, until a knife slides through the center with no resistance.',
        'Sprinkle with parsley, taste for salt, and serve hot.',
      ],
    },
    {
      name: 'Lemon Herb Gremolata',
      type: COMPONENT_SLOTS.SAUCE,
      description: 'A no-cook parsley, lemon zest, and garlic relish loosened with olive oil to spoon over rich or roasted dishes.',
      prepMinutes: 10,
      cookMinutes: 0,
      ingredients: [
        '1 cup packed fresh flat-leaf parsley leaves',
        '1 lemon, zested, plus 1 tsp of its juice',
        '1 small clove garlic',
        '1/4 tsp flaky sea salt',
        '3 tbsp extra-virgin olive oil',
        'Pinch of black pepper',
      ],
      instructions: [
        'Wash the parsley and dry it thoroughly; wet leaves turn the gremolata muddy.',
        'Finely chop the parsley and transfer it to a small bowl.',
        'Finely zest the lemon over the bowl, avoiding the bitter white pith.',
        'Mince the garlic, sprinkle it with the flaky salt, and press it into a paste with the flat of your knife. Add it to the bowl.',
        'Stir in the olive oil, lemon juice, and pepper. Let it sit for 10 minutes so the flavors meld.',
        'Spoon over the dish just before serving. Refrigerate leftovers for up to 1 day.',
      ],
    },
  ],
  mexican: [
    {
      name: 'Charred Cumin Lime Corn',
      type: COMPONENT_SLOTS.SIDE_VEG,
      description: 'Sweet corn blistered in a very hot skillet, then finished with cumin, chili, lime, and cilantro.',
      prepMinutes: 5,
      cookMinutes: 10,
      ingredients: [
        '4 cups sweet corn kernels (from 4 ears, or frozen and thawed, patted dry)',
        '1 tbsp neutral oil',
        '1 tsp ground cumin',
        '1/2 tsp chili powder',
        '1/2 tsp kosher salt',
        '1 lime, juiced',
        '1/4 cup chopped fresh cilantro',
      ],
      instructions: [
        'Heat a large cast-iron skillet over high heat until it just begins to smoke.',
        'Add the oil and corn in a single layer and cook undisturbed for 3 to 4 minutes, until charred in spots.',
        'Stir and cook for another 3 minutes, until most kernels have some color.',
        'Reduce the heat to medium, add the cumin, chili powder, and salt, and toss for 30 seconds until fragrant.',
        'Remove from the heat, stir in the lime juice and cilantro, taste for salt, and serve.',
      ],
    },
    {
      name: 'Cilantro Lime Rice',
      type: COMPONENT_SLOTS.STARCH,
      description: 'Toasted long-grain rice steamed until fluffy, then folded with lime zest, lime juice, and plenty of cilantro.',
      prepMinutes: 5,
      cookMinutes: 25,
      ingredients: [
        '1 1/2 cups long-grain white rice',
        '1 tbsp neutral oil',
        '2 1/4 cups water',
        '1 tsp kosher salt',
        '1 lime, zested and juiced (about 2 tbsp juice)',
        '1/2 cup chopped fresh cilantro',
      ],
      instructions: [
        'Rinse the rice in a fine-mesh strainer under cold water until the water runs mostly clear, then drain well.',
        'Heat the oil in a medium saucepan over medium heat. Add the rice and stir for 2 minutes, until the grains turn opaque at the edges.',
        'Add the water and salt and bring to a boil.',
        'Cover, reduce the heat to low, and cook for 18 minutes without lifting the lid.',
        'Remove from the heat and let the rice rest, covered, for 5 minutes.',
        'Fluff with a fork and fold in the lime zest, lime juice, and cilantro. Serve warm.',
      ],
    },
    {
      name: 'Creamy Avocado Crema',
      type: COMPONENT_SLOTS.SAUCE,
      description: 'A silky blended avocado and sour cream sauce with lime and garlic for drizzling over tacos, bowls, and grilled meats.',
      prepMinutes: 5,
      cookMinutes: 0,
      ingredients: [
        '1 large ripe avocado, pitted and peeled',
        '1/2 cup sour cream',
        '1 lime, juiced',
        '1 small clove garlic',
        '2 tbsp fresh cilantro leaves',
        '1/2 tsp kosher salt',
        '2 to 3 tbsp water, as needed',
      ],
      instructions: [
        'Add the avocado, sour cream, lime juice, garlic, cilantro, and salt to a blender or small food processor.',
        'Blend until completely smooth, scraping down the sides once.',
        'With the motor running, add water 1 tablespoon at a time until the crema is pourable.',
        'Taste and adjust with more salt or lime.',
        'Serve right away, or press plastic wrap onto the surface and refrigerate for up to 1 day.',
      ],
    },
  ],
  american: [
    {
      name: 'Crispy Roasted Asparagus',
      type: COMPONENT_SLOTS.SIDE_VEG,
      description: 'High-heat roasted asparagus with crisp tips, finished with lemon zest and juice.',
      prepMinutes: 5,
      cookMinutes: 12,
      ingredients: [
        '1 lb asparagus, woody ends snapped off',
        '1 1/2 tbsp extra-virgin olive oil',
        '1 clove garlic, minced',
        '1/2 tsp kosher salt',
        '1/4 tsp black pepper',
        '1/2 lemon, zested and juiced',
      ],
      instructions: [
        'Heat the oven to 425°F (220°C).',
        'On a rimmed baking sheet, toss the asparagus with the olive oil, garlic, salt, and pepper, then spread it into a single layer.',
        'Roast for 10 to 12 minutes (closer to 8 for thin spears), until the stalks are tender and the tips are crisp and browned.',
        'Zest the lemon directly over the hot asparagus, squeeze over the juice, and serve.',
      ],
    },
    {
      name: 'Garlic Mashed Potatoes',
      type: COMPONENT_SLOTS.STARCH,
      description: 'Fluffy Yukon Gold mash enriched with garlic-infused butter and warm cream.',
      prepMinutes: 10,
      cookMinutes: 25,
      ingredients: [
        '2 lb Yukon Gold potatoes, peeled and cut into 2-inch chunks',
        '1 tbsp kosher salt for the cooking water, plus more to taste',
        '4 tbsp unsalted butter',
        '4 cloves garlic, minced',
        '1/2 cup heavy cream',
        '1/4 cup whole milk',
        '1/4 tsp black pepper',
        '1 tbsp chopped fresh chives',
      ],
      instructions: [
        'Put the potatoes in a large pot, cover with cold water by 1 inch, and add 1 tbsp salt.',
        'Bring to a boil, then simmer for 15 to 18 minutes, until a knife slides into the potatoes with no resistance.',
        'Meanwhile, melt the butter in a small saucepan over low heat. Add the garlic and cook gently for 2 to 3 minutes until soft but not browned, then add the cream and milk and keep warm.',
        'Drain the potatoes and return them to the hot pot over low heat for 1 minute to steam off excess moisture.',
        'Mash the potatoes until smooth, then gradually stir in the warm garlic cream.',
        'Season with pepper and more salt to taste, sprinkle with chives, and serve hot.',
      ],
    },
    {
      name: 'Creamy Peppercorn Pan Sauce',
      type: COMPONENT_SLOTS.SAUCE,
      description: 'A classic steakhouse-style sauce of shallot, cracked peppercorns, and brandy reduced with cream and Dijon.',
      prepMinutes: 5,
      cookMinutes: 8,
      ingredients: [
        '1 tbsp unsalted butter',
        '1 medium shallot, finely minced',
        '1 1/2 tsp black peppercorns, coarsely cracked',
        '1/4 cup brandy or cognac (or water)',
        '2/3 cup heavy cream',
        '1 tsp Dijon mustard',
        '1/4 tsp kosher salt',
        '1 tbsp chopped fresh chives',
      ],
      instructions: [
        'Use the skillet the main dish was cooked in (pour off all but 1 tbsp of fat) or a clean skillet. Melt the butter over medium heat.',
        'Add the shallot and cook for about 2 minutes, until softened. Add the peppercorns and cook for 30 seconds.',
        'Take the pan off the heat and add the brandy, then return it to medium heat. Simmer, scraping up any browned bits, until nearly evaporated, about 1 minute.',
        'Stir in the cream and Dijon and simmer for 3 to 4 minutes, until the sauce coats the back of a spoon.',
        'Season with salt, stir in the chives and any resting juices from the main dish, and serve warm.',
      ],
    },
  ],
  asian: [
    {
      name: 'Garlic Sesame Bok Choy',
      type: COMPONENT_SLOTS.SIDE_VEG,
      description: 'Baby bok choy seared in a hot wok with garlic and ginger, then steamed briefly in soy and finished with sesame.',
      prepMinutes: 5,
      cookMinutes: 6,
      ingredients: [
        '1 lb baby bok choy, halved lengthwise',
        '1 tbsp neutral oil',
        '3 cloves garlic, minced',
        '1 tsp grated fresh ginger',
        '1 tbsp soy sauce',
        '1 tbsp water',
        '1 tsp toasted sesame oil',
        '1 tsp toasted sesame seeds',
      ],
      instructions: [
        'Rinse the bok choy well, fanning the leaves to wash out grit at the base, and shake dry.',
        'Heat a wok or large skillet over high heat. Add the oil, garlic, and ginger and stir for 20 seconds until fragrant.',
        'Add the bok choy cut-side down and sear for about 2 minutes, until lightly browned.',
        'Add the soy sauce and water, cover, and steam for 1 to 2 minutes, until the stems are tender-crisp.',
        'Remove from the heat, drizzle with sesame oil, sprinkle with sesame seeds, and serve.',
      ],
    },
    {
      name: 'Ginger Scallion Jasmine Rice',
      type: COMPONENT_SLOTS.STARCH,
      description: 'Fluffy steamed jasmine rice folded with a quick sizzled ginger and scallion oil.',
      prepMinutes: 5,
      cookMinutes: 25,
      ingredients: [
        '1 1/2 cups jasmine rice',
        '2 cups water',
        '1/2 tsp kosher salt',
        '1 tbsp neutral oil',
        '1 tbsp finely grated fresh ginger',
        '3 scallions, thinly sliced, whites and greens separated',
      ],
      instructions: [
        'Rinse the rice in a bowl of cold water, swishing and draining 3 to 4 times, until the water is nearly clear. Drain well.',
        'Combine the rice, water, and salt in a medium saucepan and bring to a boil.',
        'Cover, reduce the heat to low, and cook for 15 minutes. Remove from the heat and let rest, covered, for 10 minutes.',
        'While the rice rests, heat the oil in a small pan over medium heat. Add the scallion whites and ginger and cook for 1 to 2 minutes, until fragrant and softened.',
        'Fluff the rice with a fork, fold in the ginger-scallion oil and scallion greens, and serve.',
      ],
    },
    {
      name: 'Sesame Soy Dipping Sauce',
      type: COMPONENT_SLOTS.SAUCE,
      description: 'A balanced salty, tangy, and lightly sweet sauce for dipping dumplings or drizzling over rice and grilled proteins.',
      prepMinutes: 5,
      cookMinutes: 0,
      ingredients: [
        '3 tbsp soy sauce',
        '1 tbsp rice vinegar',
        '1 tsp toasted sesame oil',
        '1 tsp honey',
        '1 small clove garlic, finely grated',
        '1/4 tsp red pepper flakes',
        '1 tsp toasted sesame seeds',
      ],
      instructions: [
        'In a small bowl, whisk the soy sauce, rice vinegar, sesame oil, and honey until the honey dissolves.',
        'Stir in the garlic and red pepper flakes.',
        'Let the sauce sit for 10 minutes so the garlic mellows.',
        'Sprinkle with sesame seeds just before serving. Refrigerate leftovers for up to 3 days.',
      ],
    },
  ],
  indian: [
    {
      name: 'Cumin Roasted Cauliflower',
      type: COMPONENT_SLOTS.SIDE_VEG,
      description: 'Cauliflower florets roasted with cumin seed, turmeric, and coriander until nutty and caramelized, brightened with lemon and cilantro.',
      prepMinutes: 10,
      cookMinutes: 25,
      ingredients: [
        '1 medium head cauliflower (about 2 lb), cut into bite-size florets',
        '3 tbsp neutral oil',
        '1 tsp cumin seeds',
        '1/2 tsp ground turmeric',
        '1/2 tsp ground coriander',
        '1/4 tsp Kashmiri chili powder or paprika',
        '1 tsp kosher salt',
        '1/2 lemon, juiced',
        '2 tbsp chopped fresh cilantro',
      ],
      instructions: [
        'Heat the oven to 425°F (220°C).',
        'In a large bowl, toss the cauliflower with the oil, cumin seeds, turmeric, coriander, chili powder, and salt until evenly coated.',
        'Spread the florets in a single layer on a rimmed baking sheet, leaving space between them so they brown rather than steam.',
        'Roast for 20 to 25 minutes, tossing halfway through, until the edges are deeply browned and the stems are tender.',
        'Squeeze the lemon juice over the hot cauliflower, sprinkle with cilantro, and serve.',
      ],
    },
    {
      name: 'Fragrant Basmati Pilaf',
      type: COMPONENT_SLOTS.STARCH,
      description: 'Soaked basmati cooked with whole spices and golden onion for long, separate, aromatic grains.',
      prepMinutes: 25,
      cookMinutes: 20,
      ingredients: [
        '1 1/2 cups basmati rice',
        '1 tbsp neutral oil',
        '4 green cardamom pods, lightly crushed',
        '1 bay leaf',
        '1 cinnamon stick (about 2 inches)',
        '4 whole cloves',
        '1/2 small onion, thinly sliced',
        '2 1/4 cups water',
        '1 tsp kosher salt',
      ],
      instructions: [
        'Rinse the rice several times until the water runs clear, then cover with fresh water and soak for 20 minutes. Drain well.',
        'Heat the oil in a medium saucepan over medium heat. Add the cardamom, bay leaf, cinnamon, and cloves and stir for 30 seconds until fragrant.',
        'Add the onion and cook for 4 to 5 minutes, until golden.',
        'Add the drained rice and stir gently for 1 minute to coat the grains without breaking them.',
        'Add the water and salt, bring to a boil, then cover, reduce the heat to low, and cook for 12 minutes.',
        'Remove from the heat and rest, covered, for 5 minutes. Fluff gently with a fork and remove the whole spices before serving.',
      ],
    },
    {
      name: 'Cucumber Mint Raita',
      type: COMPONENT_SLOTS.SAUCE,
      description: 'Cool yogurt with grated cucumber, fresh mint, and toasted cumin to balance spiced and charred dishes.',
      prepMinutes: 10,
      cookMinutes: 0,
      ingredients: [
        '1 cup plain whole-milk yogurt',
        '1/2 English cucumber, coarsely grated',
        '2 tbsp chopped fresh mint',
        '1/2 tsp ground cumin',
        '1/4 tsp kosher salt',
        'Pinch of cayenne pepper',
      ],
      instructions: [
        'Wrap the grated cucumber in a clean towel and squeeze out as much liquid as possible.',
        'Toast the ground cumin in a small dry skillet over medium heat for about 30 seconds, until fragrant, then transfer it to a bowl.',
        'Add the yogurt to the bowl and whisk until smooth.',
        'Stir in the cucumber, mint, and salt, and dust the top with cayenne.',
        'Chill for at least 10 minutes before serving. Refrigerate leftovers for up to 2 days.',
      ],
    },
  ],
  mediterranean: [
    {
      name: 'Greek Village Salad',
      type: COMPONENT_SLOTS.SIDE_VEG,
      description: 'A lettuce-free horiatiki of ripe tomato, cucumber, pepper, olives, and a slab of feta dressed with olive oil and oregano.',
      prepMinutes: 15,
      cookMinutes: 0,
      ingredients: [
        '3 ripe tomatoes, cut into wedges',
        '1 English cucumber, halved lengthwise and sliced',
        '1/2 small red onion, thinly sliced',
        '1 green bell pepper, sliced into thin rings',
        '1/2 cup pitted Kalamata olives',
        '4 oz feta cheese, in one slab or crumbled',
        '3 tbsp extra-virgin olive oil',
        '1 tbsp red wine vinegar',
        '1 tsp dried oregano',
        '1/2 tsp kosher salt',
      ],
      instructions: [
        'Soak the sliced onion in cold water for 5 minutes to mellow its bite, then drain.',
        'Combine the tomatoes, cucumber, onion, bell pepper, and olives in a wide bowl and sprinkle with the salt.',
        'Whisk 2 tbsp of the olive oil with the vinegar and half the oregano, pour over the vegetables, and toss gently.',
        'Top with the feta, drizzle with the remaining olive oil, and sprinkle with the rest of the oregano.',
        'Serve within 30 minutes, before the tomatoes release too much juice.',
      ],
    },
    {
      name: 'Herbed Lemon Couscous',
      type: COMPONENT_SLOTS.STARCH,
      description: 'Fluffy couscous steeped in salted water and tossed with lemon, parsley, and mint.',
      prepMinutes: 5,
      cookMinutes: 10,
      ingredients: [
        '1 1/2 cups couscous',
        '1 1/2 cups water',
        '1 tbsp extra-virgin olive oil',
        '3/4 tsp kosher salt',
        '1 lemon, zested and juiced (about 2 tbsp juice)',
        '1/4 cup chopped fresh flat-leaf parsley',
        '2 tbsp chopped fresh mint',
      ],
      instructions: [
        'Bring the water, olive oil, and salt to a boil in a medium saucepan.',
        'Stir in the couscous, cover, and remove from the heat. Let it stand for 5 minutes.',
        'Uncover and fluff thoroughly with a fork, breaking up any clumps.',
        'Fold in the lemon zest, lemon juice, parsley, and mint. Taste for salt and serve warm or at room temperature.',
      ],
    },
    {
      name: 'Lemon Tahini Sauce',
      type: COMPONENT_SLOTS.SAUCE,
      description: 'A creamy, nutty sauce of tahini whisked with lemon, garlic, and ice water for drizzling over grilled meats, falafel, and vegetables.',
      prepMinutes: 5,
      cookMinutes: 0,
      ingredients: [
        '1/3 cup tahini',
        '3 tbsp fresh lemon juice',
        '1 small clove garlic, finely grated',
        '1/4 tsp kosher salt',
        '1/4 to 1/3 cup ice water',
        '1 tbsp chopped fresh flat-leaf parsley',
      ],
      instructions: [
        'Whisk the tahini, lemon juice, garlic, and salt in a bowl. It will seize and thicken; this is normal.',
        'Whisk in the ice water 1 tablespoon at a time until the sauce is smooth, pale, and pourable.',
        'Stir in the parsley and taste for salt and lemon.',
        'Serve right away, or refrigerate for up to 4 days and thin with a splash of water before using.',
      ],
    },
  ],
}

// Keyword signals per cuisine. The cuisine with the most hits wins; ties go to
// the cuisine listed first, and no hits falls back to american.
const CUISINE_SIGNALS = {
  italian: ['pasta', 'spaghetti', 'penne', 'linguine', 'fettuccine', 'lasagna', 'gnocchi', 'parmesan', 'parmigiano', 'risotto', 'basil', 'marinara', 'mozzarella', 'prosciutto', 'pesto', 'balsamic', 'piccata', 'marsala', 'cacciatore', 'ricotta'],
  indian: ['curry', 'garam masala', 'masala', 'turmeric', 'tikka', 'tandoori', 'biryani', 'korma', 'vindaloo', 'paneer', 'naan', 'dal', 'daal', 'ghee', 'cardamom', 'fenugreek', 'chana', 'saag'],
  asian: ['soy sauce', 'ginger', 'sesame', 'miso', 'stir-fry', 'stir fry', 'fish sauce', 'teriyaki', 'kimchi', 'gochujang', 'hoisin', 'rice vinegar', 'sriracha', 'lemongrass', 'bok choy', 'noodle', 'wok', 'mirin', 'five-spice', 'bulgogi', 'pad thai', 'ramen', 'udon'],
  mexican: ['taco', 'salsa', 'tortilla', 'enchilada', 'burrito', 'fajita', 'quesadilla', 'chipotle', 'jalapeño', 'jalapeno', 'cumin', 'cilantro', 'poblano', 'carnitas', 'queso', 'black beans', 'chili powder'],
  mediterranean: ['feta', 'tahini', "za'atar", 'zaatar', 'hummus', 'shawarma', 'souvlaki', 'gyro', 'kalamata', 'sumac', 'harissa', 'tzatziki', 'falafel', 'pita', 'chickpea', 'ras el hanout'],
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CUISINE_PATTERNS = Object.fromEntries(
  Object.entries(CUISINE_SIGNALS).map(([cuisine, keywords]) => [
    cuisine,
    keywords.map((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}`, 'i')),
  ])
)

function lineText(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.name || value.text || ''
  return ''
}

/**
 * Detects approximate cuisine style of a hero recipe.
 * @param {object} heroRecipe
 * @returns {string}
 */
export function inferHeroCuisine(heroRecipe) {
  if (!heroRecipe) return 'american'
  const text = [
    heroRecipe.name || '',
    ...(heroRecipe.ingredients || []).map(lineText),
    ...(heroRecipe.instructions || []).map(lineText),
  ].join(' ')

  let best = 'american'
  let bestScore = 0
  for (const [cuisine, patterns] of Object.entries(CUISINE_PATTERNS)) {
    const score = patterns.filter((pattern) => pattern.test(text)).length
    if (score > bestScore) {
      best = cuisine
      bestScore = score
    }
  }
  return best
}

/**
 * Returns true when a side should be withheld for the given hard allergens.
 * Canonical allergens (e.g. "dairy", "gluten") go through the shared allergen
 * graph, opaque ingredients fail closed, and any other term is matched as text.
 */
function sideConflictsWithAllergens(side, hardAllergens) {
  if (hardAllergens.length === 0) return false
  const summary = analyzeRecipeAllergens(side.ingredients, hardAllergens)
  if (summary.blocked.length > 0 || summary.may_contain_uncertain.length > 0) return true
  const ingredientText = side.ingredients.map((ing) => ing.toLowerCase())
  return summary.unknown_hard_allergens.some((custom) => {
    const term = custom.replace(/_/g, ' ')
    return ingredientText.some((ing) => ing.includes(term))
  })
}

/**
 * Composes complementary sides, starches, and sauces for a hero dish.
 * Filters out items containing any prohibited hard allergens.
 * @param {object} heroRecipe
 * @param {object} [options]
 * @param {string[]} [options.hardAllergens]
 * @param {string[]} [options.slots]
 * @returns {Array<object>}
 */
export function composeMealSides(heroRecipe, options = {}) {
  if (!heroRecipe) return []
  const cuisine = inferHeroCuisine(heroRecipe)
  const availablePairings = CUISINE_SIDE_PAIRINGS[cuisine] || CUISINE_SIDE_PAIRINGS.american
  const requestedSlots = options.slots || [COMPONENT_SLOTS.SIDE_VEG, COMPONENT_SLOTS.STARCH, COMPONENT_SLOTS.SAUCE]
  const hardAllergens = options.hardAllergens || []

  return availablePairings
    .filter((side) => requestedSlots.includes(side.type) && !sideConflictsWithAllergens(side, hardAllergens))
    .map((side) => ({
      id: `side-${cuisine}-${slugify(side.name)}`,
      ...side,
      cuisine,
      timingOffsetMinutes: 0,
    }))
}

/**
 * Transforms a paired side into a standalone Recipe object for display, editing, or multi-dish cooking.
 * @param {object} side
 * @param {object} [heroRecipe]
 * @returns {object} RecipeV1-compatible object
 */
export function pairSideToRecipeObject(side, heroRecipe = null) {
  if (!side) return null
  const typeLabel = side.type?.replace('_', ' ') || 'side'
  const pairingNote = heroRecipe?.name ? `Pairs with ${heroRecipe.name}.` : ''
  const description = side.description
    ? [side.description, pairingNote].filter(Boolean).join(' ')
    : `Complementary ${typeLabel} pairing${heroRecipe?.name ? ` for ${heroRecipe.name}` : ''}.`
  const prepMinutes = side.prepMinutes || 10
  const cookMinutes = side.cookMinutes || 0
  const appliedConstraints = heroRecipe?.appliedConstraints || {}
  const hardAllergens = appliedConstraints.hardAllergens || appliedConstraints.hard_allergens || []
  const ingredients = side.ingredients || []

  return {
    id: side.id || `recipe-${slugify(side.name)}`,
    name: side.name,
    description,
    source: 'ai_generated',
    generationMethod: 'complete-meal-composer',
    prep_time: `PT${prepMinutes}M`,
    ...(cookMinutes > 0 ? { cook_time: `PT${cookMinutes}M` } : {}),
    total_time: `PT${prepMinutes + cookMinutes}M`,
    recipe_yield: side.servings || '4 servings',
    ingredients,
    instructions: side.instructions || [],
    appliedConstraints,
    ...(hardAllergens.length > 0 ? { allergenSummary: analyzeRecipeAllergens(ingredients, hardAllergens) } : {}),
  }
}
