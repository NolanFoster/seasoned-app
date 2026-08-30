# Anti-Frankenstein Ratio Integrity & Quantity Critic (Wave 18 #529)

## 1. Problem
In large foundation models, recipes often suffer from "Frankenstein stitching": titles, ingredients, and quantities are spliced from disparate source recipes into a superficially fluent output that has never been tested in a kitchen and breaks fundamental culinary ratios (e.g. 2 cans of condensed milk in a key lime pie with zero egg yolks).

## 2. RatioIntegrityV1 Architecture
- **Seed Ratio Bands**: Establishes structural bands for high-risk recipe families:
  - *Citrus Custard Pies*: Requires 3-4 yolks per 14 oz condensed milk for proper coagulation.
  - *Vinaigrettes*: Enforces 2:1 to 3:1 oil-to-acid emulsion boundaries.
  - *Bread Hydration*: Evaluates baker's percentages for flour vs liquid.
- **Deterministic Critic**: Evaluates generated/adapted ingredient lists and returns `{ status: 'pass' | 'needs_review' | 'adjusted' | 'blocked', findings[], suggestedFixes[] }`.
- **UI Transparency**: Adds a `Ratio check` pill directly in the `RecipeProvenance` card section so cooks know quantities follow tested culinary bands.
