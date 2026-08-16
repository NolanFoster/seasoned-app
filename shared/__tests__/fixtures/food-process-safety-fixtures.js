/**
 * Eval fixture pack for the food-process safety gates.
 *
 * Each fixture states the policy outcome the gate must produce. Hazard cases
 * assert the technique is caught; the `safe` cases are deliberately adversarial
 * — they use the vocabulary of preserving, fermenting, and raw protein in
 * recipes that are ordinary cooking — and exist to hold the false-positive rate
 * down. Add a fixture with every new pattern.
 */

/** @typedef {{id: string, note: string, recipe: object, expect: {status: string, tags: string[]}}} ProcessSafetyFixture */

/** Recipes that must trigger a gate. */
export const HAZARD_FIXTURES = [
  {
    id: 'pressure_canned_green_beans',
    note: 'Explicit pressure schedule for a low-acid vegetable.',
    recipe: {
      name: 'Pantry Pressure-Canned Green Beans',
      ingredients: ['3 lbs green beans, trimmed', '1 tbsp canning salt', 'water'],
      instructions: [
        'Pack the beans into hot jars leaving one inch of headspace.',
        'Process the jars for 25 minutes at 10 lbs pressure.',
      ],
    },
    expect: { status: 'blocked', tags: ['home_canning_low_acid'] },
  },
  {
    id: 'can_this_for_the_pantry',
    note: 'The user story: asking to can a low-acid recipe for shelf storage.',
    recipe: {
      name: 'Green Bean Almondine',
      ingredients: ['2 lbs green beans', '1/4 cup almonds'],
      instructions: ['Blanch the beans.', 'Can these for the pantry so they stay shelf-stable all winter.'],
    },
    expect: { status: 'blocked', tags: ['home_canning_low_acid'] },
  },
  {
    id: 'home_canned_chicken_stock',
    note: 'Stock has no tested boiling-water process at any acidity.',
    recipe: {
      name: 'Home Canned Chicken Stock',
      ingredients: ['1 chicken carcass', 'onions', 'carrots'],
      instructions: ['Simmer the stock for 4 hours.', 'Home can the stock in quart jars for the pantry.'],
    },
    expect: { status: 'blocked', tags: ['home_canning_low_acid'] },
  },
  {
    id: 'canned_corn_weak_signal',
    note: 'Weak canning phrasing plus shelf-stable intent still gates.',
    recipe: {
      name: 'Sweet Corn for Winter',
      ingredients: ['12 ears of corn'],
      instructions: ['Cut the corn from the cobs.', 'Seal the jars and store them in the pantry for up to 12 months.'],
    },
    expect: { status: 'blocked', tags: ['home_canning_low_acid'] },
  },
  {
    id: 'canned_tamales',
    note: 'Canned meat-filled tamales are a documented botulism vector.',
    recipe: {
      name: 'Canned Tamales',
      ingredients: ['masa', 'pork shoulder', 'corn husks'],
      instructions: ['Steam the tamales.', 'Pressure can the tamales for later.'],
    },
    expect: { status: 'blocked', tags: ['home_canning_low_acid'] },
  },
  {
    id: 'canning_context_on_a_separate_step',
    note: 'The technique and its shelf-storage context are routinely separate steps.',
    recipe: {
      name: 'Garden Green Beans',
      ingredients: ['3 lbs green beans'],
      instructions: ['Can them after cooking.', 'Store in the pantry until winter.'],
    },
    expect: { status: 'blocked', tags: ['home_canning_low_acid'] },
  },
  {
    id: 'water_bath_strawberry_jam',
    note: 'High-acid preserve: redirect to a tested schedule instead of blocking.',
    recipe: {
      name: 'Strawberry Jam',
      ingredients: ['4 cups strawberries', '3 cups sugar', '1/4 cup lemon juice'],
      instructions: [
        'Cook the berries and sugar until thickened.',
        'Ladle into jars, then water bath can them for 10 minutes.',
      ],
    },
    expect: { status: 'template_required', tags: ['water_bath_preserve'] },
  },
  {
    id: 'water_bath_salsa',
    note: 'Acidified tomato salsa is a water-bath process, not a pressure one.',
    recipe: {
      name: 'Canned Tomato Salsa',
      ingredients: ['tomatoes', 'onions', 'peppers', '1 cup vinegar'],
      instructions: ['Simmer the salsa.', 'Process the jars in a boiling water bath canner.'],
    },
    expect: { status: 'template_required', tags: ['water_bath_preserve'] },
  },
  {
    id: 'pickled_beets_water_bath',
    note: 'Acidified low-acid vegetable: template, not block.',
    recipe: {
      name: 'Pickled Beets',
      ingredients: ['3 lbs beets', '2 cups vinegar', '1 cup sugar'],
      instructions: ['Boil the beets and slip the skins.', 'Water bath process the jars for the pantry shelf.'],
    },
    expect: { status: 'template_required', tags: ['water_bath_preserve'] },
  },
  {
    id: 'garlic_confit_room_temperature',
    note: 'Garlic held in oil at room temperature is a botulism risk.',
    recipe: {
      name: 'Garlic Confit',
      ingredients: ['2 heads garlic', '2 cups olive oil'],
      instructions: ['Cook the garlic confit gently for an hour.', 'Keep the jar on the counter and use within a month.'],
    },
    expect: { status: 'template_required', tags: ['infused_oil_garlic'] },
  },
  {
    id: 'chili_infused_oil',
    note: 'Fresh aromatics infused into oil.',
    recipe: {
      name: 'Chili Infused Oil',
      ingredients: ['1 cup neutral oil', '6 dried chilies', '4 cloves garlic'],
      instructions: ['Warm the oil and infuse the chilies and garlic for 20 minutes.'],
    },
    expect: { status: 'template_required', tags: ['infused_oil_garlic'] },
  },
  {
    id: 'kimchi_fermentation',
    note: 'Salt and temperature ranges need verification.',
    recipe: {
      name: 'Napa Cabbage Kimchi',
      ingredients: ['1 napa cabbage', '1/4 cup coarse salt', 'gochugaru'],
      instructions: ['Pack the cabbage into a jar.', 'Ferment at room temperature for 5 days, then refrigerate.'],
    },
    expect: { status: 'needs_review', tags: ['fermentation_anaerobic'] },
  },
  {
    id: 'sauerkraut_crock',
    note: 'Crock fermentation with weights.',
    recipe: {
      name: 'Crock Sauerkraut',
      ingredients: ['1 head cabbage', '2 tbsp salt'],
      instructions: ['Layer the cabbage in a crock under weights.', 'Ferment for 3 weeks at room temperature.'],
    },
    expect: { status: 'needs_review', tags: ['fermentation_anaerobic'] },
  },
  {
    id: 'kombucha_second_ferment',
    note: 'Sealed second fermentation.',
    recipe: {
      name: 'Ginger Kombucha',
      ingredients: ['1 gallon sweet tea', '1 scoby', 'ginger'],
      instructions: ['Ferment the tea with the scoby for 10 days.', 'Bottle and seal for a second ferment.'],
    },
    expect: { status: 'needs_review', tags: ['fermentation_anaerobic'] },
  },
  {
    id: 'sous_vide_chicken_no_pasteurization',
    note: 'Low-temperature poultry without a stated pasteurization hold.',
    recipe: {
      name: 'Sous Vide Chicken Breast',
      ingredients: ['2 chicken breasts', 'butter', 'thyme'],
      instructions: ['Sous vide the chicken at 140F for one hour.', 'Sear and serve.'],
    },
    expect: { status: 'needs_review', tags: ['sous_vide_low_temp_protein'] },
  },
  {
    id: 'sous_vide_pork_low_temp',
    note: 'Below the 130F safety floor.',
    recipe: {
      name: 'Sous Vide Pork Loin',
      ingredients: ['1 pork loin'],
      instructions: ['Set the immersion circulator to 129F and cook the pork for 2 hours.'],
    },
    expect: { status: 'needs_review', tags: ['sous_vide_low_temp_protein'] },
  },
  {
    id: 'rice_left_out_overnight',
    note: 'Bacillus cereus: cooked rice held in the danger zone.',
    recipe: {
      name: 'Next-Day Fried Rice',
      ingredients: ['4 cups cooked rice', 'soy sauce', 'peas'],
      instructions: ['Leave the rice on the counter overnight so it dries out.', 'Fry it the next day.'],
    },
    expect: { status: 'needs_review', tags: ['reheat_rice_cooling'] },
  },
  {
    id: 'stock_cooled_slowly',
    note: 'Slow cooling of a large volume of stock.',
    recipe: {
      name: 'Overnight Chicken Stock',
      ingredients: ['chicken bones', 'aromatics'],
      instructions: ['Simmer for 6 hours.', 'Let the stock cool slowly on the stove overnight before straining.'],
    },
    expect: { status: 'needs_review', tags: ['reheat_rice_cooling'] },
  },
  {
    id: 'leftovers_reheated_repeatedly',
    note: 'Repeated reheating of the same leftovers.',
    recipe: {
      name: 'Meal Prep Curry',
      ingredients: ['chicken thighs', 'curry paste', 'rice'],
      instructions: ['Portion the curry and rice.', 'Reheat the leftovers several times through the week as needed.'],
    },
    expect: { status: 'needs_review', tags: ['reheat_rice_cooling'] },
  },
  {
    id: 'steak_tartare',
    note: 'Raw beef preparation.',
    recipe: {
      name: 'Classic Steak Tartare',
      ingredients: ['8 oz beef tenderloin', 'capers', 'egg yolk'],
      instructions: ['Hand-chop the beef.', 'Plate the tartare and serve immediately.'],
    },
    expect: { status: 'needs_review', tags: ['raw_high_risk_protein'] },
  },
  {
    id: 'raw_egg_aioli',
    note: 'Uncooked egg emulsion.',
    recipe: {
      name: 'Garlic Aioli',
      ingredients: ['2 raw eggs', '1 cup oil', 'garlic'],
      instructions: ['Whisk the raw eggs with garlic, then stream in oil to make the aioli.'],
    },
    expect: { status: 'needs_review', tags: ['raw_high_risk_protein'] },
  },
  {
    id: 'chicken_served_pink',
    note: 'Undercooked poultry framed as acceptable.',
    recipe: {
      name: 'Quick Pan Chicken',
      ingredients: ['2 chicken thighs'],
      instructions: ['Sear for four minutes.', 'Serve the chicken slightly pink in the middle.'],
    },
    expect: { status: 'needs_review', tags: ['raw_high_risk_protein'] },
  },
  {
    id: 'foraged_mushroom_toast',
    note: 'Forage identification from text.',
    recipe: {
      name: 'Foraged Mushroom Toast',
      ingredients: ['2 cups foraged mushrooms', 'sourdough toast'],
      instructions: ['Identify the mushrooms you found in the woods.', 'Sauté in butter and pile onto toast.'],
    },
    expect: { status: 'blocked', tags: ['wild_forage_id'] },
  },
  {
    id: 'toxic_lookalike_named',
    note: 'A toxic lookalike named anywhere is an immediate block.',
    recipe: {
      name: 'Spring Mushroom Sauté',
      ingredients: ['morels'],
      instructions: ['Be sure they are not false morels or gyromitra before cooking.'],
    },
    expect: { status: 'blocked', tags: ['wild_forage_id'] },
  },
  {
    id: 'wild_greens_roadside',
    note: 'Wild plant gathered from a roadside.',
    recipe: {
      name: 'Spring Wild Greens Salad',
      ingredients: ['4 cups wild greens'],
      instructions: ['Pick the greens from the meadow and rinse them well.', 'Dress with vinaigrette.'],
    },
    expect: { status: 'blocked', tags: ['wild_forage_id'] },
  },
  {
    id: 'vacuum_sealed_pantry_storage',
    note: 'Anaerobic packaging held outside refrigeration.',
    recipe: {
      name: 'Vacuum Sealed Beef',
      ingredients: ['2 lbs beef'],
      instructions: ['Vacuum seal the beef and keep it in the pantry until you need it.'],
    },
    expect: { status: 'needs_review', tags: ['vacuum_bag_cook'] },
  },
  {
    id: 'canning_plus_forage_combined',
    note: 'Two blocking hazards report together.',
    recipe: {
      name: 'Canned Foraged Mushrooms',
      ingredients: ['4 cups foraged mushrooms'],
      instructions: ['Clean the mushrooms.', 'Pressure can the mushrooms for the pantry.'],
    },
    expect: { status: 'blocked', tags: ['home_canning_low_acid', 'wild_forage_id'] },
  },
]

