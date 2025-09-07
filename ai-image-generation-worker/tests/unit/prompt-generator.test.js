import { describe, it, expect } from 'vitest';
import { generatePromptFromRecipe } from '../../src/utils/prompt-generator.js';

describe('Prompt Generator', () => {
  it('should generate a basic prompt from recipe with title', () => {
    const recipe = {
      title: 'Chocolate Cake',
      ingredients: ['flour', 'sugar', 'cocoa powder', 'eggs']
    };
    
    const prompt = generatePromptFromRecipe(recipe);
    
    expect(prompt).toContain('Chocolate Cake');
    expect(prompt).toContain('professional food photography');
    expect(prompt).toContain('appetizing');
  });

  it('should use name if title is not available', () => {
    const recipe = {
      name: 'Apple Pie',
      ingredients: ['apples', 'flour', 'butter', 'cinnamon']
    };
    
    const prompt = generatePromptFromRecipe(recipe);
    
    expect(prompt).toContain('Apple Pie');
  });

  it('should include cuisine information when available', () => {
    const recipe = {
      title: 'Pad Thai',
      cuisine: 'Thai',
      ingredients: ['rice noodles', 'shrimp', 'peanuts', 'lime']
    };
    
    const prompt = generatePromptFromRecipe(recipe);
    
    expect(prompt).toContain('Thai cuisine');
  });

  it('should handle different style options', () => {
    const recipe = {
      title: 'Pasta Carbonara',
      ingredients: ['pasta', 'eggs', 'bacon', 'parmesan']
    };
    
    const artisticPrompt = generatePromptFromRecipe(recipe, 'artistic');
    expect(artisticPrompt).toContain('artistic illustration');
    expect(artisticPrompt).toContain('watercolor');
    
    const rusticPrompt = generatePromptFromRecipe(recipe, 'rustic');
    expect(rusticPrompt).toContain('rustic');
    expect(rusticPrompt).toContain('wooden table');
    
    const modernPrompt = generatePromptFromRecipe(recipe, 'modern');
    expect(modernPrompt).toContain('modern');
    expect(modernPrompt).toContain('minimalist');
  });

  it('should extract key ingredients from ingredient list', () => {
    const recipe = {
      title: 'Salad',
      ingredients: [
        '2 cups fresh spinach',
        '1 medium tomato, diced',
        '1/2 cup crumbled feta cheese',
        'olive oil for dressing'
      ]
    };
    
    const prompt = generatePromptFromRecipe(recipe);
    
    expect(prompt).toMatch(/featuring.*spinach/);
  });

  it('should handle recipe with recipeIngredient field', () => {
    const recipe = {
      name: 'Smoothie',
      recipeIngredient: ['banana', 'strawberries', 'yogurt', 'honey']
    };
    
    const prompt = generatePromptFromRecipe(recipe);
    
    expect(prompt).toContain('Smoothie');
    expect(prompt).toContain('featuring');
  });

  it('should handle recipe without ingredients gracefully', () => {
    const recipe = {
      title: 'Mystery Dish',
      description: 'A delicious surprise'
    };
    
    const prompt = generatePromptFromRecipe(recipe);
    
    expect(prompt).toContain('Mystery Dish');
    expect(prompt).toContain('delicious surprise');
  });

  it('should clean and truncate long descriptions', () => {
    const recipe = {
      title: 'Burger',
      description: 'This is an incredibly delicious burger with special sauce @#$%^& and lots of toppings that make it absolutely amazing and wonderful to eat every single time you try it because it is just so good!',
      ingredients: ['beef', 'bun', 'lettuce', 'tomato']
    };
    
    const prompt = generatePromptFromRecipe(recipe);
    
    expect(prompt).not.toContain('@#$%^&');
    expect(prompt.length).toBeLessThan(500);
  });
});