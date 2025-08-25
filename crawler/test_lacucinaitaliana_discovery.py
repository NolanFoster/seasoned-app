#!/usr/bin/env python3
"""
Test script to discover recipe URLs from La Cucina Italiana
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from lacucinaitaliana_crawler import LaCucinaItalianaCrawler

def main():
    print("Testing La Cucina Italiana recipe discovery...")
    
    # Initialize crawler
    crawler = LaCucinaItalianaCrawler()
    
    # Health check
    print("Checking recipe scraper health...")
    if not crawler.health_check():
        print("Recipe scraper is not healthy. Exiting.")
        return
    
    print("Recipe scraper is healthy. Starting discovery...")
    
    # Discover recipe URLs (limit to first 5 pages and 100 recipes for testing)
    discovered_urls = crawler.discover_recipe_urls(max_pages=5, max_recipes=100)
    
    print(f"\nDiscovery complete!")
    print(f"Total URLs discovered: {len(discovered_urls)}")
    
    if discovered_urls:
        print("\nSample discovered URLs:")
        for i, url in enumerate(list(discovered_urls)[:10], 1):
            print(f"{i:2d}. {url}")
        
        if len(discovered_urls) > 10:
            print(f"... and {len(discovered_urls) - 10} more")
        
        # Save discovered URLs
        output_data = {
            'metadata': {
                'crawler': 'La Cucina Italiana Crawler (Test)',
                'timestamp': crawler.discovered_urls,
                'base_url': crawler.base_url,
                'total_discovered': len(discovered_urls),
                'mode': 'discovery_test'
            },
            'urls': list(discovered_urls)
        }
        
        filename = "lacucinaitaliana_discovered_urls_test.json"
        import json
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"\nDiscovered URLs saved to {filename}")
    else:
        print("No recipe URLs discovered. This might indicate:")
        print("- The site structure has changed")
        print("- The site requires JavaScript to load content")
        print("- The site has anti-bot measures")
        print("- Network connectivity issues")

if __name__ == "__main__":
    main()