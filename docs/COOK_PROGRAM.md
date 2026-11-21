# Cook Program v1

Cook Program v1 is a deterministic compiler that converts recipe instruction prose into a conservative, linear script. It is a cook-facing script, not a process graph, an appliance-control API, or a food-safety certification. The recipe text remains authoritative; the compiler never asks a model to invent control actions, durations, temperatures, or safety guidance.

The shared implementation is `shared/cook-program.js`:

- `compileCookProgram(instructions, options)` compiles a method without network calls.
- `validateCookProgram(program)` checks the program shape and its execution constraints without repairing it.
- `withCookProgramFeature(recipe, envOrValue)` applies the rollout flag and returns count-only telemetry.

## Rollout behavior

The worker flag is `COOK_PROGRAM_V1` (also accepted as `cook_program_v1` by the shared helper). It is off by default.

| Mode | Behavior |
| --- | --- |
| `off` (default) | A stale `cookProgram` is removed from the returned recipe. No compilation occurs. |
| `shadow` | Compile and return counts/reason codes only; do not attach `cookProgram`. Logs must not include recipe or step text. |
| `on` | Attach the validated `cookProgram` object to generate, adapt, and clip results. |

Programs with no method are `abstained`. If any source clause cannot be compiled, the program is `partial`; unsupported prose is preserved in `uncompiled`, never guessed into a library action. A program is `compiled` only when all method clauses are represented by validated actions.

## Program shape

```json
{
  "modelId": "cook-program-v1",
  "status": "compiled",
  "source": "instructions",
  "steps": [
    {
      "id": "s0",
      "sourceIndex": 0,
      "clauseIndex": 0,
      "kind": "continuous",
      "action": {
        "verb": "heat",
        "arguments": { "target": "pan", "level": "medium", "setpoint": null }
      },
      "until": { "observable": "shimmering", "cue": "until the oil shimmers" },
      "maxDurationSec": null,
      "durationSource": "absent",
      "range": false,
      "requiresConfirm": true,
      "ingredientIndexes": [],
      "uncompiledSpans": []
    }
  ],
  "uncompiled": []
}
```

`sourceIndex` points back to the original instruction. `clauseIndex` identifies a clause when a source instruction was split at a sentence boundary, semicolon, or `, and` boundary. `ingredientIndexes` refers only to supplied ingredient entities whose names occur as whole tokens; the compiler does not parse or invent ingredient entities.

## Action library

The v1 library is closed. Unsupported actions are not mapped to the nearest supported action.

| Verb | Kind | Confirmation |
| --- | --- | --- |
| `heat` | continuous | Confirm to start |
| `simmer` | continuous | Confirm to start |
| `boil` | continuous | Confirm to start |
| `saute` | continuous | Confirm to start |
| `stir` | continuous | No start confirmation when an `until` cue is present; otherwise confirm |
| `bake` | continuous | Confirm to start |
| `rest` | continuous | Confirm to start |
| `add` | instantaneous | Confirm |
| `season` | instantaneous | Confirm |
| `transfer` | instantaneous | Confirm |
| `mix` | instantaneous | Confirm |
| `hold` | instantaneous | Confirm; copy an existing process-safety note when the safety summary flags that source step |

## Observable cues and stop conditions

The closed `until` observable vocabulary is `golden`, `browned`, `fragrant`, `soft`, `tender`, `fork_tender`, `shimmering`, `simmering`, `boiling`, `reduced`, `thickened`, `set`, `translucent`, `wilted`, and `crisp`. The stored cue copies the source text from `until` through the matched observable.

A continuous action must have an observable cue, an explicit duration, or both. The duration is a **ceiling**, not an automatic claim that the food is done. It is parsed only when written in the source text using the Navigator's existing seconds/minutes/hours vocabulary. A range uses its upper end and sets `range: true`; no duration stays `null` with `durationSource: "absent"`. Zero, non-finite, and durations longer than eight hours are uncompiled rather than silently corrected.

Instantaneous actions wait for the cook to confirm. A timer or vision-assist result must not auto-advance the program. The cook is the sensor.

## Compiler boundaries

- Sentence boundaries are split. `;` and `, and` split only when both sides contain a supported action.
- A clause containing multiple supported actions is uncompiled; no action is silently hidden in a compound step.
- A clause without a supported action is uncompiled (`verb_not_in_library`).
- Continuous actions without a cue or explicit duration are uncompiled (`no_stop_condition`).
- The compiler copies explicit `low`, `medium`, or `high` heat settings and explicit degree setpoints; absent values remain null.
- It does not build or replace the process graph, infer allergen safety, author preservation schedules, or apply clinical diet personalization. Existing safety gates remain authoritative.
- Shadow telemetry contains only status, step counts, and uncompiled reason counts. Never log step text.

The pure compiler and worker attachment are the first implementation slice of issue #646. Navigator rendering, time-ceiling prompts, and session execution UX remain separate work; this implementation does not claim that the full issue acceptance criteria are complete.
