#!/usr/bin/env python3
"""
Recipe Search Tool for Pacific Northwest Recipes
Provides comprehensive search functionality across titles, ingredients, and instructions
"""

import json
import re
from typing import List, Dict, Any, Set
from collections import defaultdict

class RecipeSearcher:
    def __init__(self, json_file: str):
        """Initialize the recipe searcher with data from JSON file"""
        self.recipes = []
        self.load_recipes(json_file)
        self.build_search_indices()
    
    def load_recipes(self, json_file: str):
        """Load recipes from JSON file"""
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.recipes = data.get('recipes', [])
                print(f"Loaded {len(self.recipes)} recipes for searching")
        except FileNotFoundError:
            print(f"Error: {json_file} not found")
            self.recipes = []
        except Exception as e:
            print(f"Error loading recipes: {e}")
            self.recipes = []
    
    def build_search_indices(self):
        """Build search indices for faster searching"""
        self.title_index = {}
        self.ingredient_index = defaultdict(set)
        self.instruction_index = defaultdict(set)
        self.keyword_index = defaultdict(set)
        
        for i, recipe in enumerate(self.recipes):
            # Index title words
            title = recipe.get('title', '').lower()
            title_words = re.findall(r'\b\w+\b', title)
            for word in title_words:
                if word not in self.title_index:
                    self.title_index[word] = set()
                self.title_index[word].add(i)
            
            # Index ingredients
            ingredients = recipe.get('ingredients', [])
            for ingredient in ingredients:
                ingredient_words = re.findall(r'\b\w+\b', ingredient.lower())
                for word in ingredient_words:
                    self.ingredient_index[word].add(i)
                    self.keyword_index[word].add(i)
            
            # Index instructions
            instructions = recipe.get('instructions', [])
            for instruction in instructions:
                instruction_words = re.findall(r'\b\w+\b', instruction.lower())
                for word in instruction_words:
                    self.instruction_index[word].add(i)
                    self.keyword_index[word].add(i)
            
            # Index other fields
            for field in ['description', 'category', 'cuisine', 'author']:
                field_text = recipe.get(field, '')
                if field_text:
                    field_words = re.findall(r'\b\w+\b', field_text.lower())
                    for word in field_words:
                        self.keyword_index[word].add(i)
    
    def search_by_title(self, query: str) -> List[Dict[str, Any]]:
        """Search recipes by title"""
        query_words = re.findall(r'\b\w+\b', query.lower())
        if not query_words:
            return []
        
        # Find recipes that contain all query words in title
        matching_indices = None
        for word in query_words:
            word_indices = self.title_index.get(word, set())
            if matching_indices is None:
                matching_indices = word_indices.copy()
            else:
                matching_indices &= word_indices
        
        if matching_indices is None:
            return []
        
        return [self.recipes[i] for i in matching_indices]
    
    def search_by_ingredient(self, ingredient: str) -> List[Dict[str, Any]]:
        """Search recipes by ingredient"""
        ingredient_words = re.findall(r'\b\w+\b', ingredient.lower())
        if not ingredient_words:
            return []
        
        matching_indices = None
        for word in ingredient_words:
            word_indices = self.ingredient_index.get(word, set())
            if matching_indices is None:
                matching_indices = word_indices.copy()
            else:
                matching_indices &= word_indices
        
        if matching_indices is None:
            return []
        
        return [self.recipes[i] for i in matching_indices]
    
    def search_by_cooking_method(self, method: str) -> List[Dict[str, Any]]:
        """Search recipes by cooking method (baked, grilled, fried, etc.)"""
        method_words = re.findall(r'\b\w+\b', method.lower())
        if not method_words:
            return []
        
        matching_indices = None
        for word in method_words:
            # Search in both title and instructions
            title_indices = self.title_index.get(word, set())
            instruction_indices = self.instruction_index.get(word, set())
            word_indices = title_indices | instruction_indices
            
            if matching_indices is None:
                matching_indices = word_indices.copy()
            else:
                matching_indices &= word_indices
        
        if matching_indices is None:
            return []
        
        return [self.recipes[i] for i in matching_indices]
    
    def search_general(self, query: str) -> List[Dict[str, Any]]:
        """General search across all recipe fields"""
        query_words = re.findall(r'\b\w+\b', query.lower())
        if not query_words:
            return []
        
        # Score recipes based on how many query words they contain
        recipe_scores = defaultdict(int)
        
        for word in query_words:
            # Get all recipes containing this word
            matching_indices = self.keyword_index.get(word, set())
            for idx in matching_indices:
                recipe_scores[idx] += 1
        
        # Filter recipes that contain at least one query word
        matching_recipes = []
        for idx, score in recipe_scores.items():
            recipe = self.recipes[idx].copy()
            recipe['search_score'] = score
            matching_recipes.append(recipe)
        
        # Sort by search score (descending)
        matching_recipes.sort(key=lambda x: x['search_score'], reverse=True)
        
        return matching_recipes
    
    def search_by_dietary_needs(self, dietary_type: str) -> List[Dict[str, Any]]:
        """Search for recipes that might meet dietary needs"""
        dietary_keywords = {
            'vegetarian': ['vegetarian', 'veggie', 'vegetables'],
            'seafood': ['salmon', 'crab', 'halibut', 'clam', 'fish', 'seafood'],
            'dessert': ['pie', 'cake', 'dessert', 'sweet', 'cobbler', 'cream'],
            'sauce': ['sauce', 'dressing', 'vinaigrette'],
            'soup': ['soup', 'chowder', 'broth'],
            'appetizer': ['appetizer', 'dip', 'spread']
        }
        
        keywords = dietary_keywords.get(dietary_type.lower(), [dietary_type])
        
        matching_recipes = []
        for keyword in keywords:
            results = self.search_general(keyword)
            for recipe in results:
                if recipe not in matching_recipes:
                    matching_recipes.append(recipe)
        
        return matching_recipes
    
    def get_recipe_summary(self, recipe: Dict[str, Any]) -> str:
        """Get a brief summary of a recipe for display"""
        title = recipe.get('title', 'No title')
        ingredients_count = len(recipe.get('ingredients', []))
        instructions_count = len(recipe.get('instructions', []))
        servings = recipe.get('servings', 'Unknown')
        prep_time = recipe.get('prep_time', 'Unknown')
        
        summary = f"'{title}'"
        if ingredients_count > 0:
            summary += f" - {ingredients_count} ingredients"
        if instructions_count > 0:
            summary += f", {instructions_count} steps"
        if servings != 'Unknown':
            summary += f", serves {servings}"
        if prep_time != 'Unknown':
            summary += f", prep: {prep_time}"
        
        return summary
    
    def display_search_results(self, results: List[Dict[str, Any]], max_results: int = 10):
        """Display search results in a formatted way"""
        if not results:
            print("No recipes found matching your search.")
            return
        
        print(f"\nFound {len(results)} recipe(s):")
        print("-" * 60)
        
        for i, recipe in enumerate(results[:max_results]):
            print(f"{i+1}. {self.get_recipe_summary(recipe)}")
            
            # Show first few ingredients
            ingredients = recipe.get('ingredients', [])[:3]
            if ingredients:
                print(f"   Ingredients: {', '.join(ingredients[:3])}")
                if len(recipe.get('ingredients', [])) > 3:
                    print(f"   ... and {len(recipe.get('ingredients', [])) - 3} more")
            
            print(f"   URL: {recipe.get('url', 'No URL')}")
            print()
        
        if len(results) > max_results:
            print(f"... and {len(results) - max_results} more results")

