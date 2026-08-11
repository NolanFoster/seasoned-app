# Code Coverage

Coverage is a blocking condition on pull requests. A pull request that drops a
package below its minimum fails CI and cannot merge once branch protection is
configured (see [Branch protection](#branch-protection)).

## Where the numbers live

[`.github/coverage-thresholds.json`](../.github/coverage-thresholds.json) is the
single source of truth. Nothing else hardcodes a percentage.

It is read by three consumers, so local runs and CI always agree:

| Consumer | What it does |
|---|---|
| Each package's `vitest.config.js` / `jest.config.js` | Fails `npm run test:coverage` locally and in CI |
| `scripts/check-coverage.mjs` | Re-checks the emitted report in CI and renders the PR table |
| `scripts/check-threshold-ratchet.mjs` | Fails any pull request that lowers a minimum |

## Current minimums

`defaults` applies to every package: **80%** lines, statements and functions,
**70%** branches. Packages below that carry an explicit override and a `note`
explaining why — those are test debt to pay down, not a permanent allowance.

| Package | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| ai-image-generation-worker | 85 | 85 | 80 | 80 |
| auth-worker | 80 | 80 | 95 | 75 |
| clipper | 65 | 65 | 90 | 60 |
| recipe-app | 60 | 60 | 60 | 50 |
| recipe-embedding-worker | 95 | 95 | 95 | 90 |
| recipe-feeder | 85 | 85 | 90 | 85 |
| recipe-generation-worker | 85 | 85 | 90 | 70 |
| recipe-recommendation-worker | 80 | 80 | 90 | 75 |
| recipe-save-worker | 80 | 80 | 95 | 75 |
| recipe-view-worker | 95 | 95 | 95 | 85 |
| shared | 40 | 40 | 85 | 75 |
| user-management-worker | 25 | 25 | 45 | 40 |

These were set by measuring each package and rounding down, so the gate is green
on the tree it was introduced against while still catching regressions.

**New code is held higher.** Lines added or changed by a pull request must be
**85%** covered (`newCode.threshold`), enforced by `diff-cover` in
`frontend-tests.yml`. This is what pulls the packages above back toward the
default over time.

## Running coverage locally

```bash
cd <package>
npm run test:coverage
```

That is the exact command CI runs, and it fails on the same numbers. An HTML
report is written to `<package>/coverage/index.html`.

## Raising a minimum

Improve the tests, then raise the number in
`.github/coverage-thresholds.json`. Nothing else needs to change.

## Lowering a minimum

Minimums are a ratchet — `scripts/check-threshold-ratchet.mjs` fails any pull
request that lowers one, removes a package from the policy, or weakens the
repository-wide `newCode.threshold`.

If lowering one is genuinely correct (a package shed a well-tested module, say),
add the package name to `allowThresholdDecrease` in a standalone pull request
that explains why, and remove it again afterwards. To lower the new-code
minimum, use the reserved name `newCode` in that same list.

## Adding a package to the gate

1. Give it a `test:coverage` script that writes a `json-summary` report to
   `<package>/coverage/`.
2. Add an entry under `packages` in `.github/coverage-thresholds.json` with its
   `path`, and `dependsOn: ["shared"]` if it imports from `shared/`.
3. Point its test config at `thresholdsFor('<package>')` from
   `scripts/coverage-thresholds.mjs` so local runs enforce the same numbers.

## How the gate works

`.github/workflows/code-coverage.yml` runs on every pull request. It
deliberately has **no `paths:` filter** — a workflow skipped by a path filter
never reports a status, so a required check that used one would block every
unrelated pull request forever.

Instead it picks its matrix at runtime:

- `scripts/affected-packages.mjs` diffs against the base branch and selects only
  the packages the change can reach. Touching `shared/` selects every package
  that depends on it; touching the coverage tooling selects everything.
- Each selected package runs in parallel, uploads its report, and is checked
  against the policy.
- The **Coverage Gate** job always runs, posts one consolidated PR comment, and
  fails if any package missed its minimum.

A pull request touching no gated package gets a green gate saying so.

## What is not gated, and why

Two packages are outside the gate. Both have "tests" that reach out over the
network rather than importing modules, so they measure no in-process coverage
and cannot be made blocking as they stand. Both run in CI for signal only, under
`continue-on-error`, with the reason stated in their workflow.

**`recipe-search-db`** — `test-search-db.js` sends HTTP requests to a *deployed*
worker. In CI no such deployment is reachable, so it currently reports 13/13
failed; it also exits 0 regardless of results. Bringing it in requires unit tests
against the query builders with D1 stubbed.

**`crawler`** — its only test fetches a live third-party recipe site, so an
outage there would otherwise fail every pull request. (Its workflow also used to
look for `test_crawler.py`, which does not exist, so the tests never ran at all.)
Bringing it in requires offline unit tests with recorded fixtures, then
`pytest --cov=. --cov-fail-under=<minimum>` and an entry in the policy file.

### Known failure surfaced by this work

`shared`'s legacy `npm test` (`test-simple.js`) crashes after its own summary
prints: it round-trips `compressData(undefined)`, and `decompressData` throws
`Unexpected end of JSON input` because `JSON.stringify(undefined)` yields no
bytes to parse back. A `|| echo` in the workflow had been hiding this.

It runs `continue-on-error` for now. `shared` is still gated — through its vitest
suite (`npm run test:coverage`), which passes. Fix the round-trip in
`shared/kv-storage.js` and drop the `continue-on-error`.

## Branch protection

The checks above only block merges once they are required. On the `main` and
`staging` branches, add these as required status checks:

- **`Coverage Gate`** — the aggregate gate. This is the important one; it covers
  all twelve gated packages and always reports.
- **`Frontend Tests and Coverage`** — enforces the 85% new-code threshold.

Do **not** require the individual `Coverage (<package>)` jobs: they are matrix
legs that only exist when that package is affected, so requiring them would
block unrelated pull requests.
