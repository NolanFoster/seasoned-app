# CSA, Farmers Market & Mystery-Box Produce Intake (Wave 19 #535)

## 1. Problem Statement
Weekly CSA shares, farmers market hauls, and mystery grocery boxes represent an irregular supply dump of unfamiliar, perishable produce (e.g. kohlrabi, garlic scapes, Swiss chard). Subscribers frequently experience food waste due to uncertainty about produce identification, storage methods, and recipe utilization.

## 2. ProduceBoxIntakeV1 Pipeline
1. **Raw List Parsing**: Strips leading enumerations, units, and bullet characters, converting text strings into produce objects.
2. **Shelf-Life & Storage Heuristics**: Automatically matches identified produce against storage guidelines (e.g. crisper drawer, room temperature stem-down, jar with water) and assigns estimated shelf-life days.
3. **Pantry & Plan Cascade**: Allows users to import box produce directly into their inventory and calculates box coverage scores for candidate recipes.

## 3. Safety & Boundaries
- Uncertain produce names receive conservative 4-day shelf life hints.
- Allergen verification remains fail-closed across all generation prompts.