/** Ordinary recipes that must pass cleanly, including near-miss vocabulary. */
export const SAFE_FIXTURES = [
  {
    id: 'weeknight_roast_chicken',
    note: 'The control case: a normal roast must stay out of the way.',
    recipe: {
      name: 'Weeknight Roast Chicken',
      ingredients: ['1 whole chicken', '2 tbsp butter', 'salt', 'pepper'],
      instructions: ['Heat the oven to 425F.', 'Roast the chicken for 50 minutes until it reaches 165F.', 'Rest and carve.'],
    },
  },
  {
    id: 'garlic_butter_pasta',
    recipe: {
      name: 'Garlic Butter Pasta',
      ingredients: ['1 lb pasta', '4 cloves garlic', '4 tbsp butter'],
      instructions: ['Boil the pasta.', 'Melt butter with garlic and toss with the drained pasta.'],
    },
  },
  {
    id: 'sheet_pan_salmon',
    recipe: {
      name: 'Sheet Pan Salmon and Vegetables',
      ingredients: ['4 salmon fillets', 'potatoes', 'green beans', 'olive oil'],
      instructions: ['Roast the potatoes and green beans for 20 minutes.', 'Add the salmon and roast until cooked through.'],
    },
  },
  {
    id: 'chocolate_chip_cookies',
    note: 'Mentions cookie dough and eggs without any raw-egg claim.',
    recipe: {
      name: 'Chocolate Chip Cookies',
      ingredients: ['2 eggs', 'flour', 'butter', 'chocolate chips'],
      instructions: ['Cream the butter and sugar, then beat in the eggs.', 'Scoop the cookie dough and bake for 11 minutes.'],
    },
  },
  {
    id: 'beef_stew',
    recipe: {
      name: 'Sunday Beef Stew',
      ingredients: ['2 lbs beef chuck', 'carrots', 'potatoes', 'beef broth'],
      instructions: ['Brown the beef.', 'Simmer the stew with the vegetables for two hours.', 'Refrigerate leftovers within two hours.'],
    },
  },
  {
    id: 'store_bought_wild_mushrooms',
    note: 'Wild mushrooms from a shop, with no harvest or identification framing.',
    recipe: {
      name: 'Sautéed Wild Mushrooms',
      ingredients: ['8 oz wild mushrooms', '2 tbsp butter', 'thyme'],
      instructions: ['Sauté the wild mushrooms in butter until browned.', 'Finish with thyme and serve on toast.'],
    },
  },
  {
    id: 'miso_soup',
    note: 'A fermented ingredient is not a fermentation process.',
    recipe: {
      name: 'Miso Soup',
      ingredients: ['3 tbsp miso paste', 'dashi', 'tofu', 'scallions'],
      instructions: ['Warm the dashi.', 'Whisk in the miso paste off the heat and serve.'],
    },
  },
  {
    id: 'sourdough_bread',
    note: 'Bulk fermentation of dough is leavening, not preservation.',
    recipe: {
      name: 'Everyday Sourdough',
      ingredients: ['500g flour', '350g water', '100g sourdough starter', '10g salt'],
      instructions: ['Mix and let the dough ferment at room temperature for 4 hours.', 'Shape, proof, and bake in a Dutch oven.'],
    },
  },
  {
    id: 'refrigerator_pickles',
    note: 'Jars and brine, but the result is stored cold and never shelf-stable.',
    recipe: {
      name: 'Quick Refrigerator Pickles',
      ingredients: ['4 cucumbers', '1 cup vinegar', '1 tbsp salt', 'dill'],
      instructions: ['Pack the cucumbers into jars.', 'Cover with hot brine, seal the jars, and refrigerate for 24 hours before eating.'],
    },
  },
  {
    id: 'sous_vide_with_pasteurization',
    note: 'A documented pasteurization hold is the thing that makes it defensible.',
    recipe: {
      name: 'Sous Vide Chicken, Pasteurized',
      ingredients: ['2 chicken breasts'],
      instructions: [
        'Sous vide the chicken at 145F.',
        'Hold at 145F for 90 minutes to pasteurize per the published pasteurization table.',
      ],
    },
  },
  {
    id: 'roasted_vegetables',
    recipe: {
      name: 'Sheet Pan Roasted Vegetables',
      ingredients: ['carrots', 'potatoes', 'beets', 'olive oil'],
      instructions: ['Toss the vegetables in oil.', 'Roast at 400F for 35 minutes, stirring once.'],
    },
  },
  {
    id: 'medium_rare_steak',
    note: 'Whole-muscle beef cooked rare is ordinary and not gated.',
    recipe: {
      name: 'Pan-Seared Ribeye',
      ingredients: ['1 ribeye steak', 'butter', 'rosemary'],
      instructions: ['Sear the steak four minutes per side.', 'Baste with butter and rest until medium-rare.'],
    },
  },
  {
    id: 'tomato_sauce_fridge',
    recipe: {
      name: 'Simple Tomato Sauce',
      ingredients: ['2 lbs tomatoes', 'garlic', 'basil', 'olive oil'],
      instructions: ['Simmer the tomatoes with garlic for 40 minutes.', 'Cool quickly and refrigerate for up to four days.'],
    },
  },
  {
    id: 'rice_pilaf_safe_cooling',
    note: 'Correct cooling guidance must not trip the holding gate.',
    recipe: {
      name: 'Rice Pilaf',
      ingredients: ['2 cups rice', 'stock', 'onion'],
      instructions: ['Toast the rice, add stock, and simmer 18 minutes.', 'Cool leftovers quickly and refrigerate within two hours.'],
    },
  },
  {
    id: 'hard_boiled_eggs',
    recipe: {
      name: 'Jammy Boiled Eggs',
      ingredients: ['6 eggs'],
      instructions: ['Boil the eggs for 7 minutes.', 'Chill in ice water, then peel.'],
    },
  },
  {
    id: 'freezer_jam',
    note: 'Preserving vocabulary with cold storage only.',
    recipe: {
      name: 'Strawberry Freezer Jam',
      ingredients: ['4 cups strawberries', 'sugar', 'pectin'],
      instructions: ['Crush the berries and stir in pectin.', 'Ladle into jars and freeze; thaw in the refrigerator before use.'],
    },
  },
]

/** Every fixture, hazard and safe, with a resolved expectation. */
export const PROCESS_SAFETY_FIXTURES = [
  ...HAZARD_FIXTURES,
  ...SAFE_FIXTURES.map((fixture) => ({
    ...fixture,
    expect: fixture.expect || { status: 'passed', tags: [] },
  })),
]
