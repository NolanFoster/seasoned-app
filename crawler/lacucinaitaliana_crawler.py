#!/usr/bin/env python3
"""
La Cucina Italiana Recipe Crawler
A specialized crawler for discovering and scraping recipes from lacucinaitaliana.com
"""

import requests
import json
import time
import argparse
import sys
from typing import List, Dict, Any, Optional, Set
from urllib.parse import urlparse, urljoin
import logging
import re
from bs4 import BeautifulSoup
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('lacucinaitaliana_crawler.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class LaCucinaItalianaCrawler:
    def __init__(self, scraper_url: str = "https://recipe-scraper.nolanfoster.workers.dev"):
        """
        Initialize the La Cucina Italiana crawler
        
        Args:
            scraper_url: URL of the recipe scraper worker
        """
        self.scraper_url = scraper_url.rstrip('/')
        self.base_url = "https://www.lacucinaitaliana.com"
        self.recipes_url = "https://www.lacucinaitaliana.com/recipes"
        
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        # URL tracking
        self.discovered_urls: Set[str] = set()
        self.recipe_urls: Set[str] = set()
        self.successful_urls: List[str] = []
        self.failed_urls: List[str] = []
        self.skipped_urls: List[str] = []
        
    def health_check(self) -> bool:
        """
        Check if the scraper is healthy
        
        Returns:
            bool: True if healthy, False otherwise
        """
        try:
            response = self.session.get(f"{self.scraper_url}/health", timeout=10)
            if response.status_code == 200:
                health_data = response.json()
                logger.info(f"Scraper health: {health_data.get('status', 'unknown')}")
                return health_data.get('status') == 'healthy'
            else:
                logger.error(f"Health check failed with status {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return False
    
    def discover_recipe_urls(self, max_pages: int = 50, max_recipes: int = 500) -> Set[str]:
        """
        Discover recipe URLs from La Cucina Italiana recipes page
        
        Args:
            max_pages: Maximum number of pages to crawl
            max_recipes: Maximum number of recipe URLs to discover
            
        Returns:
            Set of discovered recipe URLs
        """
        logger.info(f"Starting recipe discovery from {self.recipes_url}")
        
        page = 1
        discovered_count = 0
        
        while page <= max_pages and discovered_count < max_recipes:
            try:
                # Construct page URL
                if page == 1:
                    page_url = self.recipes_url
                else:
                    page_url = f"{self.recipes_url}?page={page}"
                
                logger.info(f"Discovering recipes from page {page}: {page_url}")
                
                response = self.session.get(page_url, timeout=15)
                if response.status_code != 200:
                    logger.warning(f"Failed to fetch page {page}: HTTP {response.status_code}")
                    break
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Look for recipe links - La Cucina Italiana typically uses article tags with recipe links
                recipe_links = []
                
                # Method 1: Look for article tags with recipe links
                articles = soup.find_all('article')
                for article in articles:
                    links = article.find_all('a', href=True)
                    for link in links:
                        href = link['href']
                        if self._is_recipe_url(href):
                            recipe_links.append(urljoin(self.base_url, href))
                
                # Method 2: Look for recipe-specific CSS classes or patterns
                recipe_elements = soup.find_all(['a', 'div'], class_=re.compile(r'recipe|card|item', re.I))
                for element in recipe_elements:
                    if element.name == 'a' and element.get('href'):
                        href = element['href']
                        if self._is_recipe_url(href):
                            recipe_links.append(urljoin(self.base_url, href))
                    elif element.name == 'div':
                        # Look for links within recipe elements
                        links = element.find_all('a', href=True)
                        for link in links:
                            href = link['href']
                            if self._is_recipe_url(href):
                                recipe_links.append(urljoin(self.base_url, href))
                
                # Method 3: Look for any links that might be recipes
                all_links = soup.find_all('a', href=True)
                for link in all_links:
                    href = link['href']
                    if self._is_recipe_url(href):
                        recipe_links.append(urljoin(self.base_url, href))
                
                # Remove duplicates and add to discovered URLs
                new_urls = set(recipe_links) - self.discovered_urls
                self.discovered_urls.update(new_urls)
                
                logger.info(f"Page {page}: Found {len(recipe_links)} links, {len(new_urls)} new")
                
                if not new_urls:
                    logger.info(f"No new recipe URLs found on page {page}, stopping discovery")
                    break
                
                discovered_count += len(new_urls)
                
                # Check if we've reached the limit
                if discovered_count >= max_recipes:
                    logger.info(f"Reached maximum recipe limit ({max_recipes})")
                    break
                
                page += 1
                
                # Be respectful with delays
                time.sleep(2)
                
            except Exception as e:
                logger.error(f"Error discovering recipes from page {page}: {e}")
                break
        
        logger.info(f"Recipe discovery complete. Found {len(self.discovered_urls)} total recipe URLs")
        return self.discovered_urls
    
    def _is_recipe_url(self, href: str) -> bool:
        """
        Check if a URL is likely a recipe URL
        
        Args:
            href: URL to check
            
        Returns:
            bool: True if likely a recipe URL
        """
        if not href:
            return False
        
        # Convert to lowercase for pattern matching
        href_lower = href.lower()
        
        # Skip non-http(s) URLs
        if not href_lower.startswith(('http://', 'https://', '/')):
            return False
        
        # Skip obvious non-recipe URLs
        skip_patterns = [
            '/search', '/category', '/tag', '/author', '/about', '/contact',
            '/privacy', '/terms', '/advertise', '/subscribe', '/newsletter',
            '.jpg', '.jpeg', '.png', '.gif', '.pdf', '.xml', '.rss'
        ]
        
        for pattern in skip_patterns:
            if pattern in href_lower:
                return False
        
        # Look for recipe indicators
        recipe_patterns = [
            '/recipe/', '/recipes/', '/ricetta/', '/ricette/',
            '/cook/', '/cooking/', '/food/', '/dish/',
            '/pasta/', '/pizza/', '/dessert/', '/main-course/',
            '/antipasto/', '/primo/', '/secondo/', '/contorno/', '/dolce/'
        ]
        
        for pattern in recipe_patterns:
            if pattern in href_lower:
                return True
        
        # Check if URL contains recipe-like words
        recipe_words = ['recipe', 'ricetta', 'cook', 'food', 'dish', 'meal']
        for word in recipe_words:
            if word in href_lower:
                return True
        
        return False
    
    def scrape_recipe(self, url: str) -> Dict[str, Any]:
        """
        Scrape a single recipe using the recipe scraper
        
        Args:
            url: Recipe URL to scrape
            
        Returns:
            Dict containing the scrape result
        """
        try:
            logger.info(f"Scraping recipe: {url}")
            
            payload = {'url': url}
            response = self.session.post(f"{self.scraper_url}/clip", json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                
                # Check if we got valid recipe data
                if 'name' in result and result.get('name'):
                    logger.info(f"Successfully scraped recipe: {result.get('name', 'Unknown')}")
                    self.successful_urls.append(url)
                    return {
                        'success': True,
                        'url': url,
                        'data': result
                    }
                else:
                    error_msg = result.get('error', 'No recipe data returned')
                    logger.warning(f"Failed to scrape {url}: {error_msg}")
                    self.failed_urls.append(url)
                    return {
                        'success': False,
                        'url': url,
                        'error': error_msg
                    }
            else:
                error_msg = f"HTTP {response.status_code}"
                logger.error(f"Failed to scrape {url}: {error_msg}")
                self.failed_urls.append(url)
                return {
                    'success': False,
                    'url': url,
                    'error': error_msg
                }
                
        except Exception as e:
            logger.error(f"Error scraping {url}: {e}")
            self.failed_urls.append(url)
            return {
                'success': False,
                'url': url,
                'error': str(e)
            }
    
    def scrape_all_recipes(self, delay: float = 1.0) -> List[Dict[str, Any]]:
        """
        Scrape all discovered recipe URLs
        
        Args:
            delay: Delay between requests in seconds
            
        Returns:
            List of scrape results
        """
        if not self.discovered_urls:
            logger.warning("No recipe URLs discovered. Run discover_recipe_urls() first.")
            return []
        
        logger.info(f"Starting to scrape {len(self.discovered_urls)} recipes")
        
        results = []
        total = len(self.discovered_urls)
        
        for i, url in enumerate(self.discovered_urls, 1):
            logger.info(f"Scraping recipe {i}/{total}: {url}")
            
            result = self.scrape_recipe(url)
            results.append(result)
            
            # Progress update
            if i % 10 == 0:
                success_rate = len(self.successful_urls) / i * 100
                logger.info(f"Progress: {i}/{total} ({success_rate:.1f}% success rate)")
            
            # Delay between requests
            if i < total:  # Don't delay after the last request
                time.sleep(delay)
        
        logger.info(f"Recipe scraping complete. {len(self.successful_urls)} successful, {len(self.failed_urls)} failed")
        return results
    
    def save_results(self, results: List[Dict[str, Any]], filename: str = None) -> str:
        """
        Save scrape results to a JSON file
        
        Args:
            results: List of scrape results
            filename: Output filename (auto-generated if None)
            
        Returns:
            Filename where results were saved
        """
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"lacucinaitaliana_results_{timestamp}.json"
        
        output_data = {
            'metadata': {
                'crawler': 'La Cucina Italiana Crawler',
                'timestamp': datetime.now().isoformat(),
                'base_url': self.base_url,
                'total_discovered': len(self.discovered_urls),
                'total_scraped': len(results),
                'successful': len(self.successful_urls),
                'failed': len(self.failed_urls)
            },
            'results': results,
            'urls': {
                'discovered': list(self.discovered_urls),
                'successful': self.successful_urls,
                'failed': self.failed_urls
            }
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Results saved to {filename}")
        return filename
    
    def print_summary(self):
        """Print a summary of the crawling operation"""
        print("\n" + "="*60)
        print("LA CUCINA ITALIANA CRAWLER SUMMARY")
        print("="*60)
        print(f"Base URL: {self.base_url}")
        print(f"Total URLs discovered: {len(self.discovered_urls)}")
        print(f"Total recipes scraped: {len(self.successful_urls) + len(self.failed_urls)}")
        print(f"Successful scrapes: {len(self.successful_urls)}")
        print(f"Failed scrapes: {len(self.failed_urls)}")
        print(f"Success rate: {len(self.successful_urls) / max(1, len(self.successful_urls) + len(self.failed_urls)) * 100:.1f}%")
        
        if self.successful_urls:
            print(f"\nSample successful recipes:")
            for url in self.successful_urls[:5]:
                print(f"  - {url}")
        
        if self.failed_urls:
            print(f"\nSample failed URLs:")
            for url in self.failed_urls[:5]:
                print(f"  - {url}")
        
        print("="*60)

def main():
    parser = argparse.ArgumentParser(description='La Cucina Italiana Recipe Crawler')
    parser.add_argument('--scraper-url', default='https://recipe-scraper.nolanfoster.workers.dev',
                       help='URL of the recipe scraper worker')
    parser.add_argument('--max-pages', type=int, default=50,
                       help='Maximum number of pages to crawl for recipe discovery')
    parser.add_argument('--max-recipes', type=int, default=500,
                       help='Maximum number of recipe URLs to discover')
    parser.add_argument('--delay', type=float, default=1.0,
                       help='Delay between requests in seconds')
    parser.add_argument('--output', help='Output filename for results')
    parser.add_argument('--discover-only', action='store_true',
                       help='Only discover URLs, don\'t scrape recipes')
    parser.add_argument('--health-check', action='store_true',
                       help='Perform health check before crawling')
    
    args = parser.parse_args()
    
    # Initialize crawler
    crawler = LaCucinaItalianaCrawler(args.scraper_url)
    
    # Health check if requested
    if args.health_check:
        if not crawler.health_check():
            logger.error("Recipe scraper is not healthy. Exiting.")
            sys.exit(1)
        logger.info("Recipe scraper health check passed.")
    
    try:
        # Discover recipe URLs
        logger.info("Starting recipe discovery...")
        discovered_urls = crawler.discover_recipe_urls(args.max_pages, args.max_recipes)
        
        if not discovered_urls:
            logger.warning("No recipe URLs discovered. Exiting.")
            return
        
        logger.info(f"Discovered {len(discovered_urls)} recipe URLs")
        
        if args.discover_only:
            # Save discovered URLs only
            output_data = {
                'metadata': {
                    'crawler': 'La Cucina Italiana Crawler',
                    'timestamp': datetime.now().isoformat(),
                    'base_url': crawler.base_url,
                    'total_discovered': len(discovered_urls),
                    'mode': 'discovery_only'
                },
                'urls': list(discovered_urls)
            }
            
            filename = args.output or f"lacucinaitaliana_urls_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Discovered URLs saved to {filename}")
            return
        
        # Scrape all discovered recipes
        logger.info("Starting recipe scraping...")
        results = crawler.scrape_all_recipes(args.delay)
        
        # Save results
        filename = crawler.save_results(results, args.output)
        
        # Print summary
        crawler.print_summary()
        
        logger.info(f"All results saved to {filename}")
        
    except KeyboardInterrupt:
        logger.info("Crawling interrupted by user")
        if crawler.discovered_urls:
            crawler.print_summary()
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()