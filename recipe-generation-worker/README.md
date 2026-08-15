# Recipe Generation Worker

## Generative quality bar

Generated and adapted recipes are checked by the deterministic quality rules
engine in `src/quality-bar.js` before they are returned. Empty ingredient or
instruction lists are blocked; ingredient-step coverage, timing consistency,
and allergen review are returned as quality signals rather than hidden model
claims. Recipes also carry display-safe `qualityBar` and `provenance` metadata
(the provenance contract includes similar recipe IDs only, never retrieved
recipe payloads).

The offline regression suite contains 50 curated constraint combinations and
can be run without Cloudflare bindings or model credentials:

```sh
npm run test:eval
```

See [`tests/evals/BASELINE.md`](tests/evals/BASELINE.md) for the recorded
baseline and evaluation limitations.
