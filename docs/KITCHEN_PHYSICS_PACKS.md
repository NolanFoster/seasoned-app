# Seasoning Density & Heat-Source Physics Packs (Wave 18 #532)

## 1. Problem
Traditional AI recipe models do not account for physical kitchen realities:
1. **The Kosher Salt Bug**: Diamond Crystal vs Morton kosher salt differ by ~2× in density by volume (8.5g vs 14.2g per US tbsp). Specifying "1 tbsp kosher salt" without brand context leads to drastically over- or under-seasoned food.
2. **Induction Gap**: Induction burners boil water and heat pans significantly faster than traditional gas or electric coil stoves, rendering naive time-based instructions misleading.

## 2. PhysicsPackV1 Architecture
- **Salt Density Conversions**: `convertSaltMeasurement` dynamically calculates volumetric equivalents and exact gram weights across salt varieties (`diamond_crystal`, `morton_kosher`, `table`, `sea_flake`).
- **Heat Source Multipliers**: `applyHeatSourcePhysics` adapts timing and heat cues for induction, gas, and electric cooktops.
- **Provenance Transparency**: Adds a `Physics` indicator in the recipe card's provenance section to indicate calibrated measurements.
