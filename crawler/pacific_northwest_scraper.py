#!/usr/bin/env python3
"""
Pacific Northwest Recipe Scraper for What's Cooking America
Scrapes recipes from https://whatscookingamerica.net/category/american-regional-foods/pacific-northwest/
"""

import requests
import json
import time
import sys
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, urljoin, parse_qs
import logging
from bs4 import BeautifulSoup
import re
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('pacific_northwest_scraper.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class PacificNorthwestScraper:
    def __init__(self):
        """Initialize the Pacific Northwest recipe scraper"""
        self.base_url = "https://whatscookingamerica.net"
        self.category_url = "https://whatscookingamerica.net/category/american-regional-foods/pacific-northwest/"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        })
        
        self.recipes = []
        self.recipe_links = []
        self.failed_urls = []
        
    def get_page_content(self, url: str, max_retries: int = 3) -> Optional[BeautifulSoup]:
        """Get page content with retries"""
        for attempt in range(max_retries):
            try:
                logger.info(f"Fetching URL: {url} (attempt {attempt + 1})")
                response = self.session.get(url, timeout=30)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                return soup
                
            except requests.exceptions.RequestException as e:
                logger.warning(f"Attempt {attempt + 1} failed for {url}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts")
                    return None
                    
    def extract_recipe_links_from_page(self, soup: BeautifulSoup, page_url: str) -> List[str]:
        """Extract recipe links from a category page"""
        links = []
        
        # Look for recipe links in various common selectors
        selectors = [
            'article h2 a',  # Common WordPress theme structure
            '.entry-title a',  # Entry title links
            'h1 a', 'h2 a', 'h3 a',  # Header links
            '.recipe-title a',  # Recipe-specific titles
            'a[href*="whatscookingamerica.net"]'  # Any internal links
        ]
        
        for selector in selectors:
            elements = soup.select(selector)
            for element in elements:
                href = element.get('href')
                if href:
                    # Convert relative URLs to absolute
                    full_url = urljoin(page_url, href)
                    
                    # Filter for recipe URLs (exclude category pages, about pages, etc.)
                    if self.is_recipe_url(full_url):
                        links.append(full_url)
        
        # Also look for pagination links to get all pages
        pagination_links = soup.select('.pagination a, .page-numbers a, .next a, a[rel="next"]')
        for link in pagination_links:
            href = link.get('href')
            if href and 'page' in href.lower():
                full_url = urljoin(page_url, href)
                links.append(full_url)
        
        # Remove duplicates while preserving order
        unique_links = []
        seen = set()
        for link in links:
            if link not in seen:
                unique_links.append(link)
                seen.add(link)
        
        return unique_links
    
    def is_recipe_url(self, url: str) -> bool:
        """Determine if a URL is likely a recipe page"""
        # Exclude category pages, pagination, and non-recipe pages
        exclude_patterns = [
            '/category/',
            '/page/',
            '/author/',
            '/tag/',
            '/about',
            '/contact',
            '/privacy',
            '/terms',
            'mailto:',
            '#',
            '.pdf',
            '.jpg', '.jpeg', '.png', '.gif'
        ]
        
        for pattern in exclude_patterns:
            if pattern in url.lower():
                return False
                
        # Include URLs that seem to be recipes
        include_patterns = [
            'whatscookingamerica.net',
            '.htm',
            'recipe'
        ]
        
        return any(pattern in url.lower() for pattern in include_patterns)
    
    def extract_recipe_data(self, soup: BeautifulSoup, url: str) -> Optional[Dict[str, Any]]:
        """Extract recipe data from a recipe page"""
        try:
            recipe = {
                'url': url,
                'scraped_at': datetime.now().isoformat(),
                'title': None,
                'description': None,
                'ingredients': [],
                'instructions': [],
                'prep_time': None,
                'cook_time': None,
                'total_time': None,
                'servings': None,
                'category': 'Pacific Northwest',
                'cuisine': 'American Regional',
                'author': None,
                'image_url': None,
                'nutrition': {},
                'tags': []
            }
            
            # Extract title
            title_selectors = ['h1', '.recipe-title', '.entry-title', 'title']
            for selector in title_selectors:
                title_element = soup.select_one(selector)
                if title_element:
                    recipe['title'] = title_element.get_text().strip()
                    break
            
            # Extract description/summary
            desc_selectors = ['.recipe-summary', '.entry-content p:first-of-type', '.description']
            for selector in desc_selectors:
                desc_element = soup.select_one(selector)
                if desc_element:
                    recipe['description'] = desc_element.get_text().strip()
                    break
            
            # Extract ingredients
            ingredient_selectors = [
                '.recipe-ingredient',
                '.ingredients li',
                '.ingredient',
                'ul li',  # Generic list items
                '.entry-content ul li'
            ]
            
            for selector in ingredient_selectors:
                ingredients = soup.select(selector)
                if ingredients:
                    recipe['ingredients'] = [ing.get_text().strip() for ing in ingredients if ing.get_text().strip()]
                    break
            
            # Extract instructions
            instruction_selectors = [
                '.recipe-instruction',
                '.instructions li',
                '.instruction',
                '.directions li',
                '.method li',
                '.entry-content ol li'
            ]
            
            for selector in instruction_selectors:
                instructions = soup.select(selector)
                if instructions:
                    recipe['instructions'] = [inst.get_text().strip() for inst in instructions if inst.get_text().strip()]
                    break
            
            # If no structured instructions found, look for paragraphs that might contain instructions
            if not recipe['instructions']:
                paragraphs = soup.select('.entry-content p')
                instructions = []
                for p in paragraphs:
                    text = p.get_text().strip()
                    # Look for instruction-like text
                    if any(word in text.lower() for word in ['heat', 'cook', 'bake', 'mix', 'add', 'combine', 'stir', 'serve']):
                        instructions.append(text)
                recipe['instructions'] = instructions
            
            # Extract times and servings
            time_pattern = r'(\d+)\s*(minutes?|mins?|hours?|hrs?)'
            serving_pattern = r'serves?\s*(\d+)|(\d+)\s*servings?'
            
            text_content = soup.get_text()
            
            # Look for time information
            time_matches = re.findall(time_pattern, text_content.lower())
            if time_matches:
                # Try to categorize times
                for match in time_matches[:3]:  # Limit to first 3 matches
                    time_value = int(match[0])
                    time_unit = match[1]
                    
                    if 'prep' in text_content.lower():
                        recipe['prep_time'] = f"{time_value} {time_unit}"
                    elif 'cook' in text_content.lower() or 'bake' in text_content.lower():
                        recipe['cook_time'] = f"{time_value} {time_unit}"
            
            # Look for serving information
            serving_matches = re.findall(serving_pattern, text_content.lower())
            if serving_matches:
                for match in serving_matches:
                    servings = match[0] or match[1]
                    if servings:
                        recipe['servings'] = int(servings)
                        break
            
            # Extract image
            img_selectors = ['.recipe-image img', '.entry-content img:first-of-type', 'img']
            for selector in img_selectors:
                img = soup.select_one(selector)
                if img and img.get('src'):
                    img_url = img.get('src')
                    recipe['image_url'] = urljoin(url, img_url)
                    break
            
            # Extract author if available
            author_selectors = ['.author', '.recipe-author', '.by-author']
            for selector in author_selectors:
                author = soup.select_one(selector)
                if author:
                    recipe['author'] = author.get_text().strip()
                    break
            
            return recipe
            
        except Exception as e:
            logger.error(f"Error extracting recipe data from {url}: {e}")
            return None
    
    def get_all_recipe_links(self) -> List[str]:
        """Get all recipe links from the Pacific Northwest category, including pagination"""
        all_links = []
        visited_pages = set()
        pages_to_visit = [self.category_url]
        
        while pages_to_visit:
            current_page = pages_to_visit.pop(0)
            
            if current_page in visited_pages:
                continue
                
            visited_pages.add(current_page)
            logger.info(f"Processing page: {current_page}")
            
            soup = self.get_page_content(current_page)
            if not soup:
                continue
            
            page_links = self.extract_recipe_links_from_page(soup, current_page)
            
            # Separate recipe links from pagination links
            recipe_links = [link for link in page_links if self.is_recipe_url(link) and '/page/' not in link]
            pagination_links = [link for link in page_links if '/page/' in link and link not in visited_pages]
            
            all_links.extend(recipe_links)
            pages_to_visit.extend(pagination_links)
            
            logger.info(f"Found {len(recipe_links)} recipe links and {len(pagination_links)} pagination links on this page")
            
            # Be respectful to the server
            time.sleep(1)
        
        # Remove duplicates
        unique_links = list(set(all_links))
        logger.info(f"Total unique recipe links found: {len(unique_links)}")
        
        return unique_links
    
    def scrape_recipe(self, url: str) -> Optional[Dict[str, Any]]:
        """Scrape a single recipe"""
        logger.info(f"Scraping recipe: {url}")
        
        soup = self.get_page_content(url)
        if not soup:
            self.failed_urls.append(url)
            return None
        
        recipe_data = self.extract_recipe_data(soup, url)
        if recipe_data and recipe_data.get('title'):
            logger.info(f"Successfully scraped: {recipe_data['title']}")
            return recipe_data
        else:
            logger.warning(f"Failed to extract recipe data from: {url}")
            self.failed_urls.append(url)
            return None
    
    def scrape_all_recipes(self) -> List[Dict[str, Any]]:
        """Scrape all Pacific Northwest recipes"""
        logger.info("Starting Pacific Northwest recipe scraping...")
        
        # Get all recipe links
        self.recipe_links = self.get_all_recipe_links()
        logger.info(f"Found {len(self.recipe_links)} recipe links to scrape")
        
        # Scrape each recipe
        scraped_count = 0
        for i, url in enumerate(self.recipe_links):
            logger.info(f"Progress: {i+1}/{len(self.recipe_links)}")
            
            recipe_data = self.scrape_recipe(url)
            if recipe_data:
                self.recipes.append(recipe_data)
                scraped_count += 1
            
            # Be respectful to the server
            time.sleep(2)
            
            # Save progress every 10 recipes
            if scraped_count > 0 and scraped_count % 10 == 0:
                self.save_results(f"pacific_northwest_recipes_partial_{scraped_count}.json")
        
        logger.info(f"Scraping completed. Successfully scraped {scraped_count} recipes.")
        logger.info(f"Failed URLs: {len(self.failed_urls)}")
        
        return self.recipes
    
    def save_results(self, filename: str = None) -> str:
        """Save scraped results to JSON file"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"pacific_northwest_recipes_{timestamp}.json"
        
        results = {
            'scraped_at': datetime.now().isoformat(),
            'source_url': self.category_url,
            'total_recipes': len(self.recipes),
            'total_links_found': len(self.recipe_links),
            'failed_urls': self.failed_urls,
            'recipes': self.recipes
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Results saved to: {filename}")
        return filename

def main():
    """Main function to run the scraper"""
    scraper = PacificNorthwestScraper()
    
    try:
        # Scrape all recipes
        recipes = scraper.scrape_all_recipes()
        
        # Save results
        filename = scraper.save_results()
        
        print(f"\n=== Scraping Summary ===")
        print(f"Total recipes scraped: {len(recipes)}")
        print(f"Failed URLs: {len(scraper.failed_urls)}")
        print(f"Results saved to: {filename}")
        
        if scraper.failed_urls:
            print("\nFailed URLs:")
            for url in scraper.failed_urls:
                print(f"  - {url}")
        
    except KeyboardInterrupt:
        logger.info("Scraping interrupted by user")
        if scraper.recipes:
            filename = scraper.save_results("pacific_northwest_recipes_interrupted.json")
            print(f"Partial results saved to: {filename}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        if scraper.recipes:
            filename = scraper.save_results("pacific_northwest_recipes_error.json")
            print(f"Partial results saved to: {filename}")

if __name__ == "__main__":
    main()