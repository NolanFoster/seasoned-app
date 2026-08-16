/**
 * Shared food *process* safety gates.
 *
 * `allergen-graph.js` answers "does this recipe contain an ingredient the user
 * must avoid". This module answers a different question: "does this recipe ask
 * someone to perform a technique that is dangerous when improvised". Home
 * canning schedules, anaerobic ferments, oil infusions, wild mushroom
 * identification, and leftover-holding advice all fail in ways a fluent model
 * is happy to be confident about, so they are treated as first-class
 * constraints with explicit policies rather than prompt wording.
 *
 * The module is deliberately explainable: every finding carries the line that
 * produced it and the policy that was applied, so a UI banner, an audit log,
 * and a test fixture can all describe the same decision.
 *
 * None of this certifies a preservation process. A pass means no mapped hazard
 * was detected, not that a technique is safe for a given kitchen.
 */

/** Policy applied to a detected hazard, ordered from least to most restrictive. */
export const PROCESS_SAFETY_POLICIES = Object.freeze({
  WARN_NEEDS_REVIEW: 'warn_needs_review',
  STRIP_AND_REWRITE: 'strip_and_rewrite',
  FORCE_TEMPLATE: 'force_template',
  BLOCK: 'block',
})

const POLICY_SEVERITY = Object.freeze({
  warn_needs_review: 1,
  strip_and_rewrite: 2,
  force_template: 3,
  block: 4,
})

/** Authoritative references. Seasoned links out; it never authors a schedule. */
export const PROCESS_SAFETY_SOURCES = Object.freeze({
  nchfp: {
    id: 'nchfp',
    label: 'USDA National Center for Home Food Preservation',
    url: 'https://nchfp.uga.edu/',
  },
  usda_canning_guide: {
    id: 'usda_canning_guide',
    label: 'USDA Complete Guide to Home Canning',
    url: 'https://nchfp.uga.edu/publications/publications_usda.html',
  },
  cdc_botulism: {
    id: 'cdc_botulism',
    label: 'CDC — Preventing botulism',
    url: 'https://www.cdc.gov/botulism/prevention.html',
  },
  safe_temperatures: {
    id: 'safe_temperatures',
    label: 'FoodSafety.gov — Safe minimum internal temperatures',
    url: 'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures',
  },
  leftovers_storage: {
    id: 'leftovers_storage',
    label: 'FoodSafety.gov — Leftovers and food safety',
    url: 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts',
  },
  fsa_food_safety: {
    id: 'fsa_food_safety',
    label: 'UK Food Standards Agency — Food safety advice',
    url: 'https://www.food.gov.uk/safety-hygiene',
  },
  poison_control_mushrooms: {
    id: 'poison_control_mushrooms',
    label: 'America’s Poison Centers — wild mushroom exposure guidance',
    url: 'https://poisonhelp.org/',
  },
})

const DISCLAIMER = 'Process checks are automated pattern gates, not a tested process schedule. '
  + 'Seasoned does not certify home preservation; follow a lab-tested guide and local guidance.'

function sourceList(ids) {
  return ids.map((id) => PROCESS_SAFETY_SOURCES[id]).filter(Boolean)
}

/* ------------------------------------------------------------------ *
 * Text extraction
 * ------------------------------------------------------------------ */

const TITLE_FIELDS = ['name', 'title', 'recipeName']
const DESCRIPTION_FIELDS = ['description', 'summary', 'adaptationNotes', 'notes', 'storage']
const INGREDIENT_FIELDS = ['ingredients', 'sourceIngredients', 'recipeIngredient']
const INSTRUCTION_FIELDS = ['instructions', 'steps', 'directions', 'recipeInstructions']

function lineText(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  for (const field of ['text', 'name', 'ingredient', 'original', 'step']) {
    if (typeof value[field] === 'string' && value[field].trim()) return value[field].trim()
  }
  return ''
}

function fieldLines(recipe, fields, kind) {
  const lines = []
  for (const field of fields) {
    const value = recipe[field]
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const text = lineText(item)
        if (text) lines.push({ field: kind, sourceField: field, index, text })
      })
    } else {
      const text = lineText(value)
      if (text) lines.push({ field: kind, sourceField: field, index: null, text })
    }
  }
  return lines
}

/**
 * Collect every line a hazard could hide in. Titles matter ("Pressure-Canned
 * Green Beans"), and so do notes: preservation advice is often tucked into a
 * storage tip rather than a numbered step.
 */
export function collectProcessLines(recipeOrLines) {
  if (Array.isArray(recipeOrLines)) {
    return recipeOrLines
      .map((item, index) => ({ field: 'instruction', sourceField: 'instructions', index, text: lineText(item) }))
      .filter((line) => line.text)
  }
  if (!recipeOrLines || typeof recipeOrLines !== 'object') return []

  const lines = [
    ...fieldLines(recipeOrLines, TITLE_FIELDS, 'title'),
    ...fieldLines(recipeOrLines, DESCRIPTION_FIELDS, 'description'),
    ...fieldLines(recipeOrLines, INGREDIENT_FIELDS, 'ingredient'),
    ...fieldLines(recipeOrLines, INSTRUCTION_FIELDS, 'instruction'),
  ]
  if (recipeOrLines.data && typeof recipeOrLines.data === 'object') {
    lines.push(...collectProcessLines(recipeOrLines.data))
  }
  return lines
}

