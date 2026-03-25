# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build (outputs to /dist)
npm run preview      # Preview production build locally
npm test             # Run Jest test suite
npm run test:watch   # Jest in watch mode
npm run test:coverage # Jest with coverage report
```

Run a single test file:
```bash
npx jest src/__tests__/App.test.jsx
npx jest --testNamePattern="search"  # Filter by test name
```

Deploy:
```bash
npm run deploy:staging     # Build + deploy to staging branch
npm run deploy:production  # Build + deploy to main branch
```

## Architecture

**Seasoned** is a recipe omnibox web app — users can search, clip (from URLs), and AI-generate recipes. It's a React SPA deployed on Cloudflare Pages, with four separate Cloudflare Workers as backends.

### Frontend (this repo)
- **React 18** with Vite 7 — no router, state-based conditional rendering
- Entry: `index.html` → `src/main.jsx` → `src/App.jsx`
- `App.jsx` (~900 lines) is the central orchestrator: manages all state, API calls, and determines actions from user input (search vs. clip vs. generate based on whether input is a URL)
- `RecipeCard.jsx` — displays a recipe with save/elevate actions
- `GeneratingCard.jsx` — animated loading state during AI generation

### Backend Workers (external)
Four separate Cloudflare Worker endpoints configured via Vite env vars:
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Save and fetch recipes (`POST /save`, `GET /api/recipes/:id`) |
| `VITE_SEARCH_DB_URL` | Search (`GET /api/search?q=...&type=recipe`) |
| `VITE_CLIPPER_API_URL` | Clip recipes from URLs (`POST /clip`) |
| `VITE_RECIPE_GENERATION_URL` | AI recipe generation (`POST /generate`) |

Dev uses `.env.development` (staging workers); production uses `.env.production`.

### Key Patterns
- **No external state management** — all state in App via `useState`
- **Debounced search** — 300ms delay via custom `useDebounce` hook
- **URL detection** — `isValidUrl()` switches button action between Search and Clip
- **Recipe elevation** — re-generates a recipe using its existing ingredients
- **409 = success** — duplicate save returns 409 conflict, treated as non-error
- **Field normalization** — API responses use inconsistent field names (name/title, prepTime/prep_time); App.jsx normalizes them

### Testing
Tests use Jest + React Testing Library with mocked `fetch`. The custom Babel plugin `babel-plugin-transform-import-meta.js` transforms `import.meta.env` → `process.env` for Jest compatibility (Vite handles this natively in builds).

Test helpers defined in `src/__tests__/App.test.jsx`: `setInputValue()`, `pressEnter()`, `mockFetchOk()`, `mockFetchFail()`.
