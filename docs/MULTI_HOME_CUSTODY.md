# Multi-Home / Co-Parent Kitchen Custody Rails (Wave 18 #533)

## 1. Problem
Traditional AI cooking apps assume a single continuous fridge, single pantry inventory, and single grocery schedule. In co-parenting households and dual-residence setups, children alternate homes while inventories and equipment remain distinct.

## 2. MultiHomeV1 Architecture
- **Home Locus Partitioning**: Each kitchen locus (`home-primary`, `home-secondary`, etc.) maintains an isolated pantry inventory partition (`filterPantryByHome`) to prevent cross-home leakage.
- **Custody Calendar Resolution**: `resolveActiveHomeForDate` maps planned meal slots to the active residence based on alternating date rules.
- **Fail-Closed Child Allergens**: Diner allergies and restrictions synchronize across all household homes regardless of which kitchen is active.
- **UI Management**: `MultiHomeCustodyModal` provides quick switching between cooking loci.