/**
 * Lowercase and flatten a line for matching. "Canning salt" is removed because
 * it is an ingredient name, not evidence that the recipe cans anything.
 */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\bcanning\s+(?:salt|jars?|funnel|rack|tongs)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchAny(patterns, text) {
  for (const pattern of patterns) {
    const found = text.match(pattern)
    if (found) return found[0].trim()
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Hazard vocabulary
 * ------------------------------------------------------------------ */

// Unambiguous preservation processes. Any one of these is enough on its own.
const STRONG_CANNING = [
  // "pressure can", "pressure canner", "pressure-canned", "pressure canning".
  /\bpressure[- ]?cann?(?:er|ers|ing|ed)?\b/,
  /\bhome[- ]?cann?(?:ing|ed)\b/,
  /\b(?:boiling[- ]?)?water[- ]?bath\s+(?:cann?(?:er|ing|ed)|process(?:ing|ed)?)\b/,
  /\bprocess(?:ing|ed)?\s+(?:the\s+)?(?:jars?|pints?|quarts?|half[- ]pints?)\b/,
  /\bprocess\s+(?:for\s+)?\d+\s*(?:minutes?|mins?|hours?)\s+(?:at|in)\s+(?:\d+|the\s+cann?er)/,
  /\b\d+\s*(?:lbs?|pounds?|psi)\s+(?:of\s+)?pressure\b/,
  /\bretort\b/,
]

// Suggestive of preservation but ordinary in other contexts; these need a
// second signal (a jar, a pantry, months of storage) before they count.
const WEAK_CANNING = [
  /\bcan\s+(?:this|these|it|them|the)\b/,
  /\bcanning\b/,
  /\bput\s+(?:this|these|them|it)\s+up\b/,
  /\bseal(?:ing|ed)?\s+(?:the\s+)?jars?\b/,
  /\bpreserve\s+(?:this|these|it|them|the)\b/,
]

const PRESERVATION_CONTEXT = [
  /\bshelf[- ]stable\b/,
  /\bpantry\b/,
  /\bstore\s+(?:for\s+)?(?:up\s+to\s+)?\d+\s*(?:months?|years?)\b/,
  /\bunrefrigerated\b/,
  /\bjars?\b/,
  /\blids?\s+(?:and\s+)?(?:rings?|bands?)\b/,
  /\bcann?(?:er|ing)\b/,
  /\blong[- ]term\s+storage\b/,
]

// Foods with no tested boiling-water process at any acidity. Canning these at
// home is a pressure-canner-only operation.
const PRESSURE_ONLY_FOODS = [
  /\bmeats?\b/, /\bbeef\b/, /\bpork\b/, /\bchicken\b/, /\bpoultry\b/, /\bturkey\b/,
  /\bfish\b/, /\bseafood\b/, /\bshrimp\b/, /\bstock\b/, /\bbroth\b/, /\bsoups?\b/,
  /\bstews?\b/, /\bchili\b/, /\btamales?\b/, /\bleftovers?\b/, /\bpesto\b/, /\bmilk\b/,
]

// Low-acid vegetables: a pressure process unless the recipe acidifies them,
// which is what turns pickled beets into a tested water-bath recipe.
const LOW_ACID_VEGETABLES = [
  /\bgreen\s+beans?\b/, /\bwax\s+beans?\b/, /\bcorn\b/, /\bcarrots?\b/, /\bbeets?\b/,
  /\bpotatoes?\b/, /\bpeas\b/, /\basparagus\b/, /\bokra\b/, /\bpumpkins?\b/,
  /\bwinter\s+squash\b/, /\bmixed\s+vegetables?\b/,
]

// Low-acid on their own, but also common in tested high-acid recipes such as
// salsa and relish. They only force the pressure-canning block when nothing in
// the recipe supplies acid.
const AMBIGUOUS_ACID_FOODS = [
  /\bonions?\b/, /\bgreens\b/, /\bspinach\b/, /\bmushrooms?\b/, /\bbeans\b/,
  /\bpeppers?\b/, /\bgarlic\b/, /\bbutter\b/,
]

const HIGH_ACID_FOODS = [
  /\bjams?\b/, /\bjell(?:y|ies)\b/, /\bmarmalade\b/, /\bpickles?\b/, /\bpickl(?:ing|ed)\b/,
  /\bsalsa\b/, /\brelish\b/, /\bchutney\b/, /\bapplesauce\b/, /\bpeaches?\b/,
  /\bberries\b/, /\bjuice\b/, /\bvinegar\b/, /\blemon\s+juice\b/, /\bcitric\s+acid\b/,
  /\btomatoes?\b/,
]

// Refrigerator pickles, freezer jam, and fridge preserves reuse the vocabulary
// of canning without the shelf-stable step that makes it dangerous.
const REFRIGERATED_STORAGE = [
  /\brefrigerat(?:e|ed|or|ion)\b/, /\bfridge\b/, /\bfreezer?\b/, /\bfrozen\b/, /\bchilled\b/,
]

const SHELF_STABLE_INTENT = [
  /\bshelf[- ]stable\b/, /\bpantry\b/, /\bcupboard\b/, /\bunrefrigerated\b/,
  /\bstore\s+(?:for\s+)?(?:up\s+to\s+)?\d+\s*(?:months?|years?)\b/, /\bcann?(?:er|ing)\b/,
]

const FERMENT_TERMS = [
  /\bferment(?:s|ed|ing|ation)?\b/,
  /\bsauerkraut\b/, /\bkimchi\b/, /\bkombucha\b/, /\bkvass\b/, /\bmiso\b/,
  /\btepache\b/, /\bwild\s+yeast\s+soda\b/, /\bnatto\b/, /\bcured?\s+sausages?\b/,
]

const FERMENT_PROCESS_CONTEXT = [
  /\bbrine\b/, /\bairlock\b/, /\bcrock\b/, /\bjars?\b/, /\bweights?\b/,
  /\broom\s+temperature\b/, /\b\d+\s*(?:days?|weeks?|months?)\b/, /\bsalt\s+by\s+weight\b/,
  /\b\d+\s*%\s*(?:salt|brine)\b/, /\bscoby\b/, /\bstarter\s+culture\b/, /\banaerobic\b/,
]

// Not anaerobic preservation: buying miso paste is not running a ferment, and
// a bulk-fermented dough is a leavening step rather than a preserved food.
const FERMENT_EXCLUSIONS = [
  /\bsoy\s+sauce\b/, /\bfish\s+sauce\b/, /\bmiso\s+paste\b/, /\bfermented\s+black\s+beans?\b/,
  /\byogurt\b/, /\bvinegar\b/, /\bwine\b/, /\bbeer\b/,
  /\bkimchi\s+(?:from\s+the\s+)?(?:jar|store)\b/,
  /\bdough\b/, /\bbread\b/, /\bloaf\b/, /\bbatter\b/, /\bpizza\b/, /\bstarter\s+discard\b/,
  /\bsourdough\b/, /\bbulk\s+ferment(?:ation)?\b/,
]

const SOUS_VIDE_TERMS = [/\bsous[- ]?vide\b/, /\bimmersion\s+circulator\b/, /\bwater\s+oven\b/]

const PROTEIN_TERMS = [
  /\bchicken\b/, /\bpoultry\b/, /\bturkey\b/, /\bduck\b/, /\bpork\b/, /\bbeef\b/,
  /\bsteak\b/, /\blamb\b/, /\bfish\b/, /\bsalmon\b/, /\bshrimp\b/, /\bscallops?\b/,
  /\beggs?\b/, /\bveal\b/, /\bbrisket\b/, /\bribs?\b/, /\bbreasts?\b/, /\bthighs?\b/,
]

const PASTEURIZATION_TERMS = [
  /\bpasteuri[sz](?:e|ed|ing|ation)\b/,
  /\bhold\s+(?:at\s+)?\d+\s*°?\s*[fc]\b[^.]*\bfor\s+\d+\s*(?:hours?|minutes?)\b/,
  /\bpasteurization\s+table\b/,
]

const RAW_HIGH_RISK_DISHES = [
  /\btartare\b/, /\bcarpaccio\b/, /\bceviche\b/, /\bcrudo\b/, /\bsashimi\b/,
  /\bsteak\s+tartare\b/, /\braw\s+oysters?\b/, /\bhu[ie]l\s+hoe\b/,
]

const RAW_EGG_APPLICATIONS = [
  /\baioli\b/, /\bmayonnaise\b/, /\bmousse\b/, /\btiramisu\b/, /\beggnog\b/,
  /\bcookie\s+dough\b/, /\bmeringue\b/, /\bsmoothie\b/, /\bcaesar\s+dressing\b/,
  /\bno[- ]bake\b/, /\buncooked\b/,
]

const UNDERCOOKED_PATTERNS = [
  /\b(?:serve|eat|consume|enjoy)[^.]{0,40}\braw\b/,
  /\braw\b[^.]{0,20}\b(?:is\s+fine|is\s+safe|can\s+be\s+eaten)\b/,
  /\b(?:rare|medium[- ]rare|still\s+pink|pink\s+in\s+the\s+(?:middle|centre|center))\b[^.]{0,40}\b(?:chicken|poultry|turkey|pork|ground\s+beef|burgers?|sausages?)\b/,
  /\b(?:chicken|poultry|turkey|pork|ground\s+beef|burgers?|sausages?)\b[^.]{0,40}\b(?:rare|medium[- ]rare|still\s+pink|slightly\s+pink)\b/,
  /\bundercook(?:ed|ing)?\b/,
  /\bunpasteuri[sz]ed\s+(?:milk|cheese|juice|cider|eggs?)\b/,
]

const FORAGE_TERMS = [/\bforag(?:e|ed|ing|er)\b/, /\bwildcraft(?:ed|ing)?\b/]

const WILD_INGREDIENT_PATTERN = /\bwild\s+(?:mushrooms?|greens?|berries|berry|plants?|herbs?|garlic|onions?|leeks?|ramps?)\b/

const FORAGE_CONTEXT = [
  /\byou\s+(?:found|picked|gathered|collected)\b/,
  /\b(?:woods|forest|backyard|trail|meadow|roadside)\b/,
  /\bidentif(?:y|ying|ication)\b/,
  /\bpick\s+(?:your\s+own|them\s+yourself)\b/,
  /\bharvest(?:ed|ing)?\s+(?:them|it|the\s+\w+)\s+(?:yourself|from)\b/,
]

const TOXIC_LOOKALIKES = [
  /\bamanita\b/, /\bdeath\s+cap\b/, /\bdestroying\s+angel\b/, /\bfalse\s+morels?\b/,
  /\bgyromitra\b/, /\bpokeweed\b/, /\bpoke\s+sallet\b/, /\bwater\s+hemlock\b/,
  /\bdeadly\s+nightshade\b/, /\bjack[- ]o[- ]lantern\s+mushrooms?\b/, /\belderberry\s+stems?\b/,
]

const OIL_INFUSION_TERMS = [
  /\binfus(?:e|ed|ing|ion)\b[^.]{0,40}\boil\b/,
  /\boil\b[^.]{0,40}\binfus(?:e|ed|ing|ion)\b/,
  /\bgarlic\s+confit\b/,
  /\bgarlic\s+in\s+oil\b/,
  /\b(?:garlic|herb|chili|chile|basil|rosemary|thyme|pepper)[- ]infused\s+oil\b/,
]

const OIL_INFUSION_AROMATICS = [
  /\bgarlic\b/, /\bherbs?\b/, /\bbasil\b/, /\brosemary\b/, /\bthyme\b/, /\bchil(?:i|e|li)s?\b/,
  /\bpeppers?\b/, /\blemon\s+peel\b/, /\bsun[- ]dried\s+tomatoes?\b/, /\bmushrooms?\b/,
]

const UNSAFE_HOLDING_PATTERNS = [
  /\b(?:leave|left|leaving|sit|sitting|rest|resting|stand)\b[^.]{0,40}\b(?:overnight|all\s+day|all\s+night|for\s+hours)\b/,
  /\broom\s+temperature\b[^.]{0,30}\b(?:overnight|all\s+day|\d+\s*hours?)\b/,
  /\bcool\s+slowly\b/,
  /\breheat(?:ed|ing)?\b[^.]{0,30}\b(?:twice|again|multiple\s+times|several\s+times)\b/,
  /\bon\s+the\s+counter\b[^.]{0,30}\b(?:overnight|all\s+day|until\s+tomorrow)\b/,
]

const COOLED_FOOD_TERMS = [
  /\brice\b/, /\bpasta\b/, /\bnoodles?\b/, /\bgrains?\b/, /\bquinoa\b/, /\bbeans\b/,
  /\bleftovers?\b/, /\bstock\b/, /\bbroth\b/, /\bsoups?\b/, /\bstews?\b/, /\bgravy\b/,
  /\bcooked\s+(?:chicken|meat|pork|beef)\b/,
]

const VACUUM_TERMS = [/\bvacuum[- ](?:seal(?:ed|ing|er)?|bag(?:ged|ging)?|pack(?:ed|ing)?)\b/, /\bfoodsaver\b/]

const VACUUM_UNSAFE_CONTEXT = [
  /\broom\s+temperature\b/, /\bpantry\b/, /\bcounter\b/, /\bshelf[- ]stable\b/,
  /\bunrefrigerated\b/, /\bstore\s+(?:for\s+)?(?:up\s+to\s+)?\d+\s*(?:days?|weeks?|months?)\b/,
]

/**
 * Numeric process schedules (PSI, jar processing times, pressure) must never
 * originate from the base model. Used both as a detection signal and as a
 * fail-closed assertion after policies are applied.
 */
const PROCESS_SCHEDULE_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*(?:lbs?|pounds?|psi)\s+(?:of\s+)?pressure\b/,
  /\bat\s+\d+(?:\.\d+)?\s*(?:lbs?|psi)\b/,
  /\bprocess\s+(?:the\s+\w+\s+)?(?:for\s+)?\d+\s*(?:minutes?|mins?|hours?)\b/,
  /\b\d+\s*(?:minutes?|mins?)\s+(?:in|at)\s+(?:a\s+)?(?:pressure\s+)?cann?er\b/,
  /\bcann?er\b[^.]{0,30}\b\d+\s*(?:minutes?|mins?|psi|lbs?)\b/,
]

const SCHEDULE_REDACTION = '[redacted]'

/** True when text contains a numeric home-preservation schedule. */
export function containsProcessSchedule(value) {
  const text = normalize(value)
  return PROCESS_SCHEDULE_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * Remove the numbers from a preservation schedule while leaving the sentence
 * readable. A blocked recipe still has to explain which step stopped it, but
 * the quoted evidence must not smuggle the model's invented PSI and timing
 * through the error payload.
 */
export function redactProcessSchedules(value) {
  let text = String(value || '')
  for (const pattern of PROCESS_SCHEDULE_PATTERNS) {
    text = text.replace(
      new RegExp(pattern.source, 'gi'),
      (fragment) => fragment.replace(/\d+(?:\.\d+)?/g, SCHEDULE_REDACTION),
    )
  }
  return text
}

/* ------------------------------------------------------------------ *
 * Hazard definitions
 * ------------------------------------------------------------------ */

/**
 * Evidence that the recipe performs a preservation process. Weak signals such
 * as "seal the jars" need supporting context, and are dropped entirely when
 * the recipe only ever stores the result cold — a refrigerator pickle is not a
 * canning recipe.
 */
function canningEvidence(text, all = text) {
  const strong = matchAny(STRONG_CANNING, text)
  if (strong) return strong
  const weak = matchAny(WEAK_CANNING, text)
  if (!weak || !matchAny(PRESERVATION_CONTEXT, text)) return null
  if (matchAny(REFRIGERATED_STORAGE, all) && !matchAny(SHELF_STABLE_INTENT, all)) return null
  return weak
}

/**
 * Hazard tags. `detect` receives one normalized line plus the whole recipe's
 * normalized text, because evidence is frequently split across lines: a title
 * names the food and a step names the process.
 */
const HAZARD_DEFINITIONS = [
  {
    id: 'home_canning_low_acid',
    label: 'Home canning of low-acid food',
    policy: PROCESS_SAFETY_POLICIES.BLOCK,
    reason: 'Low-acid foods canned without a tested pressure schedule are a botulism risk.',
    guidance: 'Use a tested pressure-canning schedule from the USDA/NCHFP guide for this exact food, jar size, and altitude.',
    sources: ['usda_canning_guide', 'nchfp', 'cdc_botulism'],
    detect(line, all) {
      // The preservation process must appear on this line; the food it applies
      // to is read from the whole recipe, because a step says "process the
      // jars" while only the title names the green beans.
      const evidence = canningEvidence(line, all)
      if (!evidence) return null
      if (/\bpressure\b/.test(evidence)) return evidence
      if (matchAny(PRESSURE_ONLY_FOODS, all)) return evidence
      const acidified = matchAny(HIGH_ACID_FOODS, all)
      // Acidified vegetables (pickled beets, dilly beans) have tested
      // boiling-water processes and fall through to the template gate.
      if (matchAny(LOW_ACID_VEGETABLES, all) && !acidified) return evidence
      if (matchAny(AMBIGUOUS_ACID_FOODS, all) && !acidified) return evidence
      return null
    },
  },
  {
    id: 'water_bath_preserve',
    label: 'Water-bath preserving',
    policy: PROCESS_SAFETY_POLICIES.FORCE_TEMPLATE,
    reason: 'Water-bath preserving is only safe for high-acid foods processed to a tested schedule.',
    guidance: 'Follow a tested NCHFP recipe for the jar size and altitude instead of an improvised processing time.',
    sources: ['nchfp', 'usda_canning_guide'],
    detect(line, all) {
      return canningEvidence(line, all)
    },
  },
  {
    id: 'wild_forage_id',
    label: 'Wild forage identification',
    policy: PROCESS_SAFETY_POLICIES.BLOCK,
    reason: 'Identifying wild mushrooms or plants from text can be fatal; toxic lookalikes are common.',
    guidance: 'Have every wild specimen identified in person by a qualified local expert before it is eaten.',
    sources: ['poison_control_mushrooms', 'fsa_food_safety'],
    detect(line, all) {
      const toxic = matchAny(TOXIC_LOOKALIKES, line)
      if (toxic) return toxic
      const forage = matchAny(FORAGE_TERMS, line)
      if (forage) return forage
      // "Wild mushrooms" from a shop are ordinary; the gate needs harvest or
      // identification framing somewhere in the recipe.
      const wild = matchAny([WILD_INGREDIENT_PATTERN], line)
      if (wild && matchAny(FORAGE_CONTEXT, all)) return wild
      return null
    },
  },
  {
    id: 'infused_oil_garlic',
    label: 'Garlic or herb oil infusion',
    policy: PROCESS_SAFETY_POLICIES.FORCE_TEMPLATE,
    reason: 'Fresh aromatics held in oil are anaerobic and support Clostridium botulinum growth.',
    guidance: 'Refrigerate infused oils, use them within a few days, and never store them at room temperature.',
    sources: ['cdc_botulism', 'nchfp'],
    detect(line, all) {
      const evidence = matchAny(OIL_INFUSION_TERMS, line)
      if (!evidence) return null
      return matchAny(OIL_INFUSION_AROMATICS, line) || matchAny(OIL_INFUSION_AROMATICS, all)
        ? evidence
        : null
    },
  },
  {
    id: 'fermentation_anaerobic',
    label: 'Anaerobic fermentation',
    policy: PROCESS_SAFETY_POLICIES.WARN_NEEDS_REVIEW,
    reason: 'Salt concentration and temperature ranges decide whether a ferment is safe; generated values are often wrong.',
    guidance: 'Verify brine percentage, temperature range, and vessel handling against a tested fermentation guide.',
    sources: ['nchfp', 'fsa_food_safety'],
    detect(line, all) {
      const evidence = matchAny(FERMENT_TERMS, line)
      if (!evidence) return null
      if (matchAny(FERMENT_EXCLUSIONS, line)) return null
      return matchAny(FERMENT_PROCESS_CONTEXT, all) ? evidence : null
    },
  },
  {
    id: 'sous_vide_low_temp_protein',
    label: 'Low-temperature sous vide protein',
    policy: PROCESS_SAFETY_POLICIES.WARN_NEEDS_REVIEW,
    reason: 'Sous vide protein below 130°F/54°C is only safe with a pasteurization hold time.',
    guidance: 'Check the temperature and hold time against a published pasteurization table for the protein and thickness.',
    sources: ['safe_temperatures', 'fsa_food_safety'],
    detect(line, all) {
      const evidence = matchAny(SOUS_VIDE_TERMS, line)
      if (!evidence) return null
      if (!matchAny(PROTEIN_TERMS, all)) return null
      // A stated pasteurization hold is the thing that makes a low temperature
      // defensible, so a recipe that documents one is not flagged.
      if (matchAny(PASTEURIZATION_TERMS, all)) return null
      return evidence
    },
  },
  {
    id: 'vacuum_bag_cook',
    label: 'Vacuum-sealed storage or cooking',
    policy: PROCESS_SAFETY_POLICIES.WARN_NEEDS_REVIEW,
    reason: 'Vacuum sealing removes oxygen; held outside refrigeration it favours anaerobic pathogens.',
    guidance: 'Keep vacuum-sealed food refrigerated or frozen and follow tested chilling times.',
    sources: ['cdc_botulism', 'leftovers_storage'],
    detect(line) {
      const evidence = matchAny(VACUUM_TERMS, line)
      if (!evidence) return null
      return matchAny(VACUUM_UNSAFE_CONTEXT, line) ? evidence : null
    },
  },
  {
    id: 'raw_high_risk_protein',
    label: 'Raw or undercooked high-risk protein',
    policy: PROCESS_SAFETY_POLICIES.WARN_NEEDS_REVIEW,
    reason: 'Raw or undercooked poultry, pork, eggs, shellfish, and unpasteurized dairy carry pathogen risk.',
    guidance: 'Cook to a safe minimum internal temperature, or source products intended to be eaten raw.',
    sources: ['safe_temperatures', 'fsa_food_safety'],
    detect(line, all) {
      const dish = matchAny(RAW_HIGH_RISK_DISHES, line)
      if (dish) return dish
      const undercooked = matchAny(UNDERCOOKED_PATTERNS, line)
      if (undercooked) return undercooked
      const rawEgg = matchAny([/\braw\s+eggs?\b/], line)
      if (rawEgg && (matchAny(RAW_EGG_APPLICATIONS, line) || matchAny(RAW_EGG_APPLICATIONS, all))) return rawEgg
      return null
    },
  },
  {
    id: 'reheat_rice_cooling',
    label: 'Unsafe cooling or reheating of cooked food',
    policy: PROCESS_SAFETY_POLICIES.STRIP_AND_REWRITE,
    reason: 'Cooked starches and stocks held in the danger zone grow Bacillus cereus and other pathogens.',
    guidance: 'Chill cooked food quickly, refrigerate within two hours, and reheat once until steaming hot.',
    sources: ['leftovers_storage', 'fsa_food_safety'],
    detect(line, all) {
      const evidence = matchAny(UNSAFE_HOLDING_PATTERNS, line)
      if (!evidence) return null
      return matchAny(COOLED_FOOD_TERMS, line) || matchAny(COOLED_FOOD_TERMS, all) ? evidence : null
    },
  },
]

/** Public, serializable view of the taxonomy (no regexes). */
export const PROCESS_HAZARD_TAGS = Object.freeze(Object.fromEntries(
  HAZARD_DEFINITIONS.map((hazard) => [hazard.id, Object.freeze({
    id: hazard.id,
    label: hazard.label,
    policy: hazard.policy,
    reason: hazard.reason,
    guidance: hazard.guidance,
    sources: sourceList(hazard.sources),
  })]),
))

/* ------------------------------------------------------------------ *
 * Detection and analysis
 * ------------------------------------------------------------------ */

/**
 * Detect process hazards. Every match records the line that produced it so the
 * decision can be explained in a banner or an audit log.
 */
export function detectProcessHazards(recipeOrLines) {
  const lines = collectProcessLines(recipeOrLines)
  const normalizedLines = lines.map((line) => ({ ...line, normalized: normalize(line.text) }))
  const allText = normalizedLines.map((line) => line.normalized).join(' . ')
  const matches = []

  for (const hazard of HAZARD_DEFINITIONS) {
    for (const line of normalizedLines) {
      const evidence = hazard.detect(line.normalized, allText)
      if (!evidence) continue
      matches.push({
        tag: hazard.id,
        label: hazard.label,
        policy: hazard.policy,
        field: line.field,
        sourceField: line.sourceField,
        index: line.index,
        evidence: redactProcessSchedules(line.text),
        matchedTerm: redactProcessSchedules(evidence),
        reason: hazard.reason,
      })
    }
  }

  // A low-acid canning block already covers the generic water-bath finding.
  const hasLowAcidCanning = matches.some((match) => match.tag === 'home_canning_low_acid')
  return matches.filter((match) => !(hasLowAcidCanning && match.tag === 'water_bath_preserve'))
}

function highestPolicy(tags) {
  let highest = null
  for (const tag of tags) {
    const policy = PROCESS_HAZARD_TAGS[tag]?.policy
    if (!policy) continue
    if (!highest || POLICY_SEVERITY[policy] > POLICY_SEVERITY[highest]) highest = policy
  }
  return highest
}

function statusFor(policy) {
  if (policy === PROCESS_SAFETY_POLICIES.BLOCK) return 'blocked'
  if (policy === PROCESS_SAFETY_POLICIES.FORCE_TEMPLATE) return 'template_required'
  if (policy) return 'needs_review'
  return 'passed'
}

/**
 * Analyze a recipe for process hazards.
 *
 * `safe` means no hazard requires the recipe to be withheld or redirected to a
 * tested template. Warnings leave `safe` true but set `needs_review`, matching
 * how the allergen graph separates a conflict from an unverified result.
 */
export function analyzeProcessSafety(recipeOrLines) {
  const matches = detectProcessHazards(recipeOrLines)
  const tags = [...new Set(matches.map((match) => match.tag))]
  const byPolicy = (policy) => tags.filter((tag) => PROCESS_HAZARD_TAGS[tag].policy === policy)

  const blocked = byPolicy(PROCESS_SAFETY_POLICIES.BLOCK)
  const requiresTemplate = byPolicy(PROCESS_SAFETY_POLICIES.FORCE_TEMPLATE)
  const rewritten = byPolicy(PROCESS_SAFETY_POLICIES.STRIP_AND_REWRITE)
  const warned = byPolicy(PROCESS_SAFETY_POLICIES.WARN_NEEDS_REVIEW)

  const policyActions = tags.map((tag) => ({
    tag,
    label: PROCESS_HAZARD_TAGS[tag].label,
    policy: PROCESS_HAZARD_TAGS[tag].policy,
    action: PROCESS_HAZARD_TAGS[tag].policy,
    reason: PROCESS_HAZARD_TAGS[tag].reason,
    guidance: PROCESS_HAZARD_TAGS[tag].guidance,
  }))

  const warnings = [...rewritten, ...warned].map((tag) => ({
    tag,
    label: PROCESS_HAZARD_TAGS[tag].label,
    policy: PROCESS_HAZARD_TAGS[tag].policy,
    reason: PROCESS_HAZARD_TAGS[tag].reason,
    guidance: PROCESS_HAZARD_TAGS[tag].guidance,
    evidence: matches.find((match) => match.tag === tag)?.evidence || null,
  }))

  const sources = []
  for (const tag of tags) {
    for (const source of PROCESS_HAZARD_TAGS[tag].sources) {
      if (!sources.some((existing) => existing.id === source.id)) sources.push(source)
    }
  }

  const policy = highestPolicy(tags)
  const safe = blocked.length === 0 && requiresTemplate.length === 0

  return {
    checked: true,
    safe,
    status: statusFor(policy),
    policy: policy || 'allow',
    tags,
    blocked,
    requires_template: requiresTemplate,
    rewritten,
    warnings,
    policyActions,
    sources,
    matches,
    needs_review: warnings.length > 0,
    cook_gate: safe ? (warnings.length > 0 ? 'confirm' : 'allow') : 'block',
    disclaimer: DISCLAIMER,
  }
}

/* ------------------------------------------------------------------ *
 * Policy application
 * ------------------------------------------------------------------ */

function referralText(tag) {
  const hazard = PROCESS_HAZARD_TAGS[tag]
  const sources = hazard.sources.map((source) => `${source.label} (${source.url})`).join('; ')
  return `Step removed by Seasoned's ${hazard.label.toLowerCase()} gate: ${hazard.reason} `
    + `${hazard.guidance} See ${sources}.`
}

function rewriteList(recipe, field, indexesByTag) {
  const value = recipe[field]
  if (!Array.isArray(value)) return { value, changed: false }
  let changed = false
  const next = value.map((item, index) => {
    const tag = indexesByTag.get(index)
    if (!tag) return item
    changed = true
    const replacement = referralText(tag)
    if (typeof item === 'string') return replacement
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const textField = ['text', 'name', 'step'].find((candidate) => typeof item[candidate] === 'string')
      return textField ? { ...item, [textField]: replacement } : replacement
    }
    return replacement
  })
  return { value: next, changed }
}

/**
 * Replace improvised steps for `force_template` and `strip_and_rewrite`
 * hazards with a referral to an authoritative source. The recipe keeps its
 * shape so the client renders it normally, but the unsafe technique text —
 * including any numeric process schedule — is gone.
 */
export function applyProcessSafetyPolicy(recipe, summary = analyzeProcessSafety(recipe)) {
  const rewriteTags = new Set([...summary.requires_template, ...summary.rewritten])
  if (rewriteTags.size === 0) return { recipe, rewrittenSteps: 0 }

  const targets = summary.matches.filter(
    (match) => rewriteTags.has(match.tag) && match.field !== 'title' && match.index !== null,
  )
  if (targets.length === 0) return { recipe, rewrittenSteps: 0 }

  const next = { ...recipe }
  let rewrittenSteps = 0
  const fields = [...new Set(targets.map((match) => match.sourceField))]
  for (const field of fields) {
    const indexesByTag = new Map()
    for (const match of targets) {
      if (match.sourceField === field) indexesByTag.set(match.index, match.tag)
    }
    const { value, changed } = rewriteList(next, field, indexesByTag)
    if (changed) {
      next[field] = value
      rewrittenSteps += indexesByTag.size
    }
  }

  return { recipe: next, rewrittenSteps }
}

/* ------------------------------------------------------------------ *
 * Boundary helpers
 * ------------------------------------------------------------------ */

export class ProcessSafetyError extends Error {
  constructor(summary) {
    const tags = summary.blocked.length > 0 ? summary.blocked.join(', ') : 'unverified process hazard'
    super(`Recipe failed food-process safety validation (${tags})`)
    this.name = 'ProcessSafetyError'
    this.code = 'PROCESS_SAFETY_BLOCK'
    this.status = 422
    this.summary = summary
  }
}

/**
 * Annotate a recipe with its process-safety summary, applying template and
 * rewrite policies. Blocking hazards are reported through the summary; use
 * `enforceProcessSafety` at an API boundary to turn them into an error.
 */
export function withProcessSafetySummary(recipe) {
  const summary = analyzeProcessSafety(recipe)
  const { recipe: rewritten, rewrittenSteps } = applyProcessSafetyPolicy(recipe, summary)

  // Fail closed: if a template/rewrite pass left a numeric preservation
  // schedule behind, treat the recipe as blocked rather than shipping it.
  const residualSchedule = summary.requires_template.length > 0
    && collectProcessLines(rewritten).some((line) => containsProcessSchedule(line.text))
  const finalSummary = residualSchedule
    ? {
      ...summary,
      safe: false,
      status: 'blocked',
      policy: PROCESS_SAFETY_POLICIES.BLOCK,
      blocked: [...new Set([...summary.blocked, ...summary.requires_template])],
      cook_gate: 'block',
      escalated: 'residual_process_schedule',
    }
    : summary

  return {
    ...rewritten,
    processSafetySummary: { ...finalSummary, rewritten_steps: rewrittenSteps },
    processSafetyValidation: finalSummary.status === 'passed'
      ? 'PASSED'
      : finalSummary.status.toUpperCase(),
  }
}

/**
 * Annotate a recipe and throw before it crosses an API boundary when a
 * blocking hazard is present. Template and rewrite policies are applied in
 * place so the returned recipe never carries improvised process instructions.
 */
export function enforceProcessSafety(recipe) {
  const annotated = withProcessSafetySummary(recipe)
  if (annotated.processSafetySummary.blocked.length > 0) {
    throw new ProcessSafetyError(annotated.processSafetySummary)
  }
  return annotated
}

/**
 * Structured audit record for observability (Opik tags, worker logs). Kept
 * free of recipe text so it is safe to emit into a trace.
 */
export function describeProcessSafetyDecision(summary, context = {}) {
  return {
    'process_safety.checked': Boolean(summary?.checked),
    'process_safety.blocked': Boolean(summary?.blocked?.length),
    'process_safety.status': summary?.status || 'unknown',
    'process_safety.policy': summary?.policy || 'allow',
    'process_safety.tags': summary?.tags || [],
    'process_safety.blocked_tags': summary?.blocked || [],
    'process_safety.warning_tags': (summary?.warnings || []).map((warning) => warning.tag),
    'process_safety.rewritten_steps': summary?.rewritten_steps || 0,
    ...context,
  }
}

/**
 * Process gates are on by default. They may be disabled only outside
 * production, or by an explicit, logged break-glass switch (see
 * docs/FOOD_PROCESS_SAFETY.md).
 */
export function isProcessSafetyEnabled(env = {}) {
  const environment = String(env.ENVIRONMENT || '').toLowerCase()
  const breakGlass = String(env.PROCESS_SAFETY_BREAK_GLASS || '').toLowerCase() === 'true'
  if (breakGlass) return false

  const flag = String(env.PROCESS_SAFETY_V1 ?? '').toLowerCase()
  const disabledByFlag = flag === 'false' || flag === 'off' || flag === '0'
  if (!disabledByFlag) return true
  return environment === 'production'
}
