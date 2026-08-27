import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  isLegacyFormat,
  migrateFromLegacy,
  isValidMealType,
  createEmptyDay,
} from './utils/mealPlanMigration.js';
import {
  StaleWriteError,
  chooseWinner,
  fetchGroceryList,
  fetchMealPlan,
  isGroceryListEmpty,
  isMealPlanEmpty,
  saveGroceryList,
  saveMealPlan,
  storageKey,
} from './utils/mealPlanSync.js';

const USER_MANAGEMENT_URL = import.meta.env.VITE_USER_MANAGEMENT_URL;

// Edits arrive in bursts (a drag reorders two slots, a generated list writes
// forty items), so pushes are coalesced instead of sent per keystroke.
const PUSH_DEBOUNCE_MS = 800;

/**
 * Generates a unique ID for grocery list items.
 * Uses timestamp + random suffix to avoid collisions at user scale.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Loads grocery list items from localStorage for one account scope.
 * Returns empty array if key doesn't exist or data is malformed.
 * @param {string|null} userId - signed-in user id, or null for the guest scope
 * @returns {{ items: Array, updatedAt: number }}
 */
function loadGroceryListFromStorage(userId) {
  try {
    const raw = localStorage.getItem(storageKey('grocery', userId));
    if (!raw) return { items: [], updatedAt: 0 };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.items)) {
      console.warn('mealPlan_groceryList: unexpected shape, resetting to []');
      return { items: [], updatedAt: 0 };
    }
    return { items: data.items, updatedAt: Number(data.updatedAt || 0) };
  } catch (e) {
    console.warn('Failed to load grocery list from localStorage:', e);
    return { items: [], updatedAt: 0 };
  }
}

/**
 * Loads grocery list metadata from localStorage for one account scope.
 * @param {string|null} userId
 * @returns {{ lastGeneratedAt: number|null }}
 */
function loadGroceryMetadataFromStorage(userId) {
  try {
    const raw = localStorage.getItem(storageKey('groceryMeta', userId));
    if (!raw) return { lastGeneratedAt: null };
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load grocery list metadata from localStorage:', e);
    return { lastGeneratedAt: null };
  }
}

const MealPlanContext = createContext();

export function useMealPlan() {
  return useContext(MealPlanContext);
}

/**
 * Loads and deserializes persisted state from localStorage for one account
 * scope. Handles three storage shapes for backward compatibility:
 *   1. New envelope:  { mealPlan: {...}, upNext: [...], updatedAt: 0 }
 *   2. Old direct:    { 'YYYY-MM-DD': { breakfast: [], ... } }  (no upNext)
 *   3. Legacy flat:   { 'YYYY-MM-DD': [recipe, ...] }           (pre-mealType era)
 *
 * @param {string|null} userId - signed-in user id, or null for the guest scope
 * @returns {{ mealPlan: Object, upNext: Array, updatedAt: number }}
 */
function loadFromStorage(userId) {
  const key = storageKey('plan', userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { mealPlan: {}, upNext: [], updatedAt: 0 };
    const parsed = JSON.parse(raw);

    // Shape 1 — new envelope format: { mealPlan, upNext }
    // Detected by the presence of a 'mealPlan' key that is a plain object.
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'mealPlan' in parsed
    ) {
      const planPart = parsed.mealPlan ?? {};
      const upNextPart = Array.isArray(parsed.upNext) ? parsed.upNext : [];
      const updatedAt = Number(parsed.updatedAt || 0);
      if (isLegacyFormat(planPart)) {
        console.info('🔄 Meal plan (inside envelope) migrated from legacy format');
        return { mealPlan: migrateFromLegacy(planPart), upNext: upNextPart, updatedAt };
      }
      return { mealPlan: planPart, upNext: upNextPart, updatedAt };
    }

    // Shape 3 — legacy flat format: date keys map to plain arrays
    if (isLegacyFormat(parsed)) {
      console.info('🔄 Meal plan migrated from legacy format');
      const migrated = migrateFromLegacy(parsed);
      localStorage.setItem(key, JSON.stringify({ mealPlan: migrated, upNext: [], updatedAt: 0 }));
      return { mealPlan: migrated, upNext: [], updatedAt: 0 };
    }

    // Shape 2 — old direct format: mealPlan stored at top level, no upNext
    return { mealPlan: parsed ?? {}, upNext: [], updatedAt: 0 };
  } catch {
    return { mealPlan: {}, upNext: [], updatedAt: 0 };
  }
}

