/**
 * FlavourRewardMapV1 offline verifier and deterministic portfolio scorer.
 *
 * The scorer is deliberately model- and network-independent. It consumes a
 * frozen score table and applies hard ingredient constraints before returning
 * a map score; it does not claim that a map is universal human taste truth.
 */

export const FLAVOUR_REWARD_MAP_SCHEMA = 'FlavourRewardMapV1'
export const FLAVOUR_REWARD_MAP_FAMILIES = Object.freeze([
  'substitution',
  'pairing',
  'constraint',
])
export const FLAVOUR_REWARD_MAP_PRODUCT_FLAG = 'flavour_reward_map_v1'

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/
const INGREDIENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

/**
 * Produce a stable JSON representation with sorted object keys and ordered
 * arrays. This is the canonical input used by artifact hashing.
 */
export function canonicalStringify(value) {
  return canonicalize(value, new Set())
}

function canonicalize(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Artifact numbers must be finite')
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('Artifact must not contain circular values')
    ancestors.add(value)
    const result = `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`
    ancestors.delete(value)
    return result
  }

  if (typeof value === 'object' && value !== undefined) {
    if (ancestors.has(value)) throw new TypeError('Artifact must not contain circular values')
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Artifact objects must be plain JSON objects')
    }
    ancestors.add(value)
    const result = `{${Object.keys(value)
      .sort()
      .map((key) => {
        if (value[key] === undefined) {
          throw new TypeError('Artifact must not contain undefined values')
        }
        return `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`
      })
      .join(',')}}`
    ancestors.delete(value)
    return result
  }

  throw new TypeError('Artifact must contain only JSON-compatible values')
}

function mapPayloadWithoutHash(map) {
  return Object.fromEntries(Object.entries(map).filter(([key]) => key !== 'artifactHash'))
}

/** Calculate the SHA-256 content hash, excluding the self-referential hash field. */
export async function computeFlavourRewardMapHash(map) {
  const canonical = canonicalStringify(mapPayloadWithoutHash(map))
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('Web Crypto and TextEncoder are required to hash a reward map')
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  )
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

function combinations(candidateIds, k) {
  const result = []
  const picked = []

  function visit(start) {
    if (picked.length === k) {
      result.push(canonicalPortfolioKey(picked))
      return
    }
    const needed = k - picked.length
    for (let index = start; index <= candidateIds.length - needed; index += 1) {
      picked.push(candidateIds[index])
      visit(index + 1)
      picked.pop()
    }
  }

  visit(0)
  return result
}

/** Canonical key for an unordered portfolio of ingredient ids. */
export function canonicalPortfolioKey(ids) {
  return JSON.stringify([...ids].sort())
}

function validateTask(task, path, errors) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    errors.push(`${path} must be an object`)
    return
  }
  if (typeof task.taskId !== 'string' || !task.taskId.trim()) {
    errors.push(`${path}.taskId must be a non-empty string`)
  }
  if (!FLAVOUR_REWARD_MAP_FAMILIES.includes(task.family)) {
    errors.push(`${path}.family must be one of ${FLAVOUR_REWARD_MAP_FAMILIES.join(', ')}`)
  }
  if (!Array.isArray(task.candidates) || task.candidates.length !== 8) {
    errors.push(`${path}.candidates must contain exactly 8 candidates`)
    return
  }

  const candidateIds = []
  for (const [index, candidate] of task.candidates.entries()) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      errors.push(`${path}.candidates[${index}] must be an object`)
      continue
    }
    if (typeof candidate.id !== 'string' || !INGREDIENT_ID_PATTERN.test(candidate.id)) {
      errors.push(`${path}.candidates[${index}].id is not a valid ingredient id`)
    } else {
      candidateIds.push(candidate.id)
    }
    if (typeof candidate.label !== 'string' || !candidate.label.trim()) {
      errors.push(`${path}.candidates[${index}].label must be a non-empty string`)
    }
  }
  if (new Set(candidateIds).size !== candidateIds.length) {
    errors.push(`${path}.candidates ids must be unique`)
  }
  if (task.k !== 3) errors.push(`${path}.k must be 3`)

  const hardBlockedIds = task.constraints?.hardBlockedIds ?? []
  if (!Array.isArray(hardBlockedIds)) {
    errors.push(`${path}.constraints.hardBlockedIds must be an array when provided`)
  } else {
    if (new Set(hardBlockedIds).size !== hardBlockedIds.length) {
      errors.push(`${path}.constraints.hardBlockedIds must not contain duplicates`)
    }
    for (const id of hardBlockedIds) {
      if (!candidateIds.includes(id)) {
        errors.push(`${path}.constraints.hardBlockedIds contains unknown candidate '${id}'`)
      }
    }
  }

  if (!task.scores || typeof task.scores !== 'object' || Array.isArray(task.scores)) {
    errors.push(`${path}.scores must be an object of frozen portfolio scores`)
    return
  }

  const expectedKeys = new Set(combinations(candidateIds, task.k))
  const actualKeys = Object.keys(task.scores)
  if (actualKeys.length !== expectedKeys.size) {
    errors.push(`${path}.scores must contain exactly ${expectedKeys.size} legal portfolios`)
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(task.scores, key)) {
      errors.push(`${path}.scores is missing legal portfolio ${key}`)
    }
  }
  for (const key of actualKeys) {
    if (!expectedKeys.has(key)) errors.push(`${path}.scores contains illegal portfolio ${key}`)
    const score = task.scores[key]
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      errors.push(`${path}.scores[${key}] must be an integer from 0 to 100`)
    }
  }
}

