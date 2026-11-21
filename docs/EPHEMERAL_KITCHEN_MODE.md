# Ephemeral / Travel Kitchen Mode (Wave 19 #539)

## 1. Problem Statement
When cooks travel to hotels, Airbnbs, RVs, dorms, or stay with family, their active cooking environment diverges radically from their permanent home kitchen profile:
- Limited appliances (hot plate, microwave, kettle only, no oven)
- Micro-pantry (temporary small staples vs fully stocked home spice rack)
- Temporary host allergens (e.g. tree nut allergy at a relative's house)

Inventing 450°F oven roasts or permanently polluting the household profile with temporary guest allergens causes planning and safety friction.

## 2. EphemeralKitchenV1 Architecture
- **Time-Boxed Overlay**: Stores `label`, `startsAt`, `endsAt`, `equipment[]`, and `hostAllergens[]`.
- **Pure Profile Merger**: `mergeEphemeralKitchenOverlay` safely replaces equipment lists and unions host allergens with base hard allergens (fail-closed) while the overlay is active.
- **Auto-Expiration**: Once `endsAt` passes, `mergeEphemeralKitchenOverlay` transparently restores the user's home culinary profile without manual cleanup.
