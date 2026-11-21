/**
 * Heuristics and metadata scaffolds for multimodal vision-assisted cooking navigation.
 */

export const VISION_HINT_TYPES = {
  COLOR_SEAR: 'color_sear',
  BAKE_SET: 'bake_set',
  BOIL_VIGOR: 'boil_vigor',
  EMULSION: 'emulsion',
  DONENESS_MEAT: 'doneness_meat',
  GENERAL: 'general',
}

export const THERMOMETER_DISCLAIMER =
  'Always verify internal doneness with a digital meat thermometer (USDA guidelines) before serving.'

const SEAR_KEYWORDS = ['sear', 'brown', 'crisp', 'caramelize', 'sauté', 'saute', 'skillet', 'pan-fry']
const BAKE_KEYWORDS = ['bake', 'oven', 'puff', 'toothpick', 'springs back', 'roast until golden', 'preheat']
const BOIL_KEYWORDS = ['boil', 'simmer', 'rolling boil', 'reduce', 'bubble', 'steam']
const EMULSION_KEYWORDS = ['emulsify', 'whisk until thick', 'mayonnaise', 'hollandaise', 'vinaigrette', 'glossy']
const MEAT_KEYWORDS = ['chicken', 'steak', 'beef', 'pork', 'fish', 'salmon', 'turkey', 'shrimp', 'meat', 'patty', 'burger', 'roast', 'internal temperature']

/**
 * Automatically infers visionHint configuration for an instruction step if not already present.
 * @param {string} stepText
 * @returns {object|null}
 */
export function inferStepVisionHint(stepText) {
  if (!stepText || typeof stepText !== 'string') return null
  const lower = stepText.toLowerCase()

  const isMeat = MEAT_KEYWORDS.some((kw) => lower.includes(kw))
  const isBake = BAKE_KEYWORDS.some((kw) => lower.includes(kw))
  const isSear = SEAR_KEYWORDS.some((kw) => lower.includes(kw))
  const isBoil = BOIL_KEYWORDS.some((kw) => lower.includes(kw))
  const isEmulsion = EMULSION_KEYWORDS.some((kw) => lower.includes(kw))

  if (isMeat && (isSear || isBake || lower.includes('cook until') || lower.includes('reach') || lower.includes('degree'))) {
    return {
      type: VISION_HINT_TYPES.DONENESS_MEAT,
      title: 'Check Meat Browning & Crust',
      promptScaffold: 'Evaluate browning, exterior crust, and visual doneness.',
      thermometerRequired: true,
      safetyDisclaimer: THERMOMETER_DISCLAIMER,
    }
  }

  if (isBake) {
    return {
      type: VISION_HINT_TYPES.BAKE_SET,
      title: 'Check Bake Rise & Crust',
      promptScaffold: 'Evaluate rise, golden crust color, and structural set.',
      thermometerRequired: false,
    }
  }

  if (isSear) {
    return {
      type: VISION_HINT_TYPES.COLOR_SEAR,
      title: 'Check Browning & Color',
      promptScaffold: 'Evaluate surface golden-brown color and sear intensity.',
      thermometerRequired: false,
    }
  }

  if (isEmulsion) {
    return {
      type: VISION_HINT_TYPES.EMULSION,
      title: 'Check Texture & Gloss',
      promptScaffold: 'Evaluate sauce emulsification, thickness, and glossy texture.',
      thermometerRequired: false,
    }
  }

  if (isBoil) {
    return {
      type: VISION_HINT_TYPES.BOIL_VIGOR,
      title: 'Check Simmer / Boil Vigor',
      promptScaffold: 'Evaluate liquid bubbling rate, volume reduction, and vigor.',
      thermometerRequired: false,
    }
  }

  return null
}

/**
 * Formats a visual evaluation response safely with coaching cues and required disclaimers.
 * @param {object} params
 * @param {string} [params.status] - 'under' | 'on_target' | 'over' | 'unclear'
 * @param {string} [params.coaching]
 * @param {boolean} [params.thermometerRequired]
 * @returns {object}
 */
export function formatVisionFeedback({ status = 'on_target', coaching = '', thermometerRequired = false }) {
  const normalizedStatus = ['under', 'on_target', 'over', 'unclear'].includes(status) ? status : 'unclear'
  const safety = thermometerRequired ? THERMOMETER_DISCLAIMER : null

  return {
    status: normalizedStatus,
    coaching: coaching || (normalizedStatus === 'on_target' ? 'Looking right on target!' : 'Check visual color and texture closely.'),
    safety,
    timestamp: new Date().toISOString(),
  }
}
