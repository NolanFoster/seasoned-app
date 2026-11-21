# Grocery Delivery Substitution & Arrival Reconciliation Loop (Wave 18 #531)

## 1. Problem
Roughly 49% of online grocery orders involve out-of-stock items, where delivery services substitute ingredients for cart fulfillment without regard for household allergen safety, recipe chemistry, or planned meals.

## 2. ArrivalReconciliationV1 Architecture
- **Diff Classification**: `reconcileGroceryArrival` matches ordered vs arrived items into `MATCH`, `SUBSTITUTION`, `MISSING`, and `EXTRA` categories.
- **Fail-Closed Allergen Safety**: Automatically checks all substituted and extra items against household `hardAllergens`. Any detected allergen conflict triggers an alert and blocks one-tap pantry addition.
- **Pantry & Plan Updates**: Safe substitutions directly update pantry inventory quantities and trigger necessary recipe/meal adaptations.
