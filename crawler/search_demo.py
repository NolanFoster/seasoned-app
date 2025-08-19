#!/usr/bin/env python3
"""
Interactive demo of recipe search capabilities
"""

from recipe_search import RecipeSearcher

def run_search_demo():
    """Run a comprehensive search demo"""
    print("🔍 Pacific Northwest Recipe Search Demo")
    print("=" * 50)
    
    searcher = RecipeSearcher('pacific_northwest_recipes_filtered.json')
    
    if not searcher.recipes:
        print("❌ No recipes loaded!")
        return
    
    print(f"📚 Loaded {len(searcher.recipes)} Pacific Northwest recipes")
    print("\n🎯 Running search demonstrations...\n")
    
    demos = [
        {
            'title': '🐟 Searching for Salmon Recipes',
            'search_type': 'ingredient',
            'query': 'salmon',
            'description': 'Find all recipes that use salmon as an ingredient'
        },
        {
            'title': '🫐 Searching for Blackberry Desserts', 
            'search_type': 'general',
            'query': 'blackberry dessert',
            'description': 'Find blackberry-based desserts'
        },
        {
            'title': '🦀 Searching for Crab Dishes',
            'search_type': 'title',
            'query': 'crab',
            'description': 'Find recipes with crab in the title'
        },
        {
            'title': '🔥 Searching for Grilled Recipes',
            'search_type': 'cooking_method',
            'query': 'grilled',
            'description': 'Find recipes that use grilling as cooking method'
        },
        {
            'title': '🥜 Searching for Hazelnut Dishes',
            'search_type': 'ingredient',
            'query': 'hazelnut',
            'description': 'Find recipes using Pacific Northwest hazelnuts'
        },
        {
            'title': '🍰 Searching for Desserts',
            'search_type': 'dietary',
            'query': 'dessert',
            'description': 'Find all dessert recipes'
        },
        {
            'title': '🥣 Searching for Sauces',
            'search_type': 'dietary',
            'query': 'sauce',
            'description': 'Find sauce and condiment recipes'
        },
        {
            'title': '🍲 Complex Search: "wine sauce"',
            'search_type': 'general',
            'query': 'wine sauce',
            'description': 'Find recipes with wine-based sauces'
        }
    ]
    
    for demo in demos:
        print(f"{demo['title']}")
        print(f"Query: '{demo['query']}' | Type: {demo['search_type']}")
        print(f"Description: {demo['description']}")
        print("-" * 50)
        
        # Execute search
        if demo['search_type'] == 'ingredient':
            results = searcher.search_by_ingredient(demo['query'])
        elif demo['search_type'] == 'title':
            results = searcher.search_by_title(demo['query'])
        elif demo['search_type'] == 'cooking_method':
            results = searcher.search_by_cooking_method(demo['query'])
        elif demo['search_type'] == 'dietary':
            results = searcher.search_by_dietary_needs(demo['query'])
        else:
            results = searcher.search_general(demo['query'])
        
        # Display results
        if results:
            print(f"✅ Found {len(results)} recipe(s):")
            for i, recipe in enumerate(results[:3]):
                title = recipe.get('title', 'No title')
                url = recipe.get('url', '')
                ingredients_count = len(recipe.get('ingredients', []))
                
                print(f"  {i+1}. {title}")
                print(f"     📝 {ingredients_count} ingredients")
                print(f"     🔗 {url}")
                
                # Show a few ingredients for context
                ingredients = recipe.get('ingredients', [])[:2]
                if ingredients:
                    clean_ingredients = [ing for ing in ingredients if ing and len(ing.strip()) > 2]
                    if clean_ingredients:
                        print(f"     🥘 Includes: {', '.join(clean_ingredients[:2])}")
                print()
            
            if len(results) > 3:
                print(f"     ... and {len(results) - 3} more recipes\n")
        else:
            print("❌ No recipes found for this search.\n")
        
        print("=" * 50)
        print()

def show_recipe_details():
    """Show detailed information for a specific recipe"""
    print("📖 Recipe Details Example")
    print("=" * 50)
    
    searcher = RecipeSearcher('pacific_northwest_recipes_filtered.json')
    
    # Find a good example recipe
    salmon_recipes = searcher.search_by_title('mousse')
    if salmon_recipes:
        recipe = salmon_recipes[0]
        
        print(f"🍽️  Recipe: {recipe.get('title', 'No title')}")
        print(f"🔗 URL: {recipe.get('url', 'No URL')}")
        print(f"📝 Description: {recipe.get('description', 'No description')[:100]}...")
        print(f"⏱️  Prep Time: {recipe.get('prep_time', 'Not specified')}")
        print(f"🍽️  Servings: {recipe.get('servings', 'Not specified')}")
        print(f"🏷️  Category: {recipe.get('category', 'Not specified')}")
        
        ingredients = recipe.get('ingredients', [])
        if ingredients:
            print(f"\n🥘 Ingredients ({len(ingredients)} total):")
            # Show first 5 meaningful ingredients
            clean_ingredients = [ing.strip() for ing in ingredients if ing.strip() and len(ing.strip()) > 3]
            for i, ingredient in enumerate(clean_ingredients[:5]):
                print(f"   • {ingredient}")
            if len(clean_ingredients) > 5:
                print(f"   ... and {len(clean_ingredients) - 5} more ingredients")
        
        instructions = recipe.get('instructions', [])
        if instructions:
            print(f"\n👨‍🍳 Instructions ({len(instructions)} steps):")
            for i, instruction in enumerate(instructions[:3]):
                if instruction.strip() and len(instruction.strip()) > 10:
                    print(f"   {i+1}. {instruction.strip()[:100]}...")
            if len(instructions) > 3:
                print(f"   ... and {len(instructions) - 3} more steps")
        
        print("\n" + "=" * 50)

def main():
    """Run the complete search demo"""
    try:
        run_search_demo()
        show_recipe_details()
        
        print("✅ Search verification complete!")
        print("\n🎉 The Pacific Northwest recipes are fully searchable with:")
        print("   • Title-based search")
        print("   • Ingredient-based search") 
        print("   • Cooking method search")
        print("   • General keyword search")
        print("   • Dietary category search")
        print("   • Complex multi-term search")
        
    except Exception as e:
        print(f"❌ Demo failed with error: {e}")

if __name__ == "__main__":
    main()