/** Return structural validation errors for a FlavourRewardMapV1 artifact. */
export function validateFlavourRewardMap(map) {
  const errors = []
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return ['map must be an object']
  }
  if (map.schemaVersion !== FLAVOUR_REWARD_MAP_SCHEMA) {
    errors.push(`schemaVersion must be ${FLAVOUR_REWARD_MAP_SCHEMA}`)
  }
  if (typeof map.mapId !== 'string' || !map.mapId.trim()) {
    errors.push('mapId must be a non-empty string')
  }
  if (typeof map.artifactHash !== 'string' || !HASH_PATTERN.test(map.artifactHash)) {
    errors.push('artifactHash must be a sha256-prefixed lowercase digest')
  }
  if (!map.source || typeof map.source !== 'object' || Array.isArray(map.source)) {
    errors.push('source must identify the artifact provenance and license')
  } else {
    for (const field of ['name', 'provenance', 'license']) {
      if (typeof map.source[field] !== 'string' || !map.source[field].trim()) {
        errors.push(`source.${field} must be a non-empty string`)
      }
    }
  }
  if (!Array.isArray(map.families) || map.families.length === 0) {
    errors.push('families must be a non-empty array')
  } else {
    if (new Set(map.families).size !== map.families.length) {
      errors.push('families must not contain duplicates')
    }
    for (const family of map.families) {
      if (!FLAVOUR_REWARD_MAP_FAMILIES.includes(family)) {
        errors.push(`families contains unsupported family '${family}'`)
      }
    }
  }
  if (!Array.isArray(map.tasks) || map.tasks.length === 0) {
    errors.push('tasks must be a non-empty array')
    return errors
  }

  const taskIds = new Set()
  for (const [index, task] of map.tasks.entries()) {
    validateTask(task, `tasks[${index}]`, errors)
    if (task?.taskId && taskIds.has(task.taskId)) {
      errors.push(`tasks contains duplicate taskId '${task.taskId}'`)
    }
    if (task?.taskId) taskIds.add(task.taskId)
    if (Array.isArray(map.families) && task?.family && !map.families.includes(task.family)) {
      errors.push(`tasks[${index}].family '${task.family}' is not declared in families`)
    }
  }
  return errors
}

/**
 * Validate the artifact structure and its content-addressed SHA-256 digest.
 * No network access or third-party package is used.
 */
export async function verifyFlavourRewardMapIntegrity(map) {
  const errors = validateFlavourRewardMap(map)
  let expectedHash = null
  try {
    expectedHash = await computeFlavourRewardMapHash(map)
    if (expectedHash !== map?.artifactHash) {
      errors.push(`artifactHash mismatch: expected ${expectedHash}`)
    }
  } catch (error) {
    errors.push(`could not compute artifactHash: ${error.message}`)
  }
  return {
    valid: errors.length === 0,
    expectedHash,
    errors,
  }
}

