# Quality evaluation baseline

The offline quality suite is intentionally deterministic so prompt and model
changes can be compared without sending recipe data to an external judge.

Baseline recorded for the initial implementation:

| Suite | Cases | Passing | Score target |
| --- | ---: | ---: | ---: |
| Constraint matrix (10 dishes × 5 packs) | 50 | 50 | ≥95/100 |
| Catastrophic empty-output regressions | 2 | 2 blocked | Must block |

Run it with:

```sh
npm run test:eval
```

The matrix exercises vegetarian, time-budget, skill-level, equipment, and
serving constraints. It checks schema-level completeness, ingredient-to-step
coverage, and timing consistency. It is not an LLM-as-judge and should be
paired with human review before changing a production model.