def main():
    """Interactive recipe search demo"""
    searcher = RecipeSearcher('pacific_northwest_recipes_filtered.json')
    
    if not searcher.recipes:
        print("No recipes loaded. Please check the JSON file.")
        return
    
    print("=== Pacific Northwest Recipe Search Tool ===")
    print(f"Loaded {len(searcher.recipes)} recipes")
    print("\nSearch options:")
    print("1. Search by title")
    print("2. Search by ingredient") 
    print("3. Search by cooking method")
    print("4. General search")
    print("5. Search by dietary type")
    print("6. Run demo searches")
    print("0. Exit")
    
    while True:
        try:
            choice = input("\nEnter your choice (0-6): ").strip()
            
            if choice == '0':
                print("Goodbye!")
                break
            elif choice == '1':
                query = input("Enter title to search for: ").strip()
                results = searcher.search_by_title(query)
                searcher.display_search_results(results)
            elif choice == '2':
                ingredient = input("Enter ingredient to search for: ").strip()
                results = searcher.search_by_ingredient(ingredient)
                searcher.display_search_results(results)
            elif choice == '3':
                method = input("Enter cooking method (baked, grilled, etc.): ").strip()
                results = searcher.search_by_cooking_method(method)
                searcher.display_search_results(results)
            elif choice == '4':
                query = input("Enter search terms: ").strip()
                results = searcher.search_general(query)
                searcher.display_search_results(results)
            elif choice == '5':
                dietary = input("Enter dietary type (seafood, dessert, vegetarian, etc.): ").strip()
                results = searcher.search_by_dietary_needs(dietary)
                searcher.display_search_results(results)
            elif choice == '6':
                run_demo_searches(searcher)
            else:
                print("Invalid choice. Please try again.")
                
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}")

def run_demo_searches(searcher: RecipeSearcher):
    """Run demonstration searches to show search capabilities"""
    print("\n=== DEMO: Search Capabilities ===")
    
    demo_searches = [
        ("Salmon recipes", "general", "salmon"),
        ("Blackberry desserts", "general", "blackberry dessert"),
        ("Crab dishes", "ingredient", "crab"),
        ("Baked recipes", "cooking_method", "baked"),
        ("Grilled dishes", "cooking_method", "grilled"),
        ("Seafood recipes", "dietary", "seafood"),
        ("Dessert recipes", "dietary", "dessert"),
        ("Sauce recipes", "dietary", "sauce"),
        ("Hazelnut recipes", "ingredient", "hazelnut"),
        ("Mousse recipes", "title", "mousse")
    ]
    
    for description, search_type, query in demo_searches:
        print(f"\n--- {description} ---")
        
        if search_type == "general":
            results = searcher.search_general(query)
        elif search_type == "ingredient":
            results = searcher.search_by_ingredient(query)
        elif search_type == "cooking_method":
            results = searcher.search_by_cooking_method(query)
        elif search_type == "dietary":
            results = searcher.search_by_dietary_needs(query)
        elif search_type == "title":
            results = searcher.search_by_title(query)
        else:
            results = []
        
        if results:
            print(f"Found {len(results)} recipe(s):")
            for i, recipe in enumerate(results[:3]):  # Show top 3
                print(f"  {i+1}. {searcher.get_recipe_summary(recipe)}")
            if len(results) > 3:
                print(f"  ... and {len(results) - 3} more")
        else:
            print("No recipes found.")

if __name__ == "__main__":
    main()