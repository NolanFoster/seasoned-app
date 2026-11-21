# Pantry ledger (PantryLedgerV1)

Seasoned treats pantry quantity as a user-confirmed, append-only ledger rather
than a silent side effect of cooking. Receipt/photo/CSA intake remains an
inflow path; cook completion and waste are outflow paths.

## Cook completion flow

1. `CookingNavigator` derives a conservative depletion proposal from recipe
   ingredients and the current non-expired pantry snapshot.
2. With the `pantry_ledger_v1` flag enabled, the app sends the proposal to
   `POST /me/pantry-ledger/propose`. This is read-only and verifies that every
   referenced item still belongs to the signed-in user.
3. The cook reviews each line. They can keep the suggested remainder, remove
   an item, or skip it. Unknown quantities default to an explicit remove choice;
   the app never invents a numeric quantity.
4. Confirmation sends `POST /me/pantry-ledger/confirm`. The worker checks the
   expected quantity, appends one `debit_cook` event, and materializes the
   confirmed quantities in `pantry_items` in one D1 batch.
5. A `cookSessionId` makes retries idempotent. If the same cook is submitted
   twice, the existing event is returned and pantry quantities are not debited
   twice.

The event lines retain the normalized ingredient name, pantry item id, consumed
quantity/unit, confidence, action, expected quantity, and confirmed remainder.
`GET /me/pantry-ledger` exposes the private audit stream for export and support.

## Staples policy

`shared/pantry-planning.js` skips `salt`, `water`, `ice`, and `pepper` by default.
These are kitchen supplies, not measured inventory for most households. A
caller that deliberately tracks one can pass it through `trackedStaples`.
Measured recipe requirements are scaled when a caller supplies servings cooked
and a recipe yield. Unit conversion is conservative; incompatible units are
not silently combined.

## Waste and conflict safety

Expired items can be marked **Mark wasted** in the pantry sheet when the ledger
flag is enabled. This records a `debit_waste` event through
`POST /me/pantry-ledger/waste` before removing the materialized row.

The worker fails closed when an item is missing, its quantity changed since the
proposal, or a requested remainder would increase stock. The UI surfaces the
conflict and leaves the item untouched so a cook can refresh and review again.
All routes are JWT-scoped to the authenticated user; no client-supplied user id
is accepted.

## Rollout and migrations

- Frontend flag: `pantry_ledger_v1` (default **off**).
- Worker kill switch: `PANTRY_LEDGER_ENABLED=false` returns 404 for ledger
  routes; the additive API is enabled by default in configured environments.
- Apply `user-management-worker/migrations/007_add_pantry_ledger.sql` after the
  pantry item migration.
- Existing pantry-planner behavior remains available while the flag is off;
  enabling the flag switches cook completion to the ledger proposal/confirm
  path without changing intake APIs.

The ledger is household-private and contains sensitive food inventory history.
Do not use its contents for model training or analytics without explicit
consent. No quantity is treated as gram-accurate without a scale.
