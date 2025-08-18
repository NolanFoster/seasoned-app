#!/usr/bin/env python3
"""
Test script for the updated crawler with JSON-LD recipe detection
"""

from recipe_crawler import RecipeCrawler
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_jsonld_crawler():
    """Test the crawler with a site that has JSON-LD recipe data"""
    
    # Initialize crawler
    crawler = RecipeCrawler()
    
    # Test URL that has JSON-LD recipe data
    test_url = "https://whatscookingamerica.net/bksalpiccata.htm"
    
    print("🧪 Testing JSON-LD Recipe Detection")
    print("=" * 60)
    
    # Test 1: Check if the crawler can detect JSON-LD recipes
    print(f"\n1. Testing JSON-LD detection for: {test_url}")
    
    try:
        # Fetch the page content
        import requests
        response = requests.get(test_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        if response.status_code == 200:
            # Check if JSON-LD recipe is detected
            has_recipe = crawler._has_json_ld_recipe(response.text)
            print(f"   JSON-LD Recipe detected: {'✅ Yes' if has_recipe else '❌ No'}")
            
            if has_recipe:
                print("   ✅ The crawler can now find this recipe!")
            else:
                print("   ❌ No JSON-LD recipe found")
        else:
            print(f"   ❌ Failed to fetch page: {response.status_code}")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test 2: Test the new crawl-and-scrape functionality
    print(f"\n2. Testing crawl-and-scrape functionality")
    print("   This will crawl the site and automatically scrape found recipes")
    
    try:
        # Use a smaller limit for testing
        results = crawler.crawl_and_scrape_recipes(
            base_url="https://whatscookingamerica.net",
            limit=5,  # Only find 5 recipes for testing
            save=False,  # Don't save to KV for testing
            avoid_overwrite=True
        )
        
        print("   ✅ Crawl-and-scrape completed successfully!")
        
        # Show results
        summary = results.get('summary', {})
        print(f"   📊 Results:")
        print(f"      URLs found: {summary.get('total_urls_found', 0)}")
        print(f"      Recipes scraped: {summary.get('total_scraped', 0)}")
        print(f"      Successful: {summary.get('successful_scrapes', 0)}")
        print(f"      Failed: {summary.get('failed_scrapes', 0)}")
        print(f"      Success rate: {summary.get('success_rate', 0):.1f}%")
        
        # Show some example recipes
        scrape_results = results.get('scrape_results', [])
        if scrape_results:
            print(f"\n   📋 Example recipes found:")
            for i, result in enumerate(scrape_results[:3]):  # Show first 3
                if result.get('success'):
                    recipe = result.get('recipe', {})
                    name = recipe.get('name', 'Unknown')
                    print(f"      {i+1}. {name}")
                else:
                    print(f"      {i+1}. Failed to scrape")
        
    except Exception as e:
        print(f"   ❌ Error during crawl-and-scrape: {e}")
    
    print("\n" + "=" * 60)
    print("🎉 Test completed!")
    print("\nTo use the new functionality:")
    print("python recipe_crawler.py --base-url https://whatscookingamerica.net --crawl-and-scrape --crawl-limit 10")

if __name__ == "__main__":
    test_jsonld_crawler()
