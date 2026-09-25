import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  canonicalPortfolioKey,
  canonicalStringify,
  computeFlavourRewardMapHash,
  createFlavourRewardScorer,
  validateFlavourRewardMap,
  verifyFlavourRewardMapIntegrity,
} from '../flavour-reward-map.js'

let artifact

beforeAll(async () => {
  artifact = JSON.parse(
    await readFile(new URL('../evals/flavour-reward-map-v1.json', import.meta.url), 'utf8')
  )
})

function bestPortfolio(task) {
  return Object.entries(task.scores)
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))[0]
}

describe('FlavourRewardMapV1 verifier and scorer', () => {
  it('verifies the content hash and all 50 frozen tasks across three families', async () => {
    const result = await verifyFlavourRewardMapIntegrity(artifact)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.expectedHash).toBe(artifact.artifactHash)
    expect(artifact.tasks).toHaveLength(50)
    expect(new Set(artifact.tasks.map((task) => task.family))).toEqual(
      new Set(['substitution', 'pairing', 'constraint'])
    )
    expect(artifact.tasks.every((task) => Object.keys(task.scores).length === 56)).toBe(true)
  })

  it('uses stable canonical JSON and excludes the self-referential hash field', async () => {
    expect(canonicalStringify({ z: 1, a: { y: true, b: 2 } })).toBe(
      '{"a":{"b":2,"y":true},"z":1}'
    )
    expect(await computeFlavourRewardMapHash(artifact)).toBe(artifact.artifactHash)
    expect(canonicalPortfolioKey(['z', 'a', 'b'])).toBe('["a","b","z"]')
  })

  it('scores a stored task and an equivalent inline task identically', () => {
    const task = artifact.tasks[0]
    const [key, frozenScore] = bestPortfolio(task)
    const ids = JSON.parse(key)
    const scorer = createFlavourRewardScorer(artifact)
    const byId = scorer.scorePortfolio(task.taskId, ids)
    const inline = scorer.scorePortfolio(structuredClone(task), ids)

    expect(byId).toEqual(inline)
    expect(byId).toMatchObject({
      mapId: artifact.mapId,
      artifactHash: artifact.artifactHash,
      taskId: task.taskId,
      family: task.family,
      score0to100: frozenScore,
      bestScore: frozenScore,
      rank: 1,
    })
    expect(byId.explainTopDiffs).toHaveLength(3)
    expect(byId.explainTopDiffs[0]).toHaveProperty('addedIds')
    expect(byId.explainTopDiffs[0]).toHaveProperty('removedIds')
    expect(byId.explainTopDiffs[0]).toHaveProperty('delta')
  })

  it('forces allergen-invalid portfolios to zero even when their frozen base score is high', () => {
    const task = artifact.tasks.find((candidate) => candidate.constraints?.hardBlockedIds?.length)
    const blockedId = task.constraints.hardBlockedIds[0]
    const [key, baseScore] = Object.entries(task.scores)
      .filter(([portfolioKey]) => JSON.parse(portfolioKey).includes(blockedId))
      .sort((left, right) => right[1] - left[1])[0]
    const result = createFlavourRewardScorer(artifact).scorePortfolio(task.taskId, JSON.parse(key))

    expect(baseScore).toBeGreaterThan(0)
    expect(result.score0to100).toBe(0)
    expect(result.rank).toBeNull()
    expect(result.blockedReason).toContain(blockedId)
    expect(result.bestScore).toBeGreaterThan(0)
  })

  it('ranks score ties deterministically by canonical portfolio key', () => {
    const tiedMap = structuredClone(artifact)
    const task = tiedMap.tasks[0]
    for (const key of Object.keys(task.scores)) task.scores[key] = 50
    const ids = task.candidates.slice(0, 3).map((candidate) => candidate.id)
    const expectedRank = Object.keys(task.scores).sort().indexOf(canonicalPortfolioKey(ids)) + 1
    const result = createFlavourRewardScorer(tiedMap).scorePortfolio(task.taskId, ids)

    expect(result.score0to100).toBe(50)
    expect(result.bestScore).toBe(50)
    expect(result.rank).toBe(expectedRank)
  })

  it('rejects malformed maps and tampered score tables', async () => {
    expect(validateFlavourRewardMap(null)).toContain('map must be an object')
    const tampered = structuredClone(artifact)
    const task = tampered.tasks[0]
    delete task.scores[Object.keys(task.scores)[0]]
    expect(validateFlavourRewardMap(tampered).some((error) => error.includes('missing legal portfolio'))).toBe(true)

    const changed = structuredClone(artifact)
    const firstTask = changed.tasks[0]
    firstTask.scores[Object.keys(firstTask.scores)[0]] = 101
    expect(validateFlavourRewardMap(changed).some((error) => error.includes('integer from 0 to 100'))).toBe(true)
    const integrity = await verifyFlavourRewardMapIntegrity(changed)
    expect(integrity.valid).toBe(false)
    expect(integrity.errors.some((error) => error.includes('artifactHash mismatch'))).toBe(true)
    expect(() => createFlavourRewardScorer(tampered)).toThrow(/Invalid FlavourRewardMapV1/)
  })

  it('rejects invalid chosen ids, unknown tasks, and malformed inline tasks', () => {
    const scorer = createFlavourRewardScorer(artifact)
    const task = artifact.tasks[0]
    const ids = task.candidates.slice(0, 3).map((candidate) => candidate.id)

    expect(() => scorer.scorePortfolio('not-a-task', ids)).toThrow(/Unknown reward map task/)
    expect(() => scorer.scorePortfolio(task.taskId, ids.slice(0, 2))).toThrow(/exactly 3/)
    expect(() => scorer.scorePortfolio(task.taskId, [ids[0], ids[0], ids[1]])).toThrow(/unique string/)
    expect(() => scorer.scorePortfolio(task.taskId, [ids[0], ids[1], 1])).toThrow(/unique string/)
    expect(() => scorer.scorePortfolio(task.taskId, [ids[0], ids[1], 'not-a-candidate'])).toThrow(/Unknown candidate/)
    expect(() => scorer.scorePortfolio({ taskId: 'bad' }, ids)).toThrow(/Invalid inline reward map task/)
    expect(() => scorer.scorePortfolio(null, ids)).toThrow(/task id or inline task object/)
  })

  it('rejects non-JSON canonical values instead of producing ambiguous hashes', () => {
    const circular = {}
    circular.self = circular
    expect(() => canonicalStringify({ value: undefined })).toThrow(/undefined values/)
    expect(() => canonicalStringify(circular)).toThrow(/circular values/)
    expect(() => canonicalStringify({ value: Number.NaN })).toThrow(/finite/)
    expect(() => canonicalStringify({ value: new Date() })).toThrow(/plain JSON objects/)
  })
})
