#!/usr/bin/env python3
"""
Recipe Crawler
A Python script that can pass a list of URLs to the recipe scraper
"""

import requests
import json
import time
import argparse
import sys
from typing import List, Dict, Any
from urllib.parse import urlparse, urljoin
import logging
import re
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('crawler.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class RecipeCrawler:
    def __init__(self, scraper_url: str = "https://recipe-scraper.nolanfoster.workers.dev"):
        """
        Initialize the recipe crawler
        
        Args:
            scraper_url: URL of the recipe scraper worker
        """
        self.scraper_url = scraper_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'RecipeCrawler/1.0',
            'Content-Type': 'application/json'
        })
        
        # URL tracking
        self.attempted_urls = []
        self.successful_urls = []
        self.failed_urls = []
        self.skipped_urls = []
    
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
    
    def scrape_single_recipe(self, url: str, save: bool = True, avoid_overwrite: bool = False) -> Dict[str, Any]:
        """
        Scrape a single recipe
        
        Args:
            url: Recipe URL to scrape
            save: Whether to save to KV storage
            avoid_overwrite: Whether to avoid overwriting existing recipes
            
        Returns:
            Dict containing the scrape result
        """
        try:
            params = {
                'url': url,
                'save': 'true' if save else 'false'
            }
            
            if avoid_overwrite:
                params['avoidOverwrite'] = 'true'
            
            response = self.session.get(f"{self.scraper_url}/scrape", params=params, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                
                # Record the attempt
                if result.get('results') and len(result['results']) > 0:
                    scrape_result = result['results'][0]
                    self.record_url_attempt(
                        url=url,
                        success=scrape_result.get('success', False),
                        error=scrape_result.get('error'),
                        already_exists=scrape_result.get('alreadyExists', False)
                    )
                else:
                    self.record_url_attempt(url=url, success=False, error="No results returned")
                
                return result
            else:
                error_msg = f"HTTP {response.status_code}"
                logger.error(f"Failed to scrape {url}: {error_msg} - {response.text}")
                self.record_url_attempt(url=url, success=False, error=error_msg)
                return {
                    'success': False,
                    'error': error_msg,
                    'url': url
                }
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error scraping {url}: {error_msg}")
            self.record_url_attempt(url=url, success=False, error=error_msg)
            return {
                'success': False,
                'error': error_msg,
                'url': url
            }
    
    def scrape_multiple_recipes(self, urls: List[str], save: bool = True, 
                              avoid_overwrite: bool = False, delay: float = 1.0) -> List[Dict[str, Any]]:
        """
        Scrape multiple recipes with optional delay between requests
        
        Args:
            urls: List of recipe URLs to scrape
            save: Whether to save to KV storage
            avoid_overwrite: Whether to avoid overwriting existing recipes
            delay: Delay between requests in seconds
            
        Returns:
            List of scrape results
        """
        results = []
        
        for i, url in enumerate(urls, 1):
            logger.info(f"Scraping recipe {i}/{len(urls)}: {url}")
            
            result = self.scrape_single_recipe(url, save, avoid_overwrite)
            results.append(result)
            
            # Add delay between requests (except for the last one)
            if i < len(urls) and delay > 0:
                logger.info(f"Waiting {delay} seconds before next request...")
                time.sleep(delay)
        
        return results
    
    def scrape_batch(self, urls: List[str], save: bool = True, 
                    avoid_overwrite: bool = False) -> Dict[str, Any]:
        """
        Scrape multiple recipes in a single batch request
        
        Args:
            urls: List of recipe URLs to scrape
            save: Whether to save to KV storage
            avoid_overwrite: Whether to avoid overwriting existing recipes
            
        Returns:
            Dict containing batch results
        """
        try:
            payload = {
                'urls': urls,
                'save': save,
                'avoidOverwrite': avoid_overwrite
            }
            
            response = self.session.post(f"{self.scraper_url}/scrape", 
                                       json=payload, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                
                # Record attempts for each URL in the batch
                if result.get('results'):
                    for scrape_result in result['results']:
                        url = scrape_result.get('url', 'unknown')
                        self.record_url_attempt(
                            url=url,
                            success=scrape_result.get('success', False),
                            error=scrape_result.get('error'),
                            already_exists=scrape_result.get('alreadyExists', False)
                        )
                
                return result
            else:
                error_msg = f"HTTP {response.status_code}"
                logger.error(f"Batch scrape failed: {error_msg} - {response.text}")
                
                # Record failed attempts for all URLs
                for url in urls:
                    self.record_url_attempt(url=url, success=False, error=error_msg)
                
                return {
                    'success': False,
                    'error': error_msg,
                    'results': []
                }
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Batch scrape error: {error_msg}")
            
            # Record failed attempts for all URLs
            for url in urls:
                self.record_url_attempt(url=url, success=False, error=error_msg)
            
            return {
                'success': False,
                'error': error_msg,
                'results': []
            }
    
    def get_recipe(self, recipe_id: str) -> Dict[str, Any]:
        """
        Get a specific recipe by ID
        
        Args:
            recipe_id: Recipe ID to retrieve
            
        Returns:
            Dict containing the recipe data
        """
        try:
            response = self.session.get(f"{self.scraper_url}/recipes", 
                                      params={'id': recipe_id}, timeout=10)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get recipe {recipe_id}: {response.status_code}")
                return {'error': f"HTTP {response.status_code}"}
                
        except Exception as e:
            logger.error(f"Error getting recipe {recipe_id}: {e}")
            return {'error': str(e)}
    
    def list_recipes(self, limit: int = 50) -> Dict[str, Any]:
        """
        List all stored recipes
        
        Args:
            limit: Maximum number of recipes to return
            
        Returns:
            Dict containing the list of recipes
        """
        try:
            response = self.session.get(f"{self.scraper_url}/recipes", 
                                      params={'limit': limit}, timeout=10)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to list recipes: {response.status_code}")
                return {'error': f"HTTP {response.status_code}"}
                
        except Exception as e:
            logger.error(f"Error listing recipes: {e}")
            return {'error': str(e)}
    
    def delete_recipe(self, recipe_id: str) -> bool:
        """
        Delete a recipe by ID
        
        Args:
            recipe_id: Recipe ID to delete
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            response = self.session.delete(f"{self.scraper_url}/recipes", 
                                         params={'id': recipe_id}, timeout=10)
            
            if response.status_code == 200:
                logger.info(f"Successfully deleted recipe {recipe_id}")
                return True
            else:
                logger.error(f"Failed to delete recipe {recipe_id}: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error deleting recipe {recipe_id}: {e}")
            return False
    
    def crawl_from_base(self, base_url: str, limit: int = 100, 
                       recipe_patterns: List[str] = None) -> List[str]:
        """
        Crawl a base URL to discover recipe URLs
        
        Args:
            base_url: Base URL to crawl
            limit: Maximum number of recipe URLs to find
            recipe_patterns: List of regex patterns to identify recipe URLs
            
        Returns:
            List of discovered recipe URLs
        """
        if recipe_patterns is None:
            recipe_patterns = [
                r'/recipe/',
                r'/recipes/',
                r'/food/recipes/',
                r'/cooking/recipe/',
                r'/dish/',
                r'/meal/'
            ]
        
        discovered_urls = set()
        visited_urls = set()
        urls_to_visit = [base_url]
        
        logger.info(f"Starting crawl from base URL: {base_url}")
        logger.info(f"Looking for recipe patterns: {recipe_patterns}")
        
        while urls_to_visit and len(discovered_urls) < limit:
            current_url = urls_to_visit.pop(0)
            
            if current_url in visited_urls:
                continue
                
            visited_urls.add(current_url)
            
            # Limit the number of pages we crawl to avoid infinite loops
            if len(visited_urls) > 20:
                logger.info(f"Reached crawl limit of 20 pages, stopping discovery")
                break
            
            try:
                logger.info(f"Crawling: {current_url} (Found {len(discovered_urls)} recipes so far)")
                
                response = self.session.get(current_url, timeout=10)
                if response.status_code != 200:
                    logger.warning(f"Failed to fetch {current_url}: {response.status_code}")
                    continue
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Find all links
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    
                    # Convert relative URLs to absolute
                    if href.startswith('/'):
                        absolute_url = urljoin(base_url, href)
                    elif href.startswith('http'):
                        absolute_url = href
                    else:
                        continue
                    
                    # Check if this is a recipe URL
                    if self._is_recipe_url(absolute_url, recipe_patterns):
                        if absolute_url not in discovered_urls:
                            discovered_urls.add(absolute_url)
                            logger.info(f"Found recipe URL: {absolute_url}")
                            
                            if len(discovered_urls) >= limit:
                                logger.info(f"Reached limit of {limit} recipe URLs")
                                break
                    
                    # Add to crawl queue if it's from the same domain and looks like a content page
                    elif (self._is_same_domain(absolute_url, base_url) and 
                          self._is_content_page(absolute_url) and
                          absolute_url not in visited_urls and
                          len(urls_to_visit) < 50):  # Limit queue size
                        urls_to_visit.append(absolute_url)
                
            except Exception as e:
                logger.error(f"Error crawling {current_url}: {e}")
                continue
        
        result_urls = list(discovered_urls)[:limit]
        logger.info(f"Crawl completed. Found {len(result_urls)} recipe URLs")
        return result_urls
    
    def _is_recipe_url(self, url: str, patterns: List[str]) -> bool:
        """
        Check if a URL is likely a recipe URL
        
        Args:
            url: URL to check
            patterns: List of regex patterns
            
        Returns:
            bool: True if URL matches recipe patterns
        """
        url_lower = url.lower()
        
        # Skip non-recipe URLs
        skip_patterns = [
            r'/authentication/',
            r'/account/',
            r'/login',
            r'/signup',
            r'/settings',
            r'/favorites',
            r'/add-recipe',
            r'/admin/',
            r'/api/',
            r'/search\?',
            r'#',
            r'javascript:',
            r'mailto:',
            r'tel:'
        ]
        
        for pattern in skip_patterns:
            if re.search(pattern, url_lower):
                return False
        
        # Check against recipe patterns
        for pattern in patterns:
            if re.search(pattern, url_lower):
                # Additional validation for recipe URLs
                if self._has_recipe_indicators(url_lower):
                    return True
        
        return False
    
    def _has_recipe_indicators(self, url_lower: str) -> bool:
        """
        Check if URL has strong recipe indicators
        
        Args:
            url_lower: Lowercase URL to check
            
        Returns:
            bool: True if URL has recipe indicators
        """
        # Strong recipe indicators
        strong_indicators = [
            r'/recipe/\d+',  # Recipe with ID
            r'/recipe/\d+/[^/]+$',  # Recipe with ID and name
            r'/recipes/\d+',  # Recipes with ID
            r'/recipes/\d+/[^/]+$',  # Recipes with ID and name
            r'/food/recipes/\d+',  # Food recipes with ID
            r'/cooking/recipe/\d+',  # Cooking recipe with ID
        ]
        
        for pattern in strong_indicators:
            if re.search(pattern, url_lower):
                return True
        
        # Check for recipe-like path structure
        path_parts = url_lower.split('/')
        if len(path_parts) >= 3:
            # Look for recipe-like patterns in the path
            for i, part in enumerate(path_parts):
                if part in ['recipe', 'recipes', 'food', 'cooking', 'dish', 'meal']:
                    # Check if next part looks like a recipe identifier
                    if i + 1 < len(path_parts):
                        next_part = path_parts[i + 1]
                        # Recipe identifiers are usually alphanumeric or contain hyphens
                        if (re.match(r'^[a-z0-9-]+$', next_part) and 
                            len(next_part) > 2 and 
                            not next_part in ['add', 'edit', 'delete', 'list', 'search']):
                            return True
        
        return False
    
    def _is_same_domain(self, url: str, base_url: str) -> bool:
        """
        Check if URL is from the same domain as base URL
        
        Args:
            url: URL to check
            base_url: Base URL for comparison
            
        Returns:
            bool: True if same domain
        """
        try:
            url_domain = urlparse(url).netloc
            base_domain = urlparse(base_url).netloc
            return url_domain == base_domain
        except:
            return False
    
    def _is_content_page(self, url: str) -> bool:
        """
        Check if URL looks like a content page (not admin, api, etc.)
        
        Args:
            url: URL to check
        
        Returns:
            bool: True if likely a content page
        """
        url_lower = url.lower()
        
        # Skip non-content URLs
        skip_patterns = [
            r'/admin/',
            r'/api/',
            r'/login',
            r'/signup',
            r'/cart',
            r'/checkout',
            r'/search\?',
            r'\.(pdf|doc|docx|xls|xlsx|zip|rar)$',
            r'#',
            r'javascript:',
            r'mailto:',
            r'tel:'
        ]
        
        for pattern in skip_patterns:
            if re.search(pattern, url_lower):
                return False
        
        return True
    
    def record_url_attempt(self, url: str, success: bool, error: str = None, 
                          already_exists: bool = False, skipped: bool = False):
        """
        Record a URL attempt for tracking
        
        Args:
            url: URL that was attempted
            success: Whether the attempt was successful
            error: Error message if failed
            already_exists: Whether the recipe already existed
            skipped: Whether the URL was skipped
        """
        timestamp = time.time()
        record = {
            'url': url,
            'timestamp': timestamp,
            'datetime': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(timestamp)),
            'success': success,
            'error': error,
            'already_exists': already_exists,
            'skipped': skipped
        }
        
        self.attempted_urls.append(record)
        
        if skipped:
            self.skipped_urls.append(record)
        elif success:
            self.successful_urls.append(record)
        else:
            self.failed_urls.append(record)
    
    def get_url_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about URL attempts
        
        Returns:
            Dict containing URL attempt statistics
        """
        total = len(self.attempted_urls)
        successful = len(self.successful_urls)
        failed = len(self.failed_urls)
        skipped = len(self.skipped_urls)
        
        success_rate = (successful / total * 100) if total > 0 else 0
        
        return {
            'total_attempted': total,
            'successful': successful,
            'failed': failed,
            'skipped': skipped,
            'success_rate': round(success_rate, 2),
            'attempted_urls': self.attempted_urls,
            'successful_urls': self.successful_urls,
            'failed_urls': self.failed_urls,
            'skipped_urls': self.skipped_urls
        }
    
    def clear_url_history(self):
        """Clear all URL tracking history"""
        self.attempted_urls.clear()
        self.successful_urls.clear()
        self.failed_urls.clear()
        self.skipped_urls.clear()
    
    def save_url_history(self, filename: str = None):
        """
        Save URL attempt history to a JSON file
        
        Args:
            filename: Output filename (default: url_history_YYYYMMDD_HHMMSS.json)
        """
        if filename is None:
            timestamp = time.strftime('%Y%m%d_%H%M%S')
            filename = f'url_history_{timestamp}.json'
        
        history = {
            'metadata': {
                'scraper_url': self.scraper_url,
                'exported_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                'total_records': len(self.attempted_urls)
            },
            'statistics': self.get_url_statistics(),
            'detailed_records': self.attempted_urls
        }
        
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(history, f, indent=2, ensure_ascii=False)
            logger.info(f"URL history saved to {filename}")
            return filename
        except Exception as e:
            logger.error(f"Failed to save URL history: {e}")
            return None

def load_urls_from_file(filename: str) -> List[str]:
    """
    Load URLs from a text file (one URL per line)
    
    Args:
        filename: Path to the file containing URLs
        
    Returns:
        List of URLs
    """
    urls = []
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            for line in f:
                url = line.strip()
                if url and not url.startswith('#'):  # Skip empty lines and comments
                    urls.append(url)
        logger.info(f"Loaded {len(urls)} URLs from {filename}")
        return urls
    except Exception as e:
        logger.error(f"Error loading URLs from {filename}: {e}")
        return []

def save_results_to_file(results: List[Dict[str, Any]], filename: str):
    """
    Save crawl results to a JSON file
    
    Args:
        results: List of crawl results
        filename: Output filename
    """
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logger.info(f"Results saved to {filename}")
    except Exception as e:
        logger.error(f"Error saving results to {filename}: {e}")

def main():
    parser = argparse.ArgumentParser(description='Recipe Crawler - Scrape recipes from URLs')
    parser.add_argument('--scraper-url', default='https://recipe-scraper.nolanfoster.workers.dev',
                       help='URL of the recipe scraper worker')
    parser.add_argument('--urls', nargs='+', help='List of URLs to scrape')
    parser.add_argument('--url-file', help='File containing URLs (one per line)')
    parser.add_argument('--output', default='crawl_results.json',
                       help='Output file for results (default: crawl_results.json)')
    parser.add_argument('--batch', action='store_true',
                       help='Use batch mode (single request for all URLs)')
    parser.add_argument('--no-save', action='store_true',
                       help='Don\'t save recipes to KV storage')
    parser.add_argument('--avoid-overwrite', action='store_true',
                       help='Avoid overwriting existing recipes')
    parser.add_argument('--delay', type=float, default=1.0,
                       help='Delay between requests in seconds (default: 1.0)')
    parser.add_argument('--health-check', action='store_true',
                       help='Perform health check before crawling')
    parser.add_argument('--list-recipes', action='store_true',
                       help='List all stored recipes')
    parser.add_argument('--limit', type=int, default=50,
                       help='Limit for listing recipes (default: 50)')
    parser.add_argument('--base-url', help='Base URL to crawl for recipe discovery')
    parser.add_argument('--crawl-limit', type=int, default=100,
                       help='Maximum number of recipe URLs to discover (default: 100)')
    parser.add_argument('--recipe-patterns', nargs='+',
                       help='Custom regex patterns to identify recipe URLs')
    parser.add_argument('--save-history', action='store_true',
                       help='Save URL attempt history to file')
    parser.add_argument('--history-file', help='Custom filename for URL history')
    parser.add_argument('--show-stats', action='store_true',
                       help='Show URL attempt statistics after crawling')
    
    args = parser.parse_args()
    
    # Initialize crawler
    crawler = RecipeCrawler(args.scraper_url)
    
    # Health check
    if args.health_check:
        logger.info("Performing health check...")
        if not crawler.health_check():
            logger.error("Scraper is not healthy. Exiting.")
            sys.exit(1)
        logger.info("Health check passed!")
    
    # List recipes
    if args.list_recipes:
        logger.info("Listing stored recipes...")
        recipes = crawler.list_recipes(args.limit)
        if 'error' not in recipes:
            print(f"Found {len(recipes.get('recipes', []))} recipes:")
            for recipe in recipes.get('recipes', []):
                print(f"  - {recipe.get('data', {}).get('name', 'Unknown')} ({recipe.get('id', 'No ID')})")
        else:
            logger.error(f"Failed to list recipes: {recipes['error']}")
        return
    
    # Get URLs
    urls = []
    if args.urls:
        urls.extend(args.urls)
    if args.url_file:
        urls.extend(load_urls_from_file(args.url_file))
    
    # Crawl from base URL if provided
    if args.base_url:
        logger.info(f"Crawling from base URL: {args.base_url}")
        discovered_urls = crawler.crawl_from_base(
            args.base_url, 
            args.crawl_limit,
            args.recipe_patterns
        )
        urls.extend(discovered_urls)
        logger.info(f"Added {len(discovered_urls)} discovered URLs to crawl list")
    
    if not urls:
        logger.error("No URLs provided. Use --urls, --url-file, or --base-url.")
        sys.exit(1)
    
    logger.info(f"Starting crawl of {len(urls)} URLs...")
    
    # Perform crawling
    if args.batch:
        logger.info("Using batch mode...")
        batch_result = crawler.scrape_batch(urls, not args.no_save, args.avoid_overwrite)
        if 'results' in batch_result:
            results = batch_result['results']
            save_results_to_file(results, args.output)
        else:
            logger.error(f"Batch crawl failed: {batch_result.get('error', 'Unknown error')}")
            results = []
    else:
        logger.info("Using individual request mode...")
        results = crawler.scrape_multiple_recipes(urls, not args.no_save, 
                                                args.avoid_overwrite, args.delay)
        save_results_to_file(results, args.output)
    
    # Print summary
    successful = 0
    failed = 0
    
    for result in results:
        if isinstance(result, dict):
            if 'results' in result:
                # Batch mode result
                for r in result['results']:
                    if r.get('success'):
                        successful += 1
                    else:
                        failed += 1
            else:
                # Individual mode result
                if result.get('success'):
                    successful += 1
                else:
                    failed += 1
    
    logger.info(f"Crawl completed!")
    logger.info(f"  Total URLs: {len(urls)}")
    logger.info(f"  Successful: {successful}")
    logger.info(f"  Failed: {failed}")
    logger.info(f"  Results saved to: {args.output}")
    
    # Show URL statistics if requested
    if args.show_stats:
        stats = crawler.get_url_statistics()
        logger.info(f"\n📊 URL Attempt Statistics:")
        logger.info(f"  Total attempted: {stats['total_attempted']}")
        logger.info(f"  Successful: {stats['successful']}")
        logger.info(f"  Failed: {stats['failed']}")
        logger.info(f"  Skipped: {stats['skipped']}")
        logger.info(f"  Success rate: {stats['success_rate']}%")
    
    # Save URL history if requested
    if args.save_history:
        history_file = crawler.save_url_history(args.history_file)
        if history_file:
            logger.info(f"  URL history saved to: {history_file}")

if __name__ == "__main__":
    main()
