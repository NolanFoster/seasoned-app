#!/usr/bin/env python3
"""
Extract Pacific Northwest recipe URLs for use with the recipe scraper worker
"""

import json
import re
from typing import List, Set

def extract_recipe_urls_from_json(json_file: str) -> List[str]:
    """Extract valid recipe URLs from the scraped JSON data"""
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        recipes = data.get('recipes', [])
        valid_urls = []
        
        for recipe in recipes:
            url = recipe.get('url', '')
            
            # Filter out social media and invalid URLs
            if is_valid_recipe_url(url):
                valid_urls.append(url)
        
        # Remove duplicates while preserving order
        unique_urls = []
        seen = set()
        for url in valid_urls:
            if url not in seen:
                unique_urls.append(url)
                seen.add(url)
        
        return unique_urls
        
    except Exception as e:
        print(f"Error reading {json_file}: {e}")
        return []

def is_valid_recipe_url(url: str) -> bool:
    """Check if URL is a valid recipe URL (not social media or navigation)"""
    if not url or not isinstance(url, str):
        return False
    
    # Exclude social media and sharing URLs
    exclude_patterns = [
        'pinterest.com',
        'facebook.com', 
        'twitter.com',
        'yummly.com',
        'mailto:',
        'javascript:',
        '#',
        '/page/',
        '/category/',
        '/tag/',
        '/author/'
    ]
    
    for pattern in exclude_patterns:
        if pattern in url.lower():
            return False
    
    # Must be from whatscookingamerica.net
    if 'whatscookingamerica.net' not in url:
        return False
    
    # Should have some content indicator
    include_patterns = ['.htm', 'recipe', '/']
    if not any(pattern in url.lower() for pattern in include_patterns):
        return False
    
    return True

def discover_pacific_northwest_urls() -> List[str]:
    """Discover Pacific Northwest recipe URLs from the category page"""
    from pacific_northwest_scraper import PacificNorthwestScraper
    
    scraper = PacificNorthwestScraper()
    recipe_links = scraper.get_all_recipe_links()
    
    # Filter to get only valid recipe URLs
    valid_urls = [url for url in recipe_links if is_valid_recipe_url(url)]
    
    return valid_urls

def create_url_list_file(urls: List[str], filename: str = 'pacific_northwest_urls.txt'):
    """Create a text file with URLs for the crawler"""
    with open(filename, 'w', encoding='utf-8') as f:
        for url in urls:
            f.write(f"{url}\n")
    
    print(f"Created {filename} with {len(urls)} URLs")
    return filename

def main():
    """Extract Pacific Northwest URLs for the recipe scraper worker"""
    print("🔗 Extracting Pacific Northwest Recipe URLs")
    print("=" * 50)
    
    # Method 1: Extract from existing scraped data
    print("📄 Extracting URLs from filtered JSON data...")
    json_urls = extract_recipe_urls_from_json('pacific_northwest_recipes_filtered.json')
    print(f"Found {len(json_urls)} URLs from JSON data")
    
    # Method 2: Discover fresh URLs from the category page
    print("\n🌐 Discovering fresh URLs from category page...")
    try:
        fresh_urls = discover_pacific_northwest_urls()
        print(f"Found {len(fresh_urls)} URLs from category page")
    except Exception as e:
        print(f"Error discovering URLs: {e}")
        fresh_urls = []
    
    # Combine and deduplicate
    all_urls = json_urls + fresh_urls
    unique_urls = []
    seen = set()
    
    for url in all_urls:
        if url not in seen and is_valid_recipe_url(url):
            unique_urls.append(url)
            seen.add(url)
    
    print(f"\n📋 Total unique Pacific Northwest recipe URLs: {len(unique_urls)}")
    
    # Create URL file for the crawler
    url_file = create_url_list_file(unique_urls)
    
    # Show sample URLs
    print(f"\n📝 Sample URLs (first 10):")
    for i, url in enumerate(unique_urls[:10], 1):
        print(f"  {i}. {url}")
    
    if len(unique_urls) > 10:
        print(f"  ... and {len(unique_urls) - 10} more URLs")
    
    print(f"\n✅ URL list saved to: {url_file}")
    print(f"🚀 Ready to use with recipe crawler!")
    
    return url_file, unique_urls

if __name__ == "__main__":
    main()