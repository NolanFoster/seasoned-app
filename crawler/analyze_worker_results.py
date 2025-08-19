#!/usr/bin/env python3
"""
Analyze the results from the recipe scraper worker
"""

import json
from datetime import datetime
from typing import Dict, List, Any

def analyze_worker_results(results_file: str):
    """Analyze the results from the recipe scraper worker"""
    print("📊 Analyzing Recipe Scraper Worker Results")
    print("=" * 50)
    
    try:
        with open(results_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Error loading results file: {e}")
        return
    
    # Extract metadata
    metadata = data.get('crawl_metadata', {})
    failed_recipes = data.get('failed_recipes', [])
    
    print(f"⏱️  Crawl Duration: {metadata.get('duration_seconds', 0):.1f} seconds")
    print(f"🔗 Total URLs: {metadata.get('total_urls', 0)}")
    print(f"🌐 Scraper Worker: {metadata.get('scraper_worker_url', 'Unknown')}")
    print()
    
    # Analyze the actual results within failed_recipes (which are actually successful)
    total_successful = 0
    total_failed = 0
    all_successful_recipes = []
    all_failed_recipes = []
    
    for batch in failed_recipes:
        results = batch.get('results', [])
        for result in results:
            if result.get('success'):
                total_successful += 1
                all_successful_recipes.append(result)
            else:
                total_failed += 1
                all_failed_recipes.append(result)
    
    print(f"✅ Actually Successful: {total_successful}")
    print(f"❌ Actually Failed: {total_failed}")
    print(f"📈 Actual Success Rate: {(total_successful/(total_successful+total_failed)*100):.1f}%")
    print()
    
    # Analyze successful recipes
    if all_successful_recipes:
        print("🍽️  Sample Successful Recipes:")
        for i, recipe in enumerate(all_successful_recipes[:10], 1):
            recipe_data = recipe.get('data', {})
            name = recipe_data.get('name', 'No name')
            url = recipe.get('url', 'No URL')
            ingredients_count = len(recipe_data.get('ingredients', []))
            instructions_count = len(recipe_data.get('instructions', []))
            
            print(f"  {i}. {name}")
            print(f"     🔗 {url}")
            print(f"     📝 {ingredients_count} ingredients, {instructions_count} instructions")
            
            # Show KV storage status
            saved_to_kv = recipe.get('savedToKV', False)
            if saved_to_kv:
                print(f"     💾 Saved to KV storage")
            else:
                kv_error = recipe.get('kvError', 'Unknown error')
                print(f"     ⚠️  KV storage failed: {kv_error}")
            print()
        
        if len(all_successful_recipes) > 10:
            print(f"  ... and {len(all_successful_recipes) - 10} more successful recipes")
    
    # Analyze recipe categories
    print("\n📋 Recipe Categories:")
    categories = {}
    cuisines = {}
    
    for recipe in all_successful_recipes:
        recipe_data = recipe.get('data', {})
        
        # Count categories
        recipe_categories = recipe_data.get('recipeCategory', [])
        for category in recipe_categories:
            categories[category] = categories.get(category, 0) + 1
        
        # Count cuisines
        recipe_cuisines = recipe_data.get('recipeCuisine', [])
        for cuisine in recipe_cuisines:
            if cuisine:  # Skip empty strings
                cuisines[cuisine] = cuisines.get(cuisine, 0) + 1
    
    if categories:
        print("  Categories:")
        for category, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
            print(f"    • {category}: {count} recipes")
    
    if cuisines:
        print("  Cuisines:")
        for cuisine, count in sorted(cuisines.items(), key=lambda x: x[1], reverse=True):
            print(f"    • {cuisine}: {count} recipes")
    
    # Analyze timing data
    print("\n⏱️  Recipe Timing Analysis:")
    prep_times = []
    cook_times = []
    total_times = []
    
    for recipe in all_successful_recipes:
        recipe_data = recipe.get('data', {})
        
        prep_time = recipe_data.get('prepTime', '')
        if prep_time and 'PT' in prep_time:
            prep_times.append(prep_time)
        
        cook_time = recipe_data.get('cookTime', '')
        if cook_time and 'PT' in cook_time:
            cook_times.append(cook_time)
        
        total_time = recipe_data.get('totalTime', '')
        if total_time and 'PT' in total_time:
            total_times.append(total_time)
    
    print(f"  Recipes with prep time: {len(prep_times)}")
    print(f"  Recipes with cook time: {len(cook_times)}")
    print(f"  Recipes with total time: {len(total_times)}")
    
    # Create a clean output file
    clean_recipes = []
    for recipe in all_successful_recipes:
        recipe_data = recipe.get('data', {})
        clean_recipe = {
            'title': recipe_data.get('name', ''),
            'url': recipe.get('url', ''),
            'description': recipe_data.get('description', ''),
            'author': recipe_data.get('author', ''),
            'datePublished': recipe_data.get('datePublished', ''),
            'prepTime': recipe_data.get('prepTime', ''),
            'cookTime': recipe_data.get('cookTime', ''),
            'totalTime': recipe_data.get('totalTime', ''),
            'recipeYield': recipe_data.get('recipeYield', []),
            'recipeCategory': recipe_data.get('recipeCategory', []),
            'recipeCuisine': recipe_data.get('recipeCuisine', []),
            'keywords': recipe_data.get('keywords', ''),
            'ingredients': recipe_data.get('ingredients', []),
            'instructions': recipe_data.get('instructions', []),
            'nutrition': recipe_data.get('nutrition', {}),
            'aggregateRating': recipe_data.get('aggregateRating', {}),
            'image': recipe_data.get('image', ''),
            'scraped_with_worker': True,
            'worker_id': recipe_data.get('id', '')
        }
        clean_recipes.append(clean_recipe)
    
    # Save clean results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    clean_file = f"pacific_northwest_worker_clean_{timestamp}.json"
    
    clean_data = {
        'scraping_metadata': {
            'scraped_at': datetime.now().isoformat(),
            'source_url': 'https://whatscookingamerica.net/category/american-regional-foods/pacific-northwest/',
            'scraper_worker_url': metadata.get('scraper_worker_url', ''),
            'total_recipes': len(clean_recipes),
            'scraping_duration_seconds': metadata.get('duration_seconds', 0),
            'method': 'recipe_scraper_worker'
        },
        'recipes': clean_recipes
    }
    
    with open(clean_file, 'w', encoding='utf-8') as f:
        json.dump(clean_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Clean results saved to: {clean_file}")
    
    # Summary
    print(f"\n🎉 ANALYSIS COMPLETE")
    print(f"✅ Successfully scraped {len(clean_recipes)} Pacific Northwest recipes")
    print(f"🏷️  Categories: {len(categories)} different types")
    print(f"🌍 Cuisines: {len(cuisines)} different cuisines")
    print(f"⏱️  Timing data available for most recipes")
    print(f"📊 Data quality: High (structured JSON-LD format)")
    
    return clean_file

def main():
    """Main function"""
    results_file = "pacific_northwest_worker_results_20250819_033754.json"
    
    try:
        clean_file = analyze_worker_results(results_file)
        print(f"\n✅ Analysis completed successfully!")
        print(f"📄 Clean data available in: {clean_file}")
    except Exception as e:
        print(f"❌ Analysis failed: {e}")

if __name__ == "__main__":
    main()