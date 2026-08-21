import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import GenerationComposer from "../GenerationComposer.jsx";

const profile = {
  diet_tags: ["vegetarian"],
  hard_allergens: ["peanuts"],
  default_servings: 2,
  max_cook_time_min: 30,
  equipment: ["air_fryer"],
  cuisine_likes: ["Thai"],
  exclude_ingredients: ["cilantro"],
};

describe("GenerationComposer", () => {
  test("shows profile defaults and safety constraints", () => {
    render(
      <GenerationComposer
        open
        profile={profile}
        query="weeknight noodles"
        busy={false}
        onClose={jest.fn()}
        onGenerate={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /Make weeknight noodles work for you/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Kitchen profile defaults/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Hard allergens protected: peanuts/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Servings")).toHaveValue(2);
    expect(screen.getByLabelText("Max time (minutes)")).toHaveValue(30);
    expect(screen.getByLabelText("Vegetarian")).toBeChecked();
    expect(screen.getByLabelText("Air fryer")).toBeChecked();
    expect(screen.getByLabelText("Exclude for this recipe")).toHaveValue(
      "cilantro",
    );
  });

  test("submits structured generation overrides", () => {
    const onGenerate = jest.fn();
    render(
      <GenerationComposer
        open
        profile={profile}
        query="weeknight noodles"
        busy={false}
        onClose={jest.fn()}
        onGenerate={onGenerate}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cuisine"), {
      target: { value: "Mexican" },
    });
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Max time (minutes)"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Must-use ingredients"), {
      target: { value: "beans, corn" },
    });
    fireEvent.click(screen.getByLabelText("Vegetarian"));
    fireEvent.click(screen.getByRole("button", { name: "Generate recipe" }));

    expect(onGenerate).toHaveBeenCalledWith({
      dietary: [],
      equipment: ["air_fryer"],
      servings: 4,
      maxCookTime: 20,
      cuisine: "Mexican",
      mealType: "",
      cookingMethod: "",
      ingredients: ["beans", "corn"],
      excludeIngredients: ["cilantro"],
    });
  });

  test("includes pantry preference when the planner flag is enabled", () => {
    const onGenerate = jest.fn();
    render(
      <GenerationComposer
        open
        profile={null}
        query="pantry pasta"
        busy={false}
        pantryPlannerEnabled
        pantryItems={[{ id: 1, name: "chickpeas" }]}
        expiringPantryItems={[{ id: 1, name: "chickpeas" }]}
        onClose={jest.fn()}
        onGenerate={onGenerate}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Use my pantry/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Use items expiring soon first/i }));
    fireEvent.click(screen.getByRole("button", { name: "Generate recipe" }));

    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ usePantry: true, prioritizeExpiring: true }));
  });

  test("Escape closes the composer", () => {
    const onClose = jest.fn();
    render(
      <GenerationComposer
        open
        profile={null}
        query="pasta"
        busy={false}
        onClose={onClose}
        onGenerate={jest.fn()}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
