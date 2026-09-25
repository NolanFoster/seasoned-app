import { readFile } from 'node:fs/promises'
import {
  FLAVOUR_REWARD_MAP_FAMILIES,
  canonicalPortfolioKey,
  createFlavourRewardScorer,
  verifyFlavourRewardMapIntegrity,
} from '../flavour-reward-map.js'

const artifactPath = new URL('../evals/flavour-reward-map-v1.json', import.meta.url)
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'))
const verification = await verifyFlavourRewardMapIntegrity(artifact)
if (!verification.valid) {
  console.error('FlavourRewardMapV1 verification failed:')
  for (const error of verification.errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  const familyCounts = Object.fromEntries(FLAVOUR_REWARD_MAP_FAMILIES.map((family) => [family, 0]))
  let portfolioCount = 0
  for (const task of artifact.tasks) {
    familyCounts[task.family] += 1
    portfolioCount += Object.keys(task.scores).length
  }

  const missingFamilies = FLAVOUR_REWARD_MAP_FAMILIES.filter((family) => familyCounts[family] === 0)
  if (artifact.tasks.length < 50 || missingFamilies.length > 0) {
    console.error('FlavourRewardMapV1 must contain at least 50 tasks across all three families')
    process.exitCode = 1
  } else {
    const scorer = createFlavourRewardScorer(artifact)
    const constrainedTask = artifact.tasks.find((task) => task.constraints?.hardBlockedIds?.length)
    const blockedId = constrainedTask?.constraints.hardBlockedIds[0]
    const blockedPortfolio = constrainedTask && Object.entries(constrainedTask.scores)
      .filter(([key]) => JSON.parse(key).includes(blockedId))
      .sort((left, right) => right[1] - left[1])[0]
    if (!blockedPortfolio || blockedPortfolio[1] === 0) {
      console.error('The fixture pack needs a non-zero base score to prove hard-block override behavior')
      process.exitCode = 1
    } else {
      const blockedResult = scorer.scorePortfolio(constrainedTask.taskId, JSON.parse(blockedPortfolio[0]))
      if (blockedResult.score0to100 !== 0 || blockedResult.rank !== null) {
        console.error('Hard-blocked portfolios must score zero and must not receive a rank')
        process.exitCode = 1
      } else {
        const firstTask = artifact.tasks[0]
        const firstPortfolio = JSON.parse(Object.keys(firstTask.scores)[0])
        const expectedScore = firstTask.scores[canonicalPortfolioKey(firstPortfolio)]
        const scored = scorer.scorePortfolio(firstTask.taskId, firstPortfolio)
        if (scored.score0to100 !== expectedScore) {
          console.error('Offline score lookup did not match the frozen task table')
          process.exitCode = 1
        }
      }
    }

    if (process.exitCode !== 1) {
      console.log(`Verified ${artifact.tasks.length} tasks (${familyCounts.substitution} substitution, ${familyCounts.pairing} pairing, ${familyCounts.constraint} constraint)`)
      console.log(`Expanded portfolios: ${portfolioCount}; artifact: ${artifact.artifactHash}`)
      console.log('Hard-constraint override: verified; network/GPU dependency: none')
    }
  }
}
