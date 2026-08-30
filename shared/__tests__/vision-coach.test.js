import { describe, it, expect } from 'vitest'
import {
  VISION_HINT_TYPES,
  THERMOMETER_DISCLAIMER,
  inferStepVisionHint,
  formatVisionFeedback,
} from '../vision-coach.js'

describe('vision-coach helpers', () => {
  it('identifies meat steps requiring digital thermometer verification', () => {
    const hint = inferStepVisionHint('Sear the chicken breasts in the hot skillet until golden brown and cooked through.')
    expect(hint).not.toBeNull()
    expect(hint.type).toBe(VISION_HINT_TYPES.DONENESS_MEAT)
    expect(hint.thermometerRequired).toBe(true)
    expect(hint.safetyDisclaimer).toBe(THERMOMETER_DISCLAIMER)
  })

  it('identifies non-meat browning and searing steps', () => {
    const hint = inferStepVisionHint('Sauté sliced mushrooms in olive oil until golden brown and caramelize.')
    expect(hint).not.toBeNull()
    expect(hint.type).toBe(VISION_HINT_TYPES.COLOR_SEAR)
    expect(hint.thermometerRequired).toBe(false)
  })

  it('identifies baking and rising steps', () => {
    const hint = inferStepVisionHint('Bake at 375F until the crust is golden brown and the center springs back.')
    expect(hint).not.toBeNull()
    expect(hint.type).toBe(VISION_HINT_TYPES.BAKE_SET)
    expect(hint.thermometerRequired).toBe(false)
  })

  it('identifies boiling and simmering steps', () => {
    const hint = inferStepVisionHint('Bring sauce to a rolling boil, then simmer until reduced by half.')
    expect(hint).not.toBeNull()
    expect(hint.type).toBe(VISION_HINT_TYPES.BOIL_VIGOR)
  })

  it('identifies emulsion steps', () => {
    const hint = inferStepVisionHint('Whisk olive oil slowly into the vinaigrette to emulsify until smooth and glossy.')
    expect(hint).not.toBeNull()
    expect(hint.type).toBe(VISION_HINT_TYPES.EMULSION)
  })

  it('returns null for generic non-visual steps', () => {
    const hint = inferStepVisionHint('Gather all spices and measure out salt in a small prep bowl.')
    expect(hint).toBeNull()
  })

  it('formats feedback safely and attaches thermometer disclaimer when required', () => {
    const result = formatVisionFeedback({
      status: 'on_target',
      coaching: 'Nice golden crust forming on the cutlet.',
      thermometerRequired: true,
    })
    expect(result.status).toBe('on_target')
    expect(result.coaching).toBe('Nice golden crust forming on the cutlet.')
    expect(result.safety).toBe(THERMOMETER_DISCLAIMER)
  })

  it('defaults fallback coaching message if none provided', () => {
    const result = formatVisionFeedback({ status: 'under' })
    expect(result.status).toBe('under')
    expect(result.coaching).toBe('Check visual color and texture closely.')
    expect(result.safety).toBeNull()
  })
})