function writePlanToStorage(userId, mealPlan, upNext, updatedAt) {
  try {
    localStorage.setItem(storageKey('plan', userId), JSON.stringify({ mealPlan, upNext, updatedAt }));
  } catch (e) {
    console.error('Failed to save meal plan to localStorage:', e);
  }
}

function writeGroceryToStorage(userId, items, lastGeneratedAt, updatedAt) {
  try {
    localStorage.setItem(storageKey('grocery', userId), JSON.stringify({ items, updatedAt }));
    localStorage.setItem(
      storageKey('groceryMeta', userId),
      JSON.stringify({ lastGeneratedAt, version: '1.0' })
    );
  } catch (e) {
    console.error('Failed to save grocery list to localStorage:', e);
  }
}

function sameIdentity(a, b) {
  return (a?.userId ?? null) === (b?.userId ?? null) && (a?.token ?? null) === (b?.token ?? null);
}

export function MealPlanProvider({ children, apiUrl = USER_MANAGEMENT_URL }) {
  // Who the local cache and every push belongs to. Null means signed out, which
  // keeps the historic guest keys and never talks to the worker.
  const [identity, setIdentityState] = useState(null);
  // Kept current every render: the sliding-expiration token refresh changes the
  // token without changing who is signed in, and that must not re-run a sync.
  const identityRef = useRef(null);
  identityRef.current = identity;
  const scopeRef = useRef(null);

  // One read of the signed-out cache at mount; every later read is scoped to
  // whichever account the provider has been pointed at.
  const initialRef = useRef(null);
  if (initialRef.current === null) {
    initialRef.current = {
      plan: loadFromStorage(null),
      grocery: loadGroceryListFromStorage(null),
      groceryMeta: loadGroceryMetadataFromStorage(null),
    };
  }
  const initial = initialRef.current;

  const [mealPlan, setMealPlan] = useState(() => initial.plan.mealPlan);
  const [upNext, setUpNext] = useState(() => initial.plan.upNext);
  const [activeRecipe, setActiveRecipe] = useState(null);

  // ── Grocery list state ───────────────────────────────────────────────────
  const [groceryList, setGroceryListState] = useState(() => initial.grocery.items);
  const [isGeneratingList, setIsGeneratingList] = useState(false);
  const [listGenerationError, setListGenerationError] = useState(null);
  const [lastListGeneratedAt, setLastListGeneratedAt] = useState(() => initial.groceryMeta.lastGeneratedAt);

  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | error
  const [syncError, setSyncError] = useState(null);

  // Latest values, read by debounced pushes that fire after the render that
  // produced them.
  const planStateRef = useRef({ mealPlan, upNext });
  const groceryStateRef = useRef({ items: groceryList, lastGeneratedAt: lastListGeneratedAt });
  planStateRef.current = { mealPlan, upNext };
  groceryStateRef.current = { items: groceryList, lastGeneratedAt: lastListGeneratedAt };

  // Timestamp of the last local edit, per document. Both the local cache and
  // the worker compare these to decide which copy of a plan is newer.
  const planUpdatedAtRef = useRef(initial.plan.updatedAt);
  const groceryUpdatedAtRef = useRef(initial.grocery.updatedAt);

  // Set while a document's state is being replaced by a copy that did not come
  // from the user, so adopting the server's plan is not mistaken for an edit.
  const adoptingPlanRef = useRef(true);
  const adoptingGroceryRef = useRef(true);
  const planTimerRef = useRef(null);
  const groceryTimerRef = useRef(null);

  const identityUserId = identity?.userId ?? null;
  const syncAvailable = Boolean(apiUrl && identity?.token && identityUserId);

  /**
   * Points the provider at an account, or at null when signed out. Safe to call
   * on every render: an unchanged identity is ignored, so it never re-syncs.
   */
  const setSyncIdentity = useCallback((next) => {
    const normalized = next?.token && next?.userId
      ? { token: String(next.token), userId: String(next.userId) }
      : null;
    setIdentityState((prev) => (sameIdentity(prev, normalized) ? prev : normalized));
  }, []);

  const applyPlanDocument = useCallback((document) => {
    adoptingPlanRef.current = true;
    planUpdatedAtRef.current = Number(document.clientUpdatedAt || 0);
    setMealPlan(document.mealPlan || {});
    setUpNext(document.upNext || []);
  }, []);

  const applyGroceryDocument = useCallback((document) => {
    adoptingGroceryRef.current = true;
    groceryUpdatedAtRef.current = Number(document.clientUpdatedAt || 0);
    setGroceryListState(document.items || []);
    setLastListGeneratedAt(document.lastGeneratedAt ?? null);
  }, []);

  const pushPlan = useCallback(async () => {
    const active = identityRef.current;
    if (!apiUrl || !active) return;
    const { mealPlan: plan, upNext: staged } = planStateRef.current;
    try {
      await saveMealPlan(apiUrl, active.token, {
        mealPlan: plan,
        upNext: staged,
        clientUpdatedAt: planUpdatedAtRef.current,
      });
      setSyncStatus('synced');
      setSyncError(null);
    } catch (error) {
      // A 409 means another device saved something newer; that copy wins and
      // becomes what this device shows rather than being overwritten.
      if (error instanceof StaleWriteError && error.data) {
        applyPlanDocument(error.data);
        writePlanToStorage(scopeRef.current, error.data.mealPlan || {}, error.data.upNext || [], Number(error.data.clientUpdatedAt || 0));
        setSyncStatus('synced');
        setSyncError(null);
        return;
      }
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'Meal plan sync failed');
    }
  }, [apiUrl, applyPlanDocument]);

  const pushGroceryList = useCallback(async () => {
    const active = identityRef.current;
    if (!apiUrl || !active) return;
    const { items, lastGeneratedAt } = groceryStateRef.current;
    try {
      await saveGroceryList(apiUrl, active.token, {
        items,
        lastGeneratedAt,
        clientUpdatedAt: groceryUpdatedAtRef.current,
      });
      setSyncStatus('synced');
      setSyncError(null);
    } catch (error) {
      if (error instanceof StaleWriteError && error.data) {
        applyGroceryDocument(error.data);
        writeGroceryToStorage(scopeRef.current, error.data.items || [], error.data.lastGeneratedAt ?? null, Number(error.data.clientUpdatedAt || 0));
        setSyncStatus('synced');
        setSyncError(null);
        return;
      }
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'Grocery list sync failed');
    }
  }, [apiUrl, applyGroceryDocument]);

  const schedulePlanPush = useCallback(() => {
    if (!apiUrl || !identityRef.current) return;
    if (planTimerRef.current) clearTimeout(planTimerRef.current);
    planTimerRef.current = setTimeout(() => {
      planTimerRef.current = null;
      void pushPlan();
    }, PUSH_DEBOUNCE_MS);
  }, [apiUrl, pushPlan]);

  const scheduleGroceryPush = useCallback(() => {
    if (!apiUrl || !identityRef.current) return;
    if (groceryTimerRef.current) clearTimeout(groceryTimerRef.current);
    groceryTimerRef.current = setTimeout(() => {
      groceryTimerRef.current = null;
      void pushGroceryList();
    }, PUSH_DEBOUNCE_MS);
  }, [apiUrl, pushGroceryList]);

  // Hydration: runs on sign-in, on sign-out, and on a switch between accounts.
  // Declared before the persistence effects so the storage scope is already
  // pointing at the new account when they run.
  useEffect(() => {
    const userId = identityUserId;
    scopeRef.current = userId;

    // A push queued for the previous account must not fire against this one.
    if (planTimerRef.current) {
      clearTimeout(planTimerRef.current);
      planTimerRef.current = null;
    }
    if (groceryTimerRef.current) {
      clearTimeout(groceryTimerRef.current);
      groceryTimerRef.current = null;
    }

    // Load this account's cached copy first so the planner paints immediately
    // rather than flashing an empty week while the request is in flight.
    const cachedPlan = loadFromStorage(userId);
    const cachedGrocery = loadGroceryListFromStorage(userId);
    const cachedMeta = loadGroceryMetadataFromStorage(userId);
    // A first sign-in has no per-user cache yet, so the plan the person just
    // built as a guest is carried into their account instead of vanishing.
    const guestPlan = userId ? loadFromStorage(null) : null;
    const guestGrocery = userId ? loadGroceryListFromStorage(null) : null;
    const localPlan = guestPlan && isMealPlanEmpty(cachedPlan.mealPlan, cachedPlan.upNext) && !isMealPlanEmpty(guestPlan.mealPlan, guestPlan.upNext)
      ? guestPlan
      : cachedPlan;
    const localGrocery = guestGrocery && isGroceryListEmpty(cachedGrocery.items) && !isGroceryListEmpty(guestGrocery.items)
      ? { ...guestGrocery, lastGeneratedAt: loadGroceryMetadataFromStorage(null).lastGeneratedAt }
      : { ...cachedGrocery, lastGeneratedAt: cachedMeta.lastGeneratedAt };

    applyPlanDocument({ mealPlan: localPlan.mealPlan, upNext: localPlan.upNext, clientUpdatedAt: localPlan.updatedAt });
    applyGroceryDocument({
      items: localGrocery.items,
      lastGeneratedAt: localGrocery.lastGeneratedAt ?? null,
      clientUpdatedAt: localGrocery.updatedAt,
    });

    if (!apiUrl || !userId) {
      setSyncStatus('idle');
      setSyncError(null);
      return undefined;
    }

    let cancelled = false;
    setSyncStatus('syncing');
    setSyncError(null);

    (async () => {
      try {
        const token = identityRef.current?.token;
        const [remotePlan, remoteGrocery] = await Promise.all([
          fetchMealPlan(apiUrl, token),
          fetchGroceryList(apiUrl, token),
        ]);
        if (cancelled || identityRef.current?.userId !== userId) return;

        const planWinner = chooseWinner({
          localUpdatedAt: localPlan.updatedAt,
          remoteUpdatedAt: remotePlan.clientUpdatedAt,
          localEmpty: isMealPlanEmpty(localPlan.mealPlan, localPlan.upNext),
          remoteEmpty: isMealPlanEmpty(remotePlan.mealPlan, remotePlan.upNext),
        });
        if (planWinner === 'remote') {
          applyPlanDocument(remotePlan);
          writePlanToStorage(userId, remotePlan.mealPlan, remotePlan.upNext, remotePlan.clientUpdatedAt);
        } else {
          // The browser holds the newer plan (or the only one), so the account
          // gets it: this is what makes a guest plan survive a first sign-in.
          // Never below what an edit made during the fetch already stamped.
          planUpdatedAtRef.current = Math.max(planUpdatedAtRef.current, localPlan.updatedAt || Date.now());
          await pushPlan();
        }

        const groceryWinner = chooseWinner({
          localUpdatedAt: localGrocery.updatedAt,
          remoteUpdatedAt: remoteGrocery.clientUpdatedAt,
          localEmpty: isGroceryListEmpty(localGrocery.items),
          remoteEmpty: isGroceryListEmpty(remoteGrocery.items),
        });
        if (groceryWinner === 'remote') {
          applyGroceryDocument(remoteGrocery);
          writeGroceryToStorage(userId, remoteGrocery.items, remoteGrocery.lastGeneratedAt, remoteGrocery.clientUpdatedAt);
        } else {
          groceryUpdatedAtRef.current = Math.max(groceryUpdatedAtRef.current, localGrocery.updatedAt || Date.now());
          await pushGroceryList();
        }

        if (!cancelled) {
          setSyncStatus((prev) => (prev === 'error' ? prev : 'synced'));
        }
      } catch (error) {
        if (cancelled) return;
        // Sync is additive: a worker that is down or unreachable leaves the
        // planner working exactly as it did before, on the local copy.
        setSyncStatus('error');
        setSyncError(error instanceof Error ? error.message : 'Meal plan sync is unavailable');
      }
    })();

    return () => { cancelled = true; };
  }, [apiUrl, identityUserId, applyPlanDocument, applyGroceryDocument, pushPlan, pushGroceryList]);

  // Persist the plan on every change, and queue a push when signed in.
  useEffect(() => {
    const adopting = adoptingPlanRef.current;
    adoptingPlanRef.current = false;
    if (!adopting) planUpdatedAtRef.current = Date.now();
    writePlanToStorage(scopeRef.current, mealPlan, upNext, planUpdatedAtRef.current);
    if (!adopting) schedulePlanPush();
  }, [mealPlan, upNext, schedulePlanPush]);

  // Persist grocery items and their metadata together so the pair never drifts.
  useEffect(() => {
    const adopting = adoptingGroceryRef.current;
    adoptingGroceryRef.current = false;
    if (!adopting) groceryUpdatedAtRef.current = Date.now();
    writeGroceryToStorage(scopeRef.current, groceryList, lastListGeneratedAt, groceryUpdatedAtRef.current);
    if (!adopting) scheduleGroceryPush();
  }, [groceryList, lastListGeneratedAt, scheduleGroceryPush]);

  // A queued push must not outlive the provider. Anything still pending is kept
  // by the local cache with a newer timestamp than the server's, so the next
  // sign-in pushes it rather than losing it.
  useEffect(() => () => {
    if (planTimerRef.current) {
      clearTimeout(planTimerRef.current);
      planTimerRef.current = null;
    }
    if (groceryTimerRef.current) {
      clearTimeout(groceryTimerRef.current);
      groceryTimerRef.current = null;
    }
  }, []);

  // Best effort flush on the way out: a plan edited a moment before the tab
  // closes reaches the worker without waiting out the debounce.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const flush = () => {
      if (planTimerRef.current) {
        clearTimeout(planTimerRef.current);
        planTimerRef.current = null;
        void pushPlan();
      }
      if (groceryTimerRef.current) {
        clearTimeout(groceryTimerRef.current);
        groceryTimerRef.current = null;
        void pushGroceryList();
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [pushPlan, pushGroceryList]);

  /**
   * Adds a recipe to a specific date and meal type slot.
   * @param {string} dateString - e.g. '2025-10-24'
   * @param {string} mealType - one of 'breakfast' | 'lunch' | 'dinner' | 'snack'
   * @param {Object} recipe - recipe object with at least { id, name }
   */
  const addMeal = useCallback((dateString, mealType, recipe) => {
    if (!isValidMealType(mealType)) {
      console.warn(`Invalid mealType: "${mealType}". Allowed: breakfast, lunch, dinner, snack`);
      return;
    }
    if (!recipe?.id || !recipe?.name) {
      console.warn('Recipe missing id or name; skipping');
      return;
    }
    setMealPlan((prev) => {
      const day = prev[dateString] ?? createEmptyDay();
      return {
        ...prev,
        [dateString]: {
          ...day,
          [mealType]: [...day[mealType], { ...recipe, id: crypto.randomUUID() }],
        },
      };
    });
  }, []);

  /**
   * Appends a recipe to the upNext staging area.
   * Adding the same recipe twice is allowed (e.g. to schedule it multiple times).
   * @param {Object} recipe - recipe object with at least { id, name, ingredients }
   */
  const addUpNext = useCallback((recipe) => {
    if (!recipe?.id || !recipe?.name) {
      console.warn('addUpNext: recipe missing id or name; skipping');
      return;
    }
    setUpNext((prev) => [...prev, recipe]);
  }, []);

  /**
   * Removes the first recipe matching recipeId from the upNext staging area.
   * If the ID does not exist, the call is a no-op (no error thrown).
   * @param {string} recipeId - the id of the recipe to remove
   */
  const removeUpNext = useCallback((recipeId) => {
    if (!recipeId) return;
    setUpNext((prev) => {
      const idx = prev.findIndex((r) => r.id === recipeId);
      if (idx === -1) return prev; // graceful no-op
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  /**
   * Removes a recipe from a specific date and meal type slot by ID.
   * @param {string} dateString
   * @param {string} mealType
   * @param {string} recipeId
   */
  const removeMeal = useCallback((dateString, mealType, recipeId) => {
    if (!isValidMealType(mealType)) {
      console.warn(`Invalid mealType: "${mealType}". Allowed: breakfast, lunch, dinner, snack`);
      return;
    }
    setMealPlan((prev) => {
      const day = prev[dateString];
      if (!day) return prev;
      return {
        ...prev,
        [dateString]: {
          ...day,
          [mealType]: day[mealType].filter((r) => r.id !== recipeId),
        },
      };
    });
  }, []);

  /**
   * Moves a recipe between any combination of droppable zones, including the
   * upNext staging area and date/meal-type slots.
   *
   * Handles four scenarios:
   *   1. upNext → upNext  : reorder within the staging area
   *   2. upNext → slot    : move from staging into a date/meal slot
   *   3. slot  → upNext   : move from a date/meal slot back to staging
   *   4. slot  → slot     : move within the scheduled meal plan (existing behaviour)
   *
   * droppableId format for date/meal slots: "${dateString}::${mealType}"
   * (e.g. "2025-10-24::breakfast").  The upNext zone uses the literal id "upNext".
   *
   * @param {{ droppableId: string, index: number }} source      - drag source from @hello-pangea/dnd
   * @param {{ droppableId: string, index: number }} destination - drag destination from @hello-pangea/dnd
   * @param {number} sourceIndex      - source position (mirrors source.index; kept for call-site convenience)
   * @param {number} destinationIndex - destination position (mirrors destination.index)
   */
  const moveMeal = useCallback((source, destination, sourceIndex, destinationIndex) => {
    // No-op if dropped outside any droppable
    if (!destination) return;

    // No-op if dropped back onto the exact same position
    if (source.droppableId === destination.droppableId && sourceIndex === destinationIndex) return;

    const isSourceUpNext = source.droppableId === 'upNext';
    const isDestUpNext = destination.droppableId === 'upNext';

    /**
     * Parses a slot droppableId of the form "YYYY-MM-DD::mealType" into
     * { date, mealType }.  Returns null for "upNext" or malformed ids.
     */
    function parseSlotId(droppableId) {
      if (droppableId === 'upNext') return null;
      const sep = droppableId.lastIndexOf('::');
      if (sep === -1) return null;
      const date = droppableId.slice(0, sep);
      const mealType = droppableId.slice(sep + 2);
      if (!date || !isValidMealType(mealType)) return null;
      return { date, mealType };
    }

    // ── Scenario 1: upNext → upNext (reorder within staging area) ──────────
    if (isSourceUpNext && isDestUpNext) {
      setUpNext((prev) => {
        if (sourceIndex < 0 || sourceIndex >= prev.length) return prev;
        const reordered = [...prev];
        const [moved] = reordered.splice(sourceIndex, 1);
        const clampedDest = Math.min(destinationIndex, reordered.length);
        reordered.splice(clampedDest, 0, moved);
        return reordered;
      });
      return;
    }

    // ── Scenario 2: upNext → slot (move from staging to schedule) ──────────
    if (isSourceUpNext && !isDestUpNext) {
      const destSlot = parseSlotId(destination.droppableId);
      if (!destSlot) {
        console.warn('moveMeal: malformed destination droppableId:', destination.droppableId);
        return;
      }
      const { date: destDate, mealType: destMealType } = destSlot;

      // Capture recipe from current upNext before any state mutation
      if (sourceIndex < 0 || sourceIndex >= upNext.length) return;
      const recipe = upNext[sourceIndex];

      // Remove from upNext
      setUpNext([...upNext.slice(0, sourceIndex), ...upNext.slice(sourceIndex + 1)]);

      // Insert into mealPlan slot
      setMealPlan((prev) => {
        const destDay = prev[destDate] ?? createEmptyDay();
        const destMeals = destDay[destMealType] ?? [];
        const clampedDest = Math.min(destinationIndex, destMeals.length);
        const newDestMeals = [...destMeals];
        newDestMeals.splice(clampedDest, 0, recipe);
        return {
          ...prev,
          [destDate]: { ...destDay, [destMealType]: newDestMeals },
        };
      });
      return;
    }

    // ── Scenario 3: slot → upNext (move from schedule back to staging) ──────
    if (!isSourceUpNext && isDestUpNext) {
      const srcSlot = parseSlotId(source.droppableId);
      if (!srcSlot) {
        console.warn('moveMeal: malformed source droppableId:', source.droppableId);
        return;
      }
      const { date: srcDate, mealType: srcMealType } = srcSlot;

      // Capture recipe from current mealPlan before any state mutation
      const srcDay = mealPlan[srcDate];
      if (!srcDay) return;
      const srcMeals = srcDay[srcMealType] ?? [];
      if (sourceIndex < 0 || sourceIndex >= srcMeals.length) return;
      const recipe = srcMeals[sourceIndex];

      // Remove from mealPlan slot
      setMealPlan((prev) => {
        const day = prev[srcDate];
        if (!day) return prev;
        const meals = day[srcMealType] ?? [];
        return {
          ...prev,
          [srcDate]: { ...day, [srcMealType]: meals.filter((_, i) => i !== sourceIndex) },
        };
      });

      // Insert into upNext at destination index
      setUpNext((prev) => {
        const clampedDest = Math.min(destinationIndex, prev.length);
        const newUpNext = [...prev];
        newUpNext.splice(clampedDest, 0, recipe);
        return newUpNext;
      });
      return;
    }

    // ── Scenario 4: slot → slot (existing behaviour) ────────────────────────
    const srcSlot = parseSlotId(source.droppableId);
    const destSlot = parseSlotId(destination.droppableId);

    if (!srcSlot || !destSlot) {
      console.warn('moveMeal: malformed droppableId in slot→slot move');
      return;
    }

    const { date: sourceDate, mealType: sourceMealType } = srcSlot;
    const { date: destDate, mealType: destMealType } = destSlot;

    setMealPlan((prev) => {
      const sourceDay = prev[sourceDate] ?? createEmptyDay();
      const sourceMeals = sourceDay[sourceMealType] ?? [];

      if (sourceIndex < 0 || sourceIndex >= sourceMeals.length) return prev;

      const meal = sourceMeals[sourceIndex];
      const isSameSlot = sourceDate === destDate && sourceMealType === destMealType;

      if (isSameSlot) {
        if (sourceIndex === destinationIndex) return prev;
        const reordered = [...sourceMeals];
        reordered.splice(sourceIndex, 1);
        const clampedDest = Math.min(destinationIndex, reordered.length);
        reordered.splice(clampedDest, 0, meal);
        return {
          ...prev,
          [sourceDate]: { ...sourceDay, [sourceMealType]: reordered },
        };
      }

      // Remove from source
      const newSourceMeals = sourceMeals.filter((_, i) => i !== sourceIndex);

      // Insert into destination
      const destDay = prev[destDate] ?? createEmptyDay();
      const destMeals = destDay[destMealType] ?? [];
      const clampedDest = Math.min(destinationIndex, destMeals.length);
      const newDestMeals = [...destMeals];
      newDestMeals.splice(clampedDest, 0, meal);

      if (sourceDate === destDate) {
        // Same date, different meal type — update both in one day object
        const updatedDay = {
          ...sourceDay,
          [sourceMealType]: newSourceMeals,
          [destMealType]: newDestMeals,
        };
        return { ...prev, [sourceDate]: updatedDay };
      }

      return {
        ...prev,
        [sourceDate]: { ...sourceDay, [sourceMealType]: newSourceMeals },
        [destDate]: { ...destDay, [destMealType]: newDestMeals },
      };
    });
  }, [mealPlan, upNext]);

  const clearActiveRecipe = useCallback(() => setActiveRecipe(null), []);

  // ── Grocery list methods ─────────────────────────────────────────────────

  /**
   * Replaces the entire grocery list with a new array of items.
   * Called after AI generation completes successfully.
   * Clears any previous generation error and sets isGeneratingList to false.
   * @param {Array} items - Array of GroceryListItem objects from the AI response
   */
  const setGroceryList = useCallback((items) => {
    setGroceryListState(items);
    setLastListGeneratedAt(Date.now());
    setIsGeneratingList(false);
    setListGenerationError(null);
  }, []);

  /**
   * Adds a user-created item to the grocery list.
   * Automatically sets id, createdAt, isCustom, and source fields.
   * @param {Object} itemData - Item fields (name, quantity, unit, category, completed, notes)
   */
  const addCustomItem = useCallback((itemData) => {
    const newItem = {
      ...itemData,
      id: generateId(),
      createdAt: Date.now(),
      isCustom: true,
      source: 'user-added',
    };
    setGroceryListState((prev) => [...prev, newItem]);
  }, []);

  /**
   * Flips the completed boolean for a grocery list item.
   * No-op if itemId is not found.
   * @param {string} itemId - The id of the item to toggle
   */
  const toggleItemCompletion = useCallback((itemId) => {
    setGroceryListState((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      )
    );
  }, []);

  /**
   * Merges updates into an existing grocery list item.
   * Preserves id and createdAt regardless of what updates contains.
   * No-op if itemId is not found.
   * @param {string} itemId  - The id of the item to edit
   * @param {Object} updates - Partial item fields to merge (e.g. { name, quantity, unit })
   */
  const editItem = useCallback((itemId, updates) => {
    setGroceryListState((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, ...updates, id: item.id, createdAt: item.createdAt }
          : item
      )
    );
  }, []);

  /**
   * Removes an item from the grocery list by id.
   * No-op if itemId is not found.
   * @param {string} itemId - The id of the item to remove
   */
  const deleteItem = useCallback((itemId) => {
    setGroceryListState((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  /**
   * Clears the entire grocery list and resets lastListGeneratedAt.
   * Used when the user starts over.
   */
  const clearGroceryList = useCallback(() => {
    setGroceryListState([]);
    setLastListGeneratedAt(null);
  }, []);

  /**
   * Signals that AI grocery list generation has started.
   * Sets isGeneratingList to true and clears any previous error.
   */
  const generateGroceryListStart = useCallback(() => {
    setIsGeneratingList(true);
    setListGenerationError(null);
  }, []);

  /**
   * Signals that AI grocery list generation has failed.
   * Sets isGeneratingList to false and stores the error message.
   * @param {string} error - Human-readable error message to display
   */
  const generateGroceryListError = useCallback((error) => {
    setIsGeneratingList(false);
    setListGenerationError(error);
  }, []);

  const contextValue = useMemo(
    () => ({
      mealPlan,
      upNext,
      addMeal,
      addUpNext,
      removeUpNext,
      removeMeal,
      moveMeal,
      activeRecipe,
      setActiveRecipe,
      clearActiveRecipe,
      // Grocery list state
      groceryList,
      isGeneratingList,
      listGenerationError,
      lastListGeneratedAt,
      // Grocery list methods
      setGroceryList,
      addCustomItem,
      toggleItemCompletion,
      editItem,
      deleteItem,
      clearGroceryList,
      generateGroceryListStart,
      generateGroceryListError,
      // Cross-device sync
      setSyncIdentity,
      syncStatus,
      syncError,
      syncAvailable,
    }),
    [
      mealPlan, upNext, addMeal, addUpNext, removeUpNext, removeMeal, moveMeal,
      activeRecipe, clearActiveRecipe,
      groceryList, isGeneratingList, listGenerationError, lastListGeneratedAt,
      setGroceryList, addCustomItem, toggleItemCompletion, editItem, deleteItem,
      clearGroceryList, generateGroceryListStart, generateGroceryListError,
      setSyncIdentity, syncStatus, syncError, syncAvailable,
    ]
  );

  return (
    <MealPlanContext.Provider value={contextValue}>
      {children}
    </MealPlanContext.Provider>
  );
}
