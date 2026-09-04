# Kitchen Workflow Agent V1

The Kitchen Workflow Agent turns a multi-day cooking goal into a durable,
inspectable workflow. It is deliberately a small state machine in the recipe
generation worker, not an unbounded chat prompt. The V1 APIs are disabled unless
`KITCHEN_WORKFLOW_V1` is explicitly set to `true`, `1`, `on`, or `enabled`.

## State machine

```text
clarify_goal
    |
    v
retrieve_pantry --> draft_plan --> validate_safety --> propose_plan
                                                       |
                         +-----------------------------+----------------+
                         |                                              |
                    repair_plan                                      approve_plan
                         |                                              |
                  retry or cancel                                build_grocery
                                                                        |
                                                                    await_shop
                                                                        |
                                                                  grocery_done
                                                                        |
                                                                 optional_prep
                                                               prep_done / skip
                                                                        |
                                                                 ready_to_cook
                                                                        |
                                                                start_cooking
                                                                        |
                                                                    complete
```

`propose_plan` and every later user decision are persisted as an interrupt.
The plan is only a draft until the client resumes with `approve_plan`; no
planner or grocery account write is performed by this worker. The existing
meal-plan and grocery handlers remain the typed, safety-gated draft producers.

## API

All endpoints return JSON and require `Content-Type: application/json` for POST
requests. The caller should pass the authenticated account subject in
`X-User-Id`. `userId` or `ownerId` in the JSON body/query is supported for local
and service-to-service calls. The identity is used in the KV key, and a caller
cannot load another account's workflow by supplying a different identity.

### Start a workflow

```http
POST /agent/workflow/start
X-User-Id: user_123
Content-Type: application/json
```

```json
{
  "type": "week_plan",
  "goal": "Plan three dinners under 40 minutes using pantry vegetables",
  "slots": [
    "2026-09-07::dinner",
    "2026-09-08::dinner",
    "2026-09-09::dinner"
  ],
  "culinaryProfile": {
    "hard_allergens": ["peanuts"],
    "default_servings": 4
  },
  "overrides": { "maxCookTime": 40 },
  "usePantry": true,
  "pantryIngredients": [
    { "name": "carrots", "quantity": 4, "unit": "piece" }
  ]
}
```

A successful start returns `201`-style workflow data with `status:
"awaiting_user"`, a `workflowId`, stable `traceId`, the generated `planDraft`,
and a `pendingInterrupt` of type `approve_plan`. (The current implementation
uses HTTP 200 for compatibility with the other worker handlers.) If generation
fails a safety or quality gate, the workflow remains durable with a
`repair_plan` interrupt and an actionable reason; it never silently applies the
failed draft.

If `slots` is omitted, a `week_plan` defaults to three upcoming dinner slots
and `dinner_tonight` defaults to one upcoming dinner slot. Explicit slots must
use `YYYY-MM-DD::breakfast|lunch|dinner|snack` and are limited to 28 entries by
the downstream fill handler.

### Inspect a workflow

```http
GET /agent/workflow/kwf_<id>
X-User-Id: user_123
```

The response includes the current status, state node, checkpoints, pending
interrupt, audit events, and the stable trace ID. Recipe and grocery drafts are
kept in the state so a later resume does not require regenerating them.

### Resume a workflow

```http
POST /agent/workflow/kwf_<id>/resume
X-User-Id: user_123
Content-Type: application/json
```

Approve the plan and build a grocery **draft**:

```json
{ "action": "approve_plan" }
```

Edit constraints and regenerate before approval:

```json
{
  "action": "edit_plan",
  "overrides": { "dietary": ["vegetarian"], "maxCookTime": 30 }
}
```

Continue after shopping, then optional prep and cooking:

```json
{ "action": "grocery_done" }
{ "action": "prep_done" }
{ "action": "start_cooking" }
```

`skip_prep` is accepted in place of `prep_done`. `retry_plan` is accepted for a
`repair_plan` interrupt. A maximum of two draft attempts is allowed; a second
failure changes the workflow to `failed` with the safety/quality reason.

Clients may send `expectedVersion` to reject an old tab or device instead of
allowing it to resume over a newer checkpoint:

```json
{ "action": "approve_plan", "expectedVersion": 3 }
```

### Cancel a workflow

```http
POST /agent/workflow/kwf_<id>/cancel
X-User-Id: user_123
Content-Type: application/json
```

```json
{ "reason": "plans changed" }
```

Cancellation is idempotent in spirit and leaves the audit trail intact. A
resume request can also use `{ "action": "cancel" }`.

## Interrupt catalog

| Interrupt | Meaning | Allowed actions |
| --- | --- | --- |
| `approve_plan` | A safe plan draft is waiting for explicit confirmation. | `approve_plan`, `edit_plan`, `cancel` |
| `repair_plan` | Generation returned a safety, quality, or upstream failure. | `retry_plan`, `cancel` |
| `grocery_done` | A grocery draft exists; wait until the user shops. | `grocery_done`, `cancel` |
| `prep_done` | Shopping is complete; optional prep can be recorded. | `prep_done`, `skip_prep`, `cancel` |
| `ready_to_cook` | The workflow can hand off to a cooking session. | `start_cooking`, `cancel` |

## Persistence, retention, and security

- Workflows are stored in the existing `RECIPE_STORAGE` KV namespace under
  `kitchen-workflow:v1:<encoded-user-id>:<encoded-workflow-id>`.
- KV expiration is 30 days. The record also carries `expiresAt`, which is
  checked on reads so expired records are not resurrected by a cache.
- A local in-memory fallback is used only when no KV binding exists, which makes
  unit tests and local development useful but is not durable across isolates.
- Audit events are bounded to the latest 100 entries and checkpoints to the
  latest 30. Free-form goal text is truncated to 500 characters; this is not a
  place to store secrets or sensitive notes.
- The worker does not directly write a meal plan, grocery account, retailer
  cart, or purchase. `approve_plan` is recorded before the grocery draft step,
  and future mutating integrations must require the same recorded interrupt
  acknowledgement.
- The API assumes an authenticated gateway supplies `X-User-Id`; this worker
  validates and scopes the value but cannot validate a JWT itself. Production
  deployments must not allow clients to forge that header around the gateway.
- The agent never controls an appliance, auto-purchases groceries, provides
  medical advice, or claims allergen/pathogen clearance. Existing allergen and
  process-safety gates remain authoritative.
- `traceId` is generated once and remains stable through resume so an
  observability layer can attach the full workflow history to one trace.

## Feature rollout

Set `KITCHEN_WORKFLOW_V1=true` only in an environment that has passed the
security review and golden workflow fixtures. With the flag absent or false,
all four routes return `404` with `FEATURE_DISABLED`, preserving the existing
single-turn `/agent/turn` behavior.