function getTask(taskIdOrInlineTask, taskIndex) {
  if (typeof taskIdOrInlineTask === 'string') {
    const task = taskIndex.get(taskIdOrInlineTask)
    if (!task) throw new RangeError(`Unknown reward map task '${taskIdOrInlineTask}'`)
    return task
  }
  if (!taskIdOrInlineTask || typeof taskIdOrInlineTask !== 'object') {
    throw new TypeError('taskIdOrInlineTask must be a task id or inline task object')
  }
  const errors = []
  validateTask(taskIdOrInlineTask, 'inlineTask', errors)
  if (errors.length) throw new TypeError(`Invalid inline reward map task: ${errors.join('; ')}`)
  return taskIdOrInlineTask
}

function scoreOrder(left, right) {
  if (left.score !== right.score) return right.score - left.score
  if (left.key < right.key) return -1
  if (left.key > right.key) return 1
  return 0
}

/**
 * Bind a verified-or-trusted map to a fast synchronous scorePortfolio API.
 * Call verifyFlavourRewardMapIntegrity first when loading an artifact from an
 * untrusted source; structural checks are always performed here.
 */
export function createFlavourRewardScorer(map) {
  const errors = validateFlavourRewardMap(map)
  if (errors.length) {
    throw new TypeError(`Invalid FlavourRewardMapV1: ${errors.join('; ')}`)
  }
  const taskIndex = new Map(map.tasks.map((task) => [task.taskId, task]))

  function scorePortfolio(taskIdOrInlineTask, chosenIds) {
    const task = getTask(taskIdOrInlineTask, taskIndex)
    if (!Array.isArray(chosenIds) || chosenIds.length !== task.k) {
      throw new TypeError(`chosenIds must contain exactly ${task.k} ingredient ids`)
    }
    if (chosenIds.some((id) => typeof id !== 'string') || new Set(chosenIds).size !== chosenIds.length) {
      throw new TypeError('chosenIds must contain unique string ingredient ids')
    }

    const candidateIds = new Set(task.candidates.map((candidate) => candidate.id))
    for (const id of chosenIds) {
      if (!candidateIds.has(id)) throw new RangeError(`Unknown candidate ingredient '${id}'`)
    }

    const chosenKey = canonicalPortfolioKey(chosenIds)
    const blockedIds = new Set(task.constraints?.hardBlockedIds ?? [])
    const selectedBlockedIds = [...chosenIds].filter((id) => blockedIds.has(id)).sort()
    const blocked = selectedBlockedIds.length > 0
    const scoredPortfolios = Object.entries(task.scores)
      .map(([key, score]) => ({
        key,
        ids: JSON.parse(key),
        score: blockedIds.size > 0 && JSON.parse(key).some((id) => blockedIds.has(id)) ? 0 : score,
      }))
      .filter((portfolio) => !portfolio.ids.some((id) => blockedIds.has(id)))
      .sort(scoreOrder)
    const bestScore = scoredPortfolios[0]?.score ?? 0
    const chosenBaseScore = task.scores[chosenKey]
    const score0to100 = blocked ? 0 : chosenBaseScore
    const rank = blocked
      ? null
      : scoredPortfolios.findIndex((portfolio) => portfolio.key === chosenKey) + 1
    const explanationSource = scoredPortfolios
      .filter((portfolio) => portfolio.key !== chosenKey)
      .slice(0, 3)
    const chosenSet = new Set(chosenIds)
    const explainTopDiffs = explanationSource.map((portfolio) => ({
      ids: portfolio.ids,
      score0to100: portfolio.score,
      delta: portfolio.score - score0to100,
      addedIds: portfolio.ids.filter((id) => !chosenSet.has(id)),
      removedIds: [...chosenSet].filter((id) => !portfolio.ids.includes(id)).sort(),
    }))

    return {
      mapId: map.mapId,
      artifactHash: map.artifactHash,
      taskId: task.taskId,
      family: task.family,
      score0to100,
      bestScore,
      rank,
      explainTopDiffs,
      ...(blocked
        ? {
            blockedReason: `Hard constraint blocks: ${selectedBlockedIds.join(', ')}`,
          }
        : {}),
    }
  }

  return Object.freeze({
    mapId: map.mapId,
    artifactHash: map.artifactHash,
    scorePortfolio,
  })
}
