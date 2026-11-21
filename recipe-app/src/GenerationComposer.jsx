import React, { useEffect, useRef, useState } from "react";

const DIET_OPTIONS = [
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["pescatarian", "Pescatarian"],
  ["halal", "Halal"],
  ["kosher", "Kosher"],
  ["gluten_free", "Gluten-free"],
  ["dairy_free", "Dairy-free"],
  ["keto", "Keto"],
];

const EQUIPMENT_OPTIONS = [
  ["oven", "Oven"],
  ["stovetop", "Stovetop"],
  ["air_fryer", "Air fryer"],
  ["instant_pot", "Instant Pot"],
  ["slow_cooker", "Slow cooker"],
  ["grill", "Grill"],
  ["microwave", "Microwave"],
];

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "dessert"];
const COOKING_METHODS = ["stovetop", "oven", "air fryer", "grill", "no-cook"];

function listValue(value) {
  return Array.isArray(value) ? value : [];
}

function commaSeparated(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function initialForm(profile) {
  return {
    dietary: listValue(profile?.diet_tags),
    equipment: listValue(profile?.equipment),
    servings: profile?.default_servings ?? 4,
    maxCookTime: profile?.max_cook_time_min ?? 60,
    cuisine: profile?.cuisine_likes?.[0] || "",
    mealType: "",
    cookingMethod: "",
    nutritionFocus: profile?.nutrition_goals?.focus || "",
    budgetBand: profile?.budget_band || "flexible",
    mealBudgetUsd: profile?.meal_budget_usd ?? "",
    seasonality: profile?.seasonality?.enabled ? "in_season" : "any",
    ingredients: "",
    excludeIngredients: listValue(profile?.exclude_ingredients).join(", "),
    usePantry: false,
    prioritizeExpiring: false,
  };
}

function toggleValue(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export default function GenerationComposer({
  open,
  profile,
  query,
  busy,
  onClose,
  onGenerate,
  pantryItems = [],
  expiringPantryItems = [],
  pantryPlannerEnabled = false,
}) {
  const [form, setForm] = useState(() => initialForm(profile));
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm(initialForm(profile));
      const focusFirstField = () => firstFieldRef.current?.focus();
      if (typeof window !== "undefined" && window.requestAnimationFrame)
        window.requestAnimationFrame(focusFirstField);
      else focusFirstField();
    }
  }, [open, profile]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const overrides = {
      dietary: form.dietary,
      equipment: form.equipment,
      servings: Number(form.servings),
      maxCookTime: Number(form.maxCookTime),
      cuisine: form.cuisine.trim(),
      mealType: form.mealType,
      cookingMethod: form.cookingMethod,
      ingredients: commaSeparated(form.ingredients),
      excludeIngredients: commaSeparated(form.excludeIngredients),
    };
    if (form.budgetBand && form.budgetBand !== "flexible") {
      overrides.budgetBand = form.budgetBand;
    }
    if (form.mealBudgetUsd !== "" && !isNaN(Number(form.mealBudgetUsd))) {
      overrides.mealBudgetUsd = Number(form.mealBudgetUsd);
    }
    if (form.seasonality === "in_season") {
      overrides.seasonality = { enabled: true, hemisphere: profile?.seasonality?.hemisphere || "n", climate_bias: "prefer_lower_impact" };
    }
    if (form.nutritionFocus) {
      overrides.nutritionGoals = { focus: form.nutritionFocus };
    }
    if (pantryPlannerEnabled && form.usePantry) {
      overrides.usePantry = true;
      if (form.prioritizeExpiring && expiringPantryItems.length > 0) overrides.prioritizeExpiring = true;
    }
    onGenerate(overrides);
  }

  return (
    <div
      className="generation-composer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="generation-composer-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-composer-title"
      >
        <div className="generation-composer-header">
          <div>
            <p className="generation-composer-eyebrow">Tune your generation</p>
            <h2 id="generation-composer-title">
              Make {query || "this recipe"} work for you
            </h2>
            <p>These constraints are applied before the recipe is generated.</p>
          </div>
          <button
            type="button"
            className="generation-composer-close"
            aria-label="Close generation tuning"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {profile && (
          <div className="generation-composer-profile" role="status">
            <strong>Kitchen profile defaults</strong>
            <span>
              {profile.diet_tags?.length
                ? profile.diet_tags.join(", ")
                : "No diet set"}
              {" · "}
              {profile.default_servings} servings
              {" · up to "}
              {profile.max_cook_time_min} min
              {profile.nutrition_goals?.focus && (
                <> · {profile.nutrition_goals.focus.replace(/_/g, " ")}</>
              )}
            </span>
            {profile.hard_allergens?.length > 0 && (
              <span className="generation-composer-safety">
                Hard allergens protected: {profile.hard_allergens.join(", ")}
              </span>
            )}
          </div>
        )}

        <form onSubmit={submit}>
          <fieldset>
            <legend>Diet and style</legend>
            <div className="generation-composer-options">
              {DIET_OPTIONS.map(([value, label]) => (
                <label key={value} className="generation-composer-check">
                  <input
                    type="checkbox"
                    checked={form.dietary.includes(value)}
                    onChange={() =>
                      setField("dietary", toggleValue(form.dietary, value))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="generation-composer-grid">
            <label>
              Cuisine
              <input
                ref={firstFieldRef}
                type="text"
                value={form.cuisine}
                onChange={(event) => setField("cuisine", event.target.value)}
                placeholder="Thai, Mexican…"
              />
            </label>
            <label>
              Meal type
              <select
                value={form.mealType}
                onChange={(event) => setField("mealType", event.target.value)}
              >
                <option value="">Any meal</option>
                {MEAL_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nutrition focus
              <select
                value={form.nutritionFocus}
                onChange={(event) => setField("nutritionFocus", event.target.value)}
              >
                <option value="">Any / Balanced</option>
                <option value="high_protein">High protein</option>
                <option value="low_sodium">Low sodium</option>
                <option value="lower_carb">Lower carb</option>
                <option value="heart_healthy">Heart healthy</option>
              </select>
            </label>
            <label>
              Servings
              <input
                type="number"
                min="1"
                max="24"
                value={form.servings}
                onChange={(event) => setField("servings", event.target.value)}
              />
            </label>
            <label>
              Max time (minutes)
              <input
                type="number"
                min="5"
                max="720"
                value={form.maxCookTime}
                onChange={(event) =>
                  setField("maxCookTime", event.target.value)
                }
              />
            </label>
            <label>
              Cooking method
              <select
                value={form.cookingMethod}
                onChange={(event) =>
                  setField("cookingMethod", event.target.value)
                }
              >
                <option value="">Any method</option>
                {COOKING_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Budget constraint
              <select
                value={form.budgetBand}
                onChange={(event) => setField("budgetBand", event.target.value)}
              >
                <option value="flexible">Flexible ($$$)</option>
                <option value="low">Budget / Pantry staples ($)</option>
                <option value="medium">Moderate ($$)</option>
              </select>
            </label>
            <label>
              Target budget ($ USD)
              <input
                type="number"
                min="1"
                max="500"
                step="0.5"
                value={form.mealBudgetUsd}
                onChange={(event) =>
                  setField("mealBudgetUsd", event.target.value)
                }
                placeholder="e.g. 15"
              />
            </label>
            <label>
              Seasonality
              <select
                value={form.seasonality}
                onChange={(event) => setField("seasonality", event.target.value)}
              >
                <option value="any">Year-round / Any</option>
                <option value="in_season">Peak In-Season & Climate-smart</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Available equipment</legend>
            <div className="generation-composer-options">
              {EQUIPMENT_OPTIONS.map(([value, label]) => (
                <label key={value} className="generation-composer-check">
                  <input
                    type="checkbox"
                    checked={form.equipment.includes(value)}
                    onChange={() =>
                      setField("equipment", toggleValue(form.equipment, value))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {pantryPlannerEnabled && (
            <>
              <label className="generation-composer-pantry">
                <input
                  type="checkbox"
                  checked={form.usePantry}
                  onChange={(event) => setField("usePantry", event.target.checked)}
                />
                <span>
                  <strong>Use my pantry</strong>
                  <small>{pantryItems.length > 0 ? `${pantryItems.length} item${pantryItems.length === 1 ? "" : "s"} available to use first` : "Your pantry is empty — add items from My pantry"}</small>
                </span>
              </label>
              {form.usePantry && expiringPantryItems.length > 0 && (
                <label className="generation-composer-pantry generation-composer-pantry--secondary">
                  <input
                    type="checkbox"
                    checked={form.prioritizeExpiring}
                    onChange={(event) => setField("prioritizeExpiring", event.target.checked)}
                  />
                  <span>
                    <strong>Use items expiring soon first</strong>
                    <small>{expiringPantryItems.slice(0, 3).map((item) => item.name).join(" · ")}</small>
                  </span>
                </label>
              )}
            </>
          )}

          <label className="generation-composer-field">
            Must-use ingredients
            <input
              type="text"
              value={form.ingredients}
              onChange={(event) => setField("ingredients", event.target.value)}
              placeholder="chickpeas, spinach (comma separated)"
            />
          </label>
          <label className="generation-composer-field">
            Exclude for this recipe
            <input
              type="text"
              value={form.excludeIngredients}
              onChange={(event) =>
                setField("excludeIngredients", event.target.value)
              }
              placeholder="cilantro, mushrooms (comma separated)"
            />
          </label>

          <p className="generation-composer-disclaimer">
            Hard allergens from your kitchen profile stay protected. AI can make
            mistakes; always verify ingredients and labels.
          </p>
          <div className="generation-composer-actions">
            <button
              type="button"
              className="generation-composer-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="generation-composer-primary"
              disabled={busy}
            >
              {busy ? "Generating…" : "Generate recipe"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
