#!/usr/bin/env node
/**
 * Enforce the repository coverage policy for a single package.
 *
 * Reads the thresholds declared in `.github/coverage-thresholds.json` and
 * compares them against the coverage report a package just produced. Exits
 * non-zero when any metric is below its minimum, which is what makes coverage
 * a blocking condition on pull requests rather than a advisory comment.
 *
 * Usage:
 *   node scripts/check-coverage.mjs --package recipe-app
 *   node scripts/check-coverage.mjs --package clipper --coverage-dir clipper/coverage
 *
 * Options:
 *   --package <name>       Key under `packages` in the policy file. Required.
 *   --coverage-dir <path>  Where the report lives. Defaults to <package>/coverage.
 *   --summary-out <path>   Write a markdown fragment here for the PR comment.
 *   --warn-only            Report violations but exit 0. Used for ratchet dry runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_PATH = path.join(REPO_ROOT, '.github', 'coverage-thresholds.json');
const METRICS = ['lines', 'statements', 'functions', 'branches'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'warn-only') {
      args.warnOnly = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function loadPolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    throw new Error(`Coverage policy not found at ${POLICY_PATH}`);
  }
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

/**
 * Resolve the effective thresholds for a package: policy defaults, overlaid
 * with any per-package overrides. Overrides exist so a package that is still
 * climbing toward the repo default can be held to its current level without
 * disabling the gate entirely.
 */
function resolveThresholds(policy, packageName) {
  const entry = policy.packages?.[packageName];
  if (!entry) {
    throw new Error(
      `Package "${packageName}" is not listed in .github/coverage-thresholds.json. ` +
        'Add it there before wiring it into the coverage gate.'
    );
  }
  const thresholds = { ...policy.defaults, ...(entry.thresholds ?? {}) };
  for (const metric of METRICS) {
    if (typeof thresholds[metric] !== 'number') {
      throw new Error(`Threshold for "${metric}" on package "${packageName}" is not a number`);
    }
  }
  return { entry, thresholds };
}

/**
 * Istanbul's json-summary format, emitted by Jest, Vitest (v8 provider) and c8
 * alike. This is the preferred source because it already carries computed
 * percentages for every metric.
 */
function readJsonSummary(coverageDir) {
  const summaryPath = path.join(coverageDir, 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) return null;

  const total = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))?.total;
  if (!total) return null;

  const actual = {};
  for (const metric of METRICS) {
    const pct = total[metric]?.pct;
    // An empty report yields "Unknown" rather than a number.
    actual[metric] = typeof pct === 'number' ? pct : 0;
  }
  return { actual, source: path.relative(REPO_ROOT, summaryPath) };
}

/**
 * Fallback for reports that only produced lcov. lcov has no notion of
 * statements, so statement coverage is reported as line coverage — the same
 * approximation the existing per-worker workflows already make.
 */
function readLcov(coverageDir) {
  const lcovPath = path.join(coverageDir, 'lcov.info');
  if (!fs.existsSync(lcovPath)) return null;

  const totals = { LF: 0, LH: 0, FNF: 0, FNH: 0, BRF: 0, BRH: 0 };
  for (const line of fs.readFileSync(lcovPath, 'utf8').split('\n')) {
    const [key, value] = line.trim().split(':');
    if (key in totals) totals[key] += Number(value) || 0;
  }

  const pct = (hit, found) => (found > 0 ? (hit / found) * 100 : 100);
  const lines = pct(totals.LH, totals.LF);
  return {
    actual: {
      lines,
      statements: lines,
      functions: pct(totals.FNH, totals.FNF),
      branches: pct(totals.BRH, totals.BRF)
    },
    source: path.relative(REPO_ROOT, lcovPath)
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageName = args.package;
  if (!packageName) {
    console.error('Usage: node scripts/check-coverage.mjs --package <name> [--coverage-dir <path>]');
    process.exit(2);
  }

  const policy = loadPolicy();
  const { entry, thresholds } = resolveThresholds(policy, packageName);

  const coverageDir = path.resolve(
    REPO_ROOT,
    args['coverage-dir'] ?? path.join(entry.path ?? packageName, 'coverage')
  );

  const report = readJsonSummary(coverageDir) ?? readLcov(coverageDir);

  const lines = [];
  const emit = (text) => lines.push(text);

  if (!report) {
    emit(`### ❌ ${packageName}`);
    emit('');
    emit(
      `No coverage report was found in \`${path.relative(REPO_ROOT, coverageDir)}\`. ` +
        'The test run either failed before writing coverage or is not configured to emit it.'
    );
    writeOutputs(args, lines.join('\n'));
    console.error(`::error title=Coverage missing::No coverage report for ${packageName}`);
    process.exit(args.warnOnly ? 0 : 1);
  }

  const failures = [];
  emit(`### ${packageName}`);
  emit('');
  emit('| Metric | Coverage | Minimum | Status |');
  emit('|--------|----------|---------|--------|');

  for (const metric of METRICS) {
    const actual = round(report.actual[metric]);
    const minimum = thresholds[metric];
    const passed = actual >= minimum;
    if (!passed) failures.push({ metric, actual, minimum });
    emit(`| ${metric} | ${actual}% | ${minimum}% | ${passed ? '✅' : '❌'} |`);
  }

  emit('');

  if (failures.length > 0) {
    emit(
      `❌ **Below the required minimum.** ${failures
        .map((f) => `${f.metric} ${f.actual}% < ${f.minimum}%`)
        .join(', ')}`
    );
  } else {
    emit('✅ **All coverage minimums met.**');
  }

  const body = lines.join('\n');
  writeOutputs(args, body);
  console.log(body);
  console.log(`\nReport source: ${report.source}`);

  if (failures.length === 0) return;

  for (const failure of failures) {
    console.error(
      `::error title=Coverage below minimum::${packageName} ${failure.metric} coverage is ` +
        `${failure.actual}% but the minimum is ${failure.minimum}%`
    );
  }

  if (args.warnOnly) {
    console.error('Running with --warn-only, not failing the build.');
    return;
  }
  process.exit(1);
}

function writeOutputs(args, body) {
  if (args['summary-out']) {
    fs.mkdirSync(path.dirname(path.resolve(args['summary-out'])), { recursive: true });
    fs.writeFileSync(path.resolve(args['summary-out']), `${body}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(`::error title=Coverage check failed::${error.message}`);
  process.exit(2);
}
