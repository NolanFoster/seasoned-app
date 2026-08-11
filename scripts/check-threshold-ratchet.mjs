#!/usr/bin/env node
/**
 * Guard the coverage policy against being quietly weakened.
 *
 * A minimum that anyone can edit downward in the same commit that drops
 * coverage is not a minimum. This compares the policy on the PR head against
 * the policy on the base branch and fails when an effective threshold went
 * down, or when a package was dropped from the policy entirely.
 *
 * Raising a threshold, adding a package, and tightening the default are all
 * allowed. Lowering one is a deliberate act that should be its own PR with a
 * written reason, so this check tells the author to use the documented escape
 * hatch (`allowThresholdDecrease` in the policy file) rather than silently
 * blocking them forever.
 *
 * Usage:
 *   node scripts/check-threshold-ratchet.mjs --base origin/main
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_RELATIVE = '.github/coverage-thresholds.json';
const METRICS = ['lines', 'statements', 'functions', 'branches'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') {
      args.base = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function readPolicyAtRef(ref) {
  try {
    const raw = execFileSync('git', ['show', `${ref}:${POLICY_RELATIVE}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return JSON.parse(raw);
  } catch {
    // The policy file does not exist on the base branch yet, which is the
    // case for the pull request that introduces it. Nothing to ratchet against.
    return null;
  }
}

function effectiveThresholds(policy, packageName) {
  const entry = policy.packages?.[packageName];
  if (!entry) return null;
  return { ...policy.defaults, ...(entry.thresholds ?? {}) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base) {
    console.error('Usage: node scripts/check-threshold-ratchet.mjs --base <ref>');
    process.exit(2);
  }

  const basePolicy = readPolicyAtRef(args.base);
  if (!basePolicy) {
    console.log(
      `No coverage policy on ${args.base} to compare against — skipping the ratchet check.`
    );
    return;
  }

  const headPolicy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, POLICY_RELATIVE), 'utf8'));
  const exemptions = new Set(headPolicy.allowThresholdDecrease ?? []);
  const violations = [];

  // The new-code minimum is repository-wide rather than per-package, so it is
  // not covered by the loop below. It still gets enforced for real — by
  // diff-cover in frontend-tests.yml — so leaving it out would let the 85%
  // differential minimum be weakened while the ratchet reported success.
  // Use the reserved name "newCode" in allowThresholdDecrease to lower it.
  if (!exemptions.has('newCode')) {
    const beforeNewCode = basePolicy.newCode?.threshold;
    const afterNewCode = headPolicy.newCode?.threshold;

    if (typeof beforeNewCode === 'number') {
      if (typeof afterNewCode !== 'number') {
        violations.push(
          'The repository-wide newCode.threshold was removed, which would stop new code being gated.'
        );
      } else if (afterNewCode < beforeNewCode) {
        violations.push(
          `The repository-wide newCode.threshold was lowered from ${beforeNewCode}% to ${afterNewCode}%.`
        );
      }
    }
  } else {
    console.log('Skipping newCode.threshold: listed in allowThresholdDecrease.');
  }

  for (const packageName of Object.keys(basePolicy.packages ?? {})) {
    if (exemptions.has(packageName)) {
      console.log(`Skipping ${packageName}: listed in allowThresholdDecrease.`);
      continue;
    }

    const before = effectiveThresholds(basePolicy, packageName);
    const after = effectiveThresholds(headPolicy, packageName);

    if (!after) {
      violations.push(
        `${packageName} was removed from the coverage policy, which would stop it being gated.`
      );
      continue;
    }

    for (const metric of METRICS) {
      if (typeof before[metric] !== 'number' || typeof after[metric] !== 'number') continue;
      if (after[metric] < before[metric]) {
        violations.push(
          `${packageName} ${metric} minimum was lowered from ${before[metric]}% to ${after[metric]}%.`
        );
      }
    }
  }

  if (violations.length === 0) {
    console.log('✅ No coverage minimum was lowered.');
    return;
  }

  for (const violation of violations) {
    console.error(`::error title=Coverage minimum lowered::${violation}`);
  }
  console.error(
    '\nCoverage minimums are a ratchet: they may go up, not down. If lowering one is ' +
      `genuinely correct, add the package name to "allowThresholdDecrease" in ${POLICY_RELATIVE} ` +
      'in a standalone pull request that explains why.'
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`::error title=Ratchet check failed::${error.message}`);
  process.exit(2);
}
