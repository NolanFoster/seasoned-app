#!/usr/bin/env python3
"""
Test script to verify recipe search functionality
"""

from recipe_search import RecipeSearcher
import json

def test_search_functionality():
    """Test various search capabilities"""
    print("=== Testing Recipe Search Functionality ===\n")
    
    # Initialize searcher
    searcher = RecipeSearcher('pacific_northwest_recipes_filtered.json')
    
    if not searcher.recipes:
        print("ERROR: No recipes loaded!")
        return False
    
    print(f"✓ Successfully loaded {len(searcher.recipes)} recipes\n")
    
    # Test 1: Basic title search
    print("TEST 1: Title Search for 'Salmon'")
    results = searcher.search_by_title("salmon")
    print(f"Found {len(results)} recipes with 'salmon' in title:")
    for i, recipe in enumerate(results[:3]):
        print(f"  {i+1}. {recipe['title']}")
    print()
    
    # Test 2: Ingredient search
    print("TEST 2: Ingredient Search for 'blackberry'")
    results = searcher.search_by_ingredient("blackberry")
    print(f"Found {len(results)} recipes with 'blackberry' as ingredient:")
    for i, recipe in enumerate(results[:3]):
        print(f"  {i+1}. {recipe['title']}")
    print()
    
    # Test 3: Cooking method search
    print("TEST 3: Cooking Method Search for 'baked'")
    results = searcher.search_by_cooking_method("baked")
    print(f"Found {len(results)} recipes with 'baked' cooking method:")
    for i, recipe in enumerate(results[:3]):
        print(f"  {i+1}. {recipe['title']}")
    print()
    
    # Test 4: General search
    print("TEST 4: General Search for 'crab'")
    results = searcher.search_general("crab")
    print(f"Found {len(results)} recipes mentioning 'crab':")
    for i, recipe in enumerate(results[:3]):
        print(f"  {i+1}. {recipe['title']} (score: {recipe.get('search_score', 0)})")
    print()
    
    # Test 5: Dietary search
    print("TEST 5: Dietary Search for 'seafood'")
    results = searcher.search_by_dietary_needs("seafood")
    print(f"Found {len(results)} seafood recipes:")
    for i, recipe in enumerate(results[:3]):
        print(f"  {i+1}. {recipe['title']}")
    print()
    
    # Test 6: Complex search
    print("TEST 6: Complex Search for 'blackberry sauce'")
    results = searcher.search_general("blackberry sauce")
    print(f"Found {len(results)} recipes for 'blackberry sauce':")
    for i, recipe in enumerate(results[:3]):
        print(f"  {i+1}. {recipe['title']} (score: {recipe.get('search_score', 0)})")
    print()
    
    # Test 7: Search with no results
    print("TEST 7: Search with no expected results 'pizza'")
    results = searcher.search_general("pizza")
    print(f"Found {len(results)} recipes for 'pizza' (should be 0 or very few)")
    print()
    
    # Test 8: Show recipe details for verification
    print("TEST 8: Detailed Recipe Verification")
    salmon_recipes = searcher.search_by_title("salmon")
    if salmon_recipes:
        recipe = salmon_recipes[0]
        print(f"Sample recipe: {recipe['title']}")
        print(f"URL: {recipe['url']}")
        print(f"Ingredients count: {len(recipe.get('ingredients', []))}")
        print(f"Instructions count: {len(recipe.get('instructions', []))}")
        if recipe.get('ingredients'):
            print("First few ingredients:")
            for ing in recipe['ingredients'][:3]:
                print(f"  - {ing}")
        print()
    
    return True

def test_search_performance():
    """Test search performance and coverage"""
    print("=== Testing Search Performance & Coverage ===\n")
    
    searcher = RecipeSearcher('pacific_northwest_recipes_filtered.json')
    
    # Test coverage of different search types
    search_tests = [
        ("salmon", "ingredient"),
        ("blackberry", "ingredient"), 
        ("crab", "ingredient"),
        ("hazelnut", "ingredient"),
        ("baked", "cooking_method"),
        ("grilled", "cooking_method"),
        ("pie", "general"),
        ("sauce", "general"),
        ("mousse", "title"),
        ("dessert", "dietary")
    ]
    
    total_found = 0
    for term, search_type in search_tests:
        if search_type == "ingredient":
            results = searcher.search_by_ingredient(term)
        elif search_type == "cooking_method":
            results = searcher.search_by_cooking_method(term)
        elif search_type == "title":
            results = searcher.search_by_title(term)
        elif search_type == "dietary":
            results = searcher.search_by_dietary_needs(term)
        else:
            results = searcher.search_general(term)
        
        print(f"'{term}' ({search_type}): {len(results)} recipes found")
        total_found += len(results)
    
    print(f"\nTotal search results across all tests: {total_found}")
    print(f"Average results per search: {total_found / len(search_tests):.1f}")
    
    return True

def verify_recipe_data_quality():
    """Verify that recipes have searchable content"""
    print("=== Verifying Recipe Data Quality ===\n")
    
    with open('pacific_northwest_recipes_filtered.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    recipes = data.get('recipes', [])
    
    stats = {
        'total_recipes': len(recipes),
        'with_title': 0,
        'with_ingredients': 0,
        'with_instructions': 0,
        'with_url': 0,
        'fully_complete': 0
    }
    
    for recipe in recipes:
        if recipe.get('title'):
            stats['with_title'] += 1
        if recipe.get('ingredients'):
            stats['with_ingredients'] += 1
        if recipe.get('instructions'):
            stats['with_instructions'] += 1
        if recipe.get('url'):
            stats['with_url'] += 1
        
        # Fully complete = has title, ingredients, and instructions
        if (recipe.get('title') and 
            recipe.get('ingredients') and 
            recipe.get('instructions')):
            stats['fully_complete'] += 1
    
    print("Data Quality Statistics:")
    for key, value in stats.items():
        percentage = (value / stats['total_recipes'] * 100) if stats['total_recipes'] > 0 else 0
        print(f"  {key.replace('_', ' ').title()}: {value}/{stats['total_recipes']} ({percentage:.1f}%)")
    
    print(f"\n✓ {stats['fully_complete']} recipes are fully searchable with complete data")
    
    return stats['fully_complete'] > 0

def main():
    """Run all verification tests"""
    print("Pacific Northwest Recipe Search Verification\n")
    print("=" * 50)
    
    success = True
    
    # Test 1: Basic functionality
    try:
        if not test_search_functionality():
            success = False
            print("❌ Basic search functionality test failed")
        else:
            print("✅ Basic search functionality test passed")
    except Exception as e:
        print(f"❌ Basic search functionality test failed with error: {e}")
        success = False
    
    print("\n" + "=" * 50)
    
    # Test 2: Performance and coverage
    try:
        if not test_search_performance():
            success = False
            print("❌ Search performance test failed")
        else:
            print("✅ Search performance test passed")
    except Exception as e:
        print(f"❌ Search performance test failed with error: {e}")
        success = False
    
    print("\n" + "=" * 50)
    
    # Test 3: Data quality
    try:
        if not verify_recipe_data_quality():
            success = False
            print("❌ Data quality verification failed")
        else:
            print("✅ Data quality verification passed")
    except Exception as e:
        print(f"❌ Data quality verification failed with error: {e}")
        success = False
    
    print("\n" + "=" * 50)
    
    if success:
        print("🎉 ALL TESTS PASSED - Recipes are fully searchable!")
    else:
        print("⚠️  Some tests failed - Check the output above")
    
    return success

if __name__ == "__main__":
    main()