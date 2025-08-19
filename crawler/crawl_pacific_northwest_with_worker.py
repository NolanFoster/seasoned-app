#!/usr/bin/env python3
"""
Use the existing recipe crawler with the recipe scraper worker to scrape Pacific Northwest recipes
"""

import json
import time
from datetime import datetime
from recipe_crawler import RecipeCrawler
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('pacific_northwest_worker_crawl.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def load_urls_from_file(filename: str) -> list:
    """Load URLs from a text file"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            urls = [line.strip() for line in f if line.strip()]
        return urls
    except FileNotFoundError:
        logger.error(f"URL file {filename} not found")
        return []
    except Exception as e:
        logger.error(f"Error loading URLs from {filename}: {e}")
        return []

def crawl_pacific_northwest_recipes():
    """Crawl Pacific Northwest recipes using the recipe scraper worker"""
    logger.info("🚀 Starting Pacific Northwest recipe crawling with worker")
    logger.info("=" * 60)
    
    # Initialize the recipe crawler
    crawler = RecipeCrawler()
    
    # Health check first
    logger.info("🔍 Checking recipe scraper worker health...")
    if not crawler.health_check():
        logger.error("❌ Recipe scraper worker is not healthy!")
        return None
    
    logger.info("✅ Recipe scraper worker is healthy")
    
    # Load URLs
    logger.info("📂 Loading Pacific Northwest recipe URLs...")
    urls = load_urls_from_file('pacific_northwest_urls.txt')
    
    if not urls:
        logger.error("❌ No URLs loaded!")
        return None
    
    logger.info(f"📋 Loaded {len(urls)} Pacific Northwest recipe URLs")
    
    # Show first few URLs for verification
    logger.info("📝 Sample URLs to be scraped:")
    for i, url in enumerate(urls[:5], 1):
        logger.info(f"  {i}. {url}")
    if len(urls) > 5:
        logger.info(f"  ... and {len(urls) - 5} more URLs")
    
    # Start crawling
    start_time = datetime.now()
    logger.info(f"⏰ Starting crawl at {start_time}")
    
    try:
        # Option 1: Use batch processing (faster but might hit limits)
        logger.info("🔄 Attempting batch processing...")
        
        # Split into smaller batches to avoid timeouts
        batch_size = 20
        all_results = []
        
        for i in range(0, len(urls), batch_size):
            batch_urls = urls[i:i+batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(urls) + batch_size - 1) // batch_size
            
            logger.info(f"📦 Processing batch {batch_num}/{total_batches} ({len(batch_urls)} URLs)")
            
            try:
                batch_result = crawler.scrape_batch(
                    urls=batch_urls,
                    save=True,
                    avoid_overwrite=False
                )
                
                if batch_result.get('success'):
                    successful_count = len(batch_result.get('results', []))
                    logger.info(f"✅ Batch {batch_num} completed: {successful_count} recipes scraped")
                    all_results.extend(batch_result.get('results', []))
                else:
                    logger.warning(f"⚠️  Batch {batch_num} had issues: {batch_result.get('error', 'Unknown error')}")
                    # Fall back to individual scraping for this batch
                    logger.info(f"🔄 Falling back to individual scraping for batch {batch_num}")
                    individual_results = crawler.scrape_multiple_recipes(
                        urls=batch_urls,
                        save=True,
                        avoid_overwrite=False,
                        delay=1.0
                    )
                    all_results.extend(individual_results)
                
                # Small delay between batches
                if i + batch_size < len(urls):
                    logger.info("⏳ Waiting 2 seconds between batches...")
                    time.sleep(2)
                    
            except Exception as e:
                logger.error(f"❌ Batch {batch_num} failed: {e}")
                logger.info(f"🔄 Falling back to individual scraping for batch {batch_num}")
                
                # Fall back to individual scraping
                individual_results = crawler.scrape_multiple_recipes(
                    urls=batch_urls,
                    save=True,
                    avoid_overwrite=False,
                    delay=1.0
                )
                all_results.extend(individual_results)
        
        end_time = datetime.now()
        duration = end_time - start_time
        
        # Analyze results
        successful_recipes = [r for r in all_results if r.get('success')]
        failed_recipes = [r for r in all_results if not r.get('success')]
        
        logger.info("=" * 60)
        logger.info("📊 CRAWLING SUMMARY")
        logger.info("=" * 60)
        logger.info(f"⏱️  Duration: {duration}")
        logger.info(f"📋 Total URLs processed: {len(urls)}")
        logger.info(f"✅ Successful scrapes: {len(successful_recipes)}")
        logger.info(f"❌ Failed scrapes: {len(failed_recipes)}")
        logger.info(f"📈 Success rate: {(len(successful_recipes)/len(urls)*100):.1f}%")
        
        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_file = f"pacific_northwest_worker_results_{timestamp}.json"
        
        results_data = {
            'crawl_metadata': {
                'start_time': start_time.isoformat(),
                'end_time': end_time.isoformat(),
                'duration_seconds': duration.total_seconds(),
                'total_urls': len(urls),
                'successful_count': len(successful_recipes),
                'failed_count': len(failed_recipes),
                'success_rate': len(successful_recipes)/len(urls)*100,
                'scraper_worker_url': crawler.scraper_url
            },
            'successful_recipes': successful_recipes,
            'failed_recipes': failed_recipes,
            'source_urls': urls
        }
        
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(results_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"💾 Results saved to: {results_file}")
        
        # Show sample successful recipes
        if successful_recipes:
            logger.info("\n🍽️  Sample successful recipes:")
            for i, recipe in enumerate(successful_recipes[:5], 1):
                recipe_data = recipe.get('data', {})
                title = recipe_data.get('title', 'No title')
                url = recipe.get('url', 'No URL')
                logger.info(f"  {i}. {title}")
                logger.info(f"     🔗 {url}")
        
        # Show failed URLs if any
        if failed_recipes:
            logger.info(f"\n❌ Failed URLs ({len(failed_recipes)} total):")
            for i, failed in enumerate(failed_recipes[:5], 1):
                url = failed.get('url', 'Unknown URL')
                error = failed.get('error', 'Unknown error')
                logger.info(f"  {i}. {url}")
                logger.info(f"     ❌ {error}")
            
            if len(failed_recipes) > 5:
                logger.info(f"     ... and {len(failed_recipes) - 5} more failed URLs")
        
        logger.info("\n🎉 Pacific Northwest recipe crawling completed!")
        return results_file
        
    except KeyboardInterrupt:
        logger.info("\n⏹️  Crawling interrupted by user")
        return None
    except Exception as e:
        logger.error(f"❌ Crawling failed with error: {e}")
        return None

def main():
    """Main function"""
    try:
        results_file = crawl_pacific_northwest_recipes()
        if results_file:
            print(f"\n✅ Crawling completed successfully!")
            print(f"📄 Results saved to: {results_file}")
        else:
            print("\n❌ Crawling failed or was interrupted")
    except Exception as e:
        logger.error(f"Main function error: {e}")

if __name__ == "__main__":
    main()