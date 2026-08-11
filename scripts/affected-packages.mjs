#!/usr/bin/env node
/**
 * Decide which packages the coverage gate needs to run for.
 *
 * Running every package's suite on every pull request would make the gate slow
 * enough that people route around it, so we only run the packages a diff can
 * actually affect: the package itself, anything it depends on (`dependsOn` in
 * the policy file), and — when the coverage tooling itself changes — everything.
 *
 * Usage:
 *   node scripts/affected-packages.mjs --base origin/main
 *   node scripts/affected-packages.mjs --all
 *
 * Writes `packages` (a JSON array) and `any` (true/false) to $GITHUB_OUTPUT
 * when running under Actions, and always prints the decision to stdout.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_PATH = path.join(REPO_ROOT, '.github', 'coverage-thresholds.json');

// Touching any of these changes how coverage itself is measured or enforced,
// so the safe answer is to re-run the whole matrix.
const GLOBAL_PATHS = [
  '.github/coverage-thresholds.json',
  '.github/workflows/code-coverage.yml',
  'scripts/check-coverage.mjs',
  'scripts/affected-packages.mjs',
  'scripts/check-threshold-ratchet.mjs',
  // Every package's vitest/jest config imports this helper, so a break in it
  // breaks all of them. Without it here, a change touching only the helper
  // would select no packages and sail through a green gate.
  'scripts/coverage-thresholds.mjs'
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') {
      args.all = true;
    } else if (arg === '--base') {
      args.base = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function changedFiles(base) {
  // Three-dot range: everything on the PR head since it diverged from base,
  // which is the same set GitHub shows in the "Files changed" tab.
  const output = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  return output.split('\n').filter(Boolean);
}

function isUnder(file, dir) {
  const normalized = dir.replace(/\/$/, '');
  return file === normalized || file.startsWith(`${normalized}/`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const allPackages = Object.keys(policy.packages);

  let selected;
  let reason;

  if (args.all || !args.base) {
    selected = allPackages;
    reason = args.all ? 'explicitly requested via --all' : 'no base ref supplied';
  } else {
    const files = changedFiles(args.base);
    const globalChange = files.some((file) => GLOBAL_PATHS.includes(file));

    if (globalChange) {
      selected = allPackages;
      reason = 'coverage tooling or policy changed';
    } else {
      selected = allPackages.filter((name) => {
        const entry = policy.packages[name];
        const watched = [entry.path ?? name, ...(entry.dependsOn ?? [])];
        return files.some((file) => watched.some((dir) => isUnder(file, dir)));
      });
      reason = `${files.length} changed file(s)`;
    }
  }

  // Sort for a stable matrix order so job names don't shuffle between runs.
  selected.sort();

  console.log(`Affected packages (${reason}): ${selected.join(', ') || '(none)'}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `packages=${JSON.stringify(selected)}\nany=${selected.length > 0}\n`
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`::error title=Affected package detection failed::${error.message}`);
  process.exit(1);
}
