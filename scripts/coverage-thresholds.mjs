/**
 * Shared accessor for the repository coverage policy.
 *
 * Imported by each package's vitest/jest config so that the numbers a developer
 * sees locally are the same ones the pull request gate enforces. Without this,
 * the per-package configs and `.github/coverage-thresholds.json` drift apart and
 * "it passed on my machine" becomes a legitimate complaint.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const POLICY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'coverage-thresholds.json'
);

let cached;

function loadPolicy() {
  if (cached) return cached;
  if (!fs.existsSync(POLICY_PATH)) {
    throw new Error(
      `Coverage policy not found at ${POLICY_PATH}. Package test configs read their ` +
        'thresholds from the repository root, so they must be run from inside the monorepo.'
    );
  }
  cached = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  return cached;
}

/**
 * Effective thresholds for a package: repo defaults overlaid with any
 * per-package override.
 *
 * @param {string} packageName Key under `packages` in the policy file.
 * @returns {{lines: number, statements: number, functions: number, branches: number}}
 */
export function thresholdsFor(packageName) {
  const policy = loadPolicy();
  const entry = policy.packages?.[packageName];
  if (!entry) {
    throw new Error(
      `Package "${packageName}" is missing from .github/coverage-thresholds.json. ` +
        'Add it there so the pull request coverage gate knows about it.'
    );
  }
  return { ...policy.defaults, ...(entry.thresholds ?? {}) };
}

/**
 * Same values in the shape Jest expects under `coverageThreshold.global`.
 * Jest uses `branches`/`functions`/`lines`/`statements` with the same meaning.
 *
 * @param {string} packageName Key under `packages` in the policy file.
 */
export function jestGlobalThreshold(packageName) {
  const { lines, statements, functions, branches } = thresholdsFor(packageName);
  return { lines, statements, functions, branches };
}
