/**
 * Grocery Delivery Substitution & Arrival Reconciliation Loop V1 (#531)
 *
 * Reconciles ordered vs arrived grocery items, checks substitutions against
 * household allergen rules, and proposes meal plan adaptations.
 */

export const RECONCILE_DIFF_TYPES = {
  MATCH: 'match',
  SUBSTITUTION: 'sub',
  MISSING: 'missing',
  EXTRA: 'extra',
}

/**
 * Normalizes an arrival reconciliation diff report.
 * @param {Array<{ name: string }>} ordered
 * @param {Array<{ name: string }>} arrived
 * @param {object} [options]
 * @param {Array<string>} [options.hardAllergens]
 * @returns {Array<{ orderedName?: string, arrivedName?: string, type: string, allergenConflict: boolean }>}
 */
export function reconcileGroceryArrival(ordered = [], arrived = [], options = {}) {
  const hardAllergens = (options.hardAllergens || []).map(a => a.toLowerCase())
  const results = []
  const arrivedCopy = [...arrived]

  for (const ord of ordered) {
    const ordName = typeof ord === 'string' ? ord : ord.name || ''
    const matchIndex = arrivedCopy.findIndex(arr => {
      const arrName = typeof arr === 'string' ? arr : arr.name || ''
      return arrName.toLowerCase() === ordName.toLowerCase()
    })

    if (matchIndex !== -1) {
      const matched = arrivedCopy.splice(matchIndex, 1)[0]
      results.push({
        orderedName: ordName,
        arrivedName: typeof matched === 'string' ? matched : matched.name,
        type: RECONCILE_DIFF_TYPES.MATCH,
        allergenConflict: false,
      })
    } else {
      // Find possible substitution or mark missing
      if (arrivedCopy.length > 0) {
        const sub = arrivedCopy.shift()
        const subName = typeof sub === 'string' ? sub : sub.name || ''
        const hasAllergenConflict = hardAllergens.some(a => subName.toLowerCase().includes(a))

        results.push({
          orderedName: ordName,
          arrivedName: subName,
          type: RECONCILE_DIFF_TYPES.SUBSTITUTION,
          allergenConflict: hasAllergenConflict,
        })
      } else {
        results.push({
          orderedName: ordName,
          type: RECONCILE_DIFF_TYPES.MISSING,
          allergenConflict: false,
        })
      }
    }
  }

  // Any remaining arrived items are extras
  for (const extra of arrivedCopy) {
    const extraName = typeof extra === 'string' ? extra : extra.name || ''
    results.push({
      arrivedName: extraName,
      type: RECONCILE_DIFF_TYPES.EXTRA,
      allergenConflict: hardAllergens.some(a => extraName.toLowerCase().includes(a)),
    })
  }

  return results
}
