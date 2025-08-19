#!/usr/bin/env python3
"""
Filter Pacific Northwest recipes to remove social media links and invalid entries
"""

import json
from typing import Dict, Any, List

def is_valid_recipe(recipe: Dict[str, Any]) -> bool:
    """Check if a recipe entry is valid (not a social media link or empty)"""
    
    # Check for social media URLs
    social_media_domains = [
        'pinterest.com',
        'twitter.com',
        'facebook.com',
        'yummly.com'
    ]
    
    if any(domain in recipe.get('url', '') for domain in social_media_domains):
        return False
    
    # Check for invalid titles
    invalid_titles = [
        'Pin Builder',
        'JavaScript is not available.',
        ''
    ]
    
    title = recipe.get('title', '').strip()
    if not title or title in invalid_titles:
        return False
    
    # Must have at least a title and some content (ingredients or instructions)
    ingredients = recipe.get('ingredients', [])
    instructions = recipe.get('instructions', [])
    
    # Filter out navigation/menu items from ingredients
    valid_ingredients = [
        ing for ing in ingredients 
        if ing and not any(nav_word in ing.lower() for nav_word in [
            'home', 'recipe index', 'cooking articles', 'culinary dictionary',
            'what\'s cooking america', 'privacy policy', 'comments', 'print'
        ])
    ]
    
    # Must have either valid ingredients or instructions
    return len(valid_ingredients) > 0 or len(instructions) > 0

def clean_ingredients(ingredients: List[str]) -> List[str]:
    """Clean up ingredients list by removing navigation items"""
    if not ingredients:
        return []
    
    # Words/phrases that indicate navigation/menu items
    nav_indicators = [
        'home', 'recipe index', 'cooking articles', 'culinary dictionary',
        'what\'s cooking america', 'privacy policy', 'comments', 'print',
        'recipe indexes', 'dinner party menus', 'baking corner', 'regional foods',
        'healthy recipes', 'cooking videos', 'food history', 'cooking hints',
        'cooking lessons', 'food travels', 'diet, health', 'kitchen organization',
        'sips across america'
    ]
    
    cleaned = []
    for ingredient in ingredients:
        if not ingredient:
            continue
            
        ingredient_lower = ingredient.lower().strip()
        
        # Skip if it's clearly a navigation item
        if any(nav in ingredient_lower for nav in nav_indicators):
            continue
            
        # Skip if it's too short to be a real ingredient (but keep measurements)
        if len(ingredient_lower) < 3 and not any(char.isdigit() for char in ingredient):
            continue
            
        cleaned.append(ingredient.strip())
    
    return cleaned

def filter_recipes(input_file: str, output_file: str) -> Dict[str, Any]:
    """Filter recipes and create a clean dataset"""
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    original_recipes = data.get('recipes', [])
    valid_recipes = []
    
    for recipe in original_recipes:
        if is_valid_recipe(recipe):
            # Clean up the recipe
            cleaned_recipe = recipe.copy()
            cleaned_recipe['ingredients'] = clean_ingredients(recipe.get('ingredients', []))
            valid_recipes.append(cleaned_recipe)
    
    # Create filtered dataset
    filtered_data = {
        'scraped_at': data.get('scraped_at'),
        'source_url': data.get('source_url'),
        'original_total_recipes': len(original_recipes),
        'filtered_total_recipes': len(valid_recipes),
        'total_links_found': data.get('total_links_found'),
        'failed_urls': data.get('failed_urls', []),
        'recipes': valid_recipes
    }
    
    # Save filtered results
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(filtered_data, f, indent=2, ensure_ascii=False)
    
    return {
        'original_count': len(original_recipes),
        'filtered_count': len(valid_recipes),
        'removed_count': len(original_recipes) - len(valid_recipes)
    }

def main():
    input_file = 'pacific_northwest_recipes_interrupted.json'
    output_file = 'pacific_northwest_recipes_filtered.json'
    
    print("Filtering Pacific Northwest recipes...")
    
    try:
        stats = filter_recipes(input_file, output_file)
        
        print(f"\n=== Filtering Results ===")
        print(f"Original recipes: {stats['original_count']}")
        print(f"Valid recipes: {stats['filtered_count']}")
        print(f"Removed (invalid): {stats['removed_count']}")
        print(f"Filtered data saved to: {output_file}")
        
        # Show some sample recipe titles
        with open(output_file, 'r', encoding='utf-8') as f:
            filtered_data = json.load(f)
        
        print(f"\n=== Sample Recipe Titles ===")
        for i, recipe in enumerate(filtered_data['recipes'][:10]):
            print(f"{i+1}. {recipe.get('title', 'No title')}")
        
        if len(filtered_data['recipes']) > 10:
            print(f"... and {len(filtered_data['recipes']) - 10} more recipes")
            
    except FileNotFoundError:
        print(f"Error: {input_file} not found")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()