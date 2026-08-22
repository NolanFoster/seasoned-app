# Pantry photo scan

Pantry photo scan is the optional `pantry-scan` slice of the pantry feature. It
turns a fridge, freezer, or pantry photo into **reviewable candidates**; it does
not write inventory automatically.

## Flow

1. Enable the `pantry-scan` Flaggly flag for the intended cohort.
2. Open **My pantry** and choose **Scan a fridge or pantry photo**.
3. Select or capture a JPG, PNG, or WebP image no larger than 10 MB.
4. The authenticated client sends the image as `multipart/form-data` to
   `POST /me/pantry-scan`.
5. Workers AI (`@cf/llava-hf/llava-1.5-7b-hf`) returns candidate food items.
6. The cook edits names, quantities, and locations, deselects false positives,
   and explicitly chooses **Add selected items**.
7. Selected items are saved through the existing authenticated pantry CRUD API.

Every returned candidate has `needsReview: true` and a confidence estimate.
Confidence is a signal for review, not a safety or freshness guarantee.

## Privacy and safety

- The user-management worker does not store the uploaded photo, model response,
  or image metadata. The image is passed to Workers AI for the request and then
  discarded.
- No expiration date or allergen is inferred by the prompt. Users must verify
  labels, allergens, cross-contact, and quantities before cooking.
- The scan endpoint is scoped by the same JWT middleware as `/me/pantry-items`.
  It never accepts a user id from the request body.
- If the AI binding is missing, the endpoint returns a setup error rather than
  pretending that a scan succeeded.
- The feature remains unavailable until both the UI flag (`pantry-scan`) and
  the worker's optional `PANTRY_SCAN_ENABLED` switch allow it.

## Model output contract

The model is prompted to return:

```json
{
  "items": [
    {
      "name": "spinach",
      "quantity": 2,
      "unit": "bags",
      "location": "fridge",
      "confidence": 0.85
    }
  ]
}
```

The worker parses fenced or lightly wrapped JSON, drops malformed candidates,
normalizes locations and quantities, deduplicates names within a location, and
caps a response at 50 items. Unknown locations become `other`. The client
always renders the candidates in editable controls before persistence.

## Deployment

The user-management worker has an `AI` binding in `wrangler.toml` for preview,
staging, and production. Deploy the worker after applying the existing pantry
migration, then create the `pantry-scan` Flaggly flag with a conservative
rollout. The route can be disabled immediately with
`PANTRY_SCAN_ENABLED=false` without changing the database schema.
