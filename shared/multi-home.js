/**
 * Multi-Home / Co-Parent Kitchen Custody Rails V1 (#533)
 *
 * Models dual-home kitchens (e.g. co-parenting households, custody rotations),
 * partitioned pantry inventories, and child diner safety synchronization.
 */

export const DEFAULT_HOMES = [
  { id: 'home-primary', name: "Mom's / Primary Home", default: true },
  { id: 'home-secondary', name: "Dad's / Second Home", default: false },
]

/**
 * Resolves the active kitchen locus for a given date based on custody rotation rules.
 * @param {string|Date} date
 * @param {Array<{ startDate: string, endDate: string, homeId: string }>} [rules]
 * @param {string} [defaultHomeId]
 * @returns {string} homeId
 */
export function resolveActiveHomeForDate(date, rules = [], defaultHomeId = 'home-primary') {
  if (!date) return defaultHomeId
  const timestamp = new Date(date).getTime()

  for (const rule of rules) {
    const start = new Date(rule.startDate).getTime()
    const end = new Date(rule.endDate).getTime()
    if (timestamp >= start && timestamp <= end) {
      return rule.homeId
    }
  }

  return defaultHomeId
}

/**
 * Filters pantry inventory items to only those belonging to the active home partition.
 * @param {Array<{ id: string, name: string, homeId?: string }>} items
 * @param {string} activeHomeId
 * @returns {Array<{ id: string, name: string, homeId?: string }>}
 */
export function filterPantryByHome(items = [], activeHomeId = 'home-primary') {
  if (!Array.isArray(items)) return []
  return items.filter(item => (item.homeId || 'home-primary') === activeHomeId)
}
