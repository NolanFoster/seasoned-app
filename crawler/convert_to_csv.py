#!/usr/bin/env python3
"""
Convert Pacific Northwest recipes JSON to CSV format
"""

import json
import csv
from typing import Dict, Any, List

def json_to_csv(json_file: str, csv_file: str):
    """Convert JSON recipes to CSV format"""
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    recipes = data.get('recipes', [])
    
    if not recipes:
        print("No recipes found in JSON file")
        return
    
    # Define CSV columns
    columns = [
        'title', 'url', 'description', 'category', 'cuisine', 'author',
        'prep_time', 'cook_time', 'total_time', 'servings',
        'ingredients_count', 'instructions_count',
        'ingredients', 'instructions', 'image_url', 'scraped_at'
    ]
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        
        for recipe in recipes:
            # Prepare row data
            ingredients = recipe.get('ingredients', [])
            instructions = recipe.get('instructions', [])
            
            row = {
                'title': recipe.get('title', ''),
                'url': recipe.get('url', ''),
                'description': recipe.get('description', ''),
                'category': recipe.get('category', ''),
                'cuisine': recipe.get('cuisine', ''),
                'author': recipe.get('author', ''),
                'prep_time': recipe.get('prep_time', ''),
                'cook_time': recipe.get('cook_time', ''),
                'total_time': recipe.get('total_time', ''),
                'servings': recipe.get('servings', ''),
                'ingredients_count': len(ingredients),
                'instructions_count': len(instructions),
                'ingredients': ' | '.join(ingredients) if ingredients else '',
                'instructions': ' | '.join(instructions) if instructions else '',
                'image_url': recipe.get('image_url', ''),
                'scraped_at': recipe.get('scraped_at', '')
            }
            
            writer.writerow(row)
    
    print(f"CSV file created: {csv_file}")
    print(f"Total recipes: {len(recipes)}")

def main():
    json_file = 'pacific_northwest_recipes_filtered.json'
    csv_file = 'pacific_northwest_recipes.csv'
    
    try:
        json_to_csv(json_file, csv_file)
    except FileNotFoundError:
        print(f"Error: {json_file} not found")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()