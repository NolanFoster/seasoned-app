# Multi-Day Living Cook Projects (Wave 19 #537)

## 1. Concept & Problem
Traditional cooking applications structure all tasks as single-session runs (e.g. 30-minute stove cook). Real home cooking includes living biological and chemical workflows that span hours to weeks:
- Sourdough fermentation (autolyse, bulk ferment, folds, overnight cold retard, bake)
- Kimchi, sauerkraut, and lacto-pickles (daily burping, cellar fermentation)
- Yogurt incubation and kombucha F1/F2 brews
- Dry brines and meat curing

## 2. LivingProjectV1 Architecture
A living project comprises:
- `stageGraph`: Ordered list of stages with duration hints (`durationHours`), condition cues (`conditionHints`), instructions, and completed timestamps.
- `activeStageIndex`: Tracks the current state across browser refreshes and mobile reboots.
- `nextCheckInAt`: Wall-clock ISO timestamp for when user action or visual inspection is due.
- `advanceLivingProjectStage`: Pure transition function updating current stage completion and calculating the next check-in window.

## 3. Safety Guidelines & Non-Goals
- **Non-Goals**: Living projects do not provide laboratory-level food pathogen certification or replace certified home-canning protocols. High-risk preservation methods continue to be gated by `food-process-safety.js`.
