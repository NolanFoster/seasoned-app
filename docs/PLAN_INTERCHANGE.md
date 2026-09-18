# Seasoned portable week plans (`PlanInterchangeV1`)

Seasoned can exchange a meal plan and its grocery sidecar without connecting to
another service or scraping an account. Imports are **user-provided files or
pasted text only**. The interchange layer deliberately reports lossy mappings
and re-checks imported ingredients against the signed-in kitchen profile before
an import can replace the current plan.

## Formats

### `seasoned-week.json` (canonical)

The canonical format is versioned and safe to extend:

```json
{
  "schema": "https://seasoned.app/schemas/seasoned-week.json",
  "version": 1,
  "exportedAt": "2026-09-14T12:00:00.000Z",
  "weekStart": "2026-10-05",
  "source": { "app": "Seasoned", "format": "seasoned-week.json" },
  "meals": [
    {
      "id": "recipe-1",
      "recipeId": "recipe-1",
      "date": "2026-10-05",
      "slot": "dinner",
      "title": "Lemon chicken",
      "servings": 2,
      "ingredients": [
        { "name": "chicken thighs", "quantity": "2", "unit": "pieces" }
      ],
      "notes": "Use the zest before juicing."
    }
  ],
  "staged": [],
  "grocery": { "items": [] }
}
```

Dates are ISO calendar dates (`YYYY-MM-DD`) and slots are `breakfast`, `lunch`,
`dinner`, or `snack`. `staged` is the exported Up Next queue. The grocery
sidecar is optional and is never used to silently alter recipe ingredients.
Unknown JSON fields are ignored so future versions can add metadata safely.

### CSV template

The first row is:

```text
date,slot,title,servings,ingredients,notes,recipe_id
```

`ingredients` is a semicolon-separated, human-editable blob. Each item may be
`quantity unit name`; when an exact split is not possible, the entire item is
kept as the ingredient name. Unknown columns are ignored and called out in the
mapping report. Rows with `slot=up_next` are placed in Up Next and may leave
the date blank.

### schema.org Recipe `ItemList`

A schema.org `ItemList` containing `Recipe` items is accepted and can be
exported. Seasoned adds `date` and `mealType` to each Recipe item because
schema.org does not define a meal-week slot. A Recipe without a date is shown as
skipped rather than being silently placed on today.

### Cooklang bundle

The best-effort text adapter uses ordinary Markdown/Cooklang-friendly lines and
namespaced metadata directives:

```text
>> date: 2026-10-05
>> slot: dinner
>> servings: 2
# Lemon chicken
- 2 pieces chicken thighs
> Use the zest before juicing.
```

Cooklang readers can ignore the `>>` directives. Seasoned uses them to retain
the date and slot during round trips.

## Import safety and mapping reports

`parsePlanInterchange(input, { hardAllergens })` returns the candidate plan plus
`report`:

- `mapped`: rows imported without a lossy default
- `partial`: rows imported with a reason, such as an unknown slot defaulted to
  dinner
- `skipped`: rows missing a date or title, with a reason
- `warnings`: ignored columns, unfamiliar schemas, and review notices
- `blocked`: recipe rows containing a configured hard allergen
- `constraintValidation.canCommit`: false when a hard-allergen conflict exists

A UI must preview this report and must not replace the existing plan when
`canCommit` is false. Ambiguous ingredient terms are surfaced as
`needsReview`; they should be checked before cooking. This is a conservative
safety check, not a medical guarantee: users must verify packaging and
cross-contact information themselves.

## Privacy and Mealime window

Imports are local until the user commits them to the existing Seasoned planner
sync path. The adapter does not authenticate to, scrape, or request credentials
from Mealime, Yummly, or another provider. Users should export only files they
are entitled to use, and should remove sensitive household notes before sharing
an interchange file.

Mealime's announced shutdown window is **21 October 2026**. Deadline copy in
the product should be treated as time-sensitive and removed or revised after
that date; the portable format itself has no provider-specific dependency.

## Implementation contract

The pure implementation lives in [`shared/plan-interchange.js`](../shared/plan-interchange.js)
and is exported as `recipe-app-shared/plan-interchange`. Keep parsing and
serialization free of browser APIs so worker-side validation and fixture tests
can use the same code. The planner UI is feature flagged with
`plan_migration_v1`; flag-off leaves the existing planner unchanged.
