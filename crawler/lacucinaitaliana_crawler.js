#!/usr/bin/env node
/**
 * La Cucina Italiana Recipe Crawler
 * A Node.js crawler for discovering and scraping recipes from lacucinaitaliana.com
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

class LaCucinaItalianaCrawler {
    constructor(scraperUrl = 'https://recipe-scraper.nolanfoster.workers.dev') {
        this.scraperUrl = scraperUrl.replace(/\/$/, '');
        this.baseUrl = 'https://www.lacucinaitaliana.com';
        this.recipesUrl = 'https://www.lacucinaitaliana.com/recipes';
        
        this.discoveredUrls = new Set();
        this.successfulUrls = [];
        this.failedUrls = [];
        
        // User agent to mimic a real browser
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }
    
    /**
     * Make an HTTP request
     */
    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'identity', // Don't accept compression for easier parsing
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    ...options.headers
                }
            };
            
            const req = client.request(requestOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                });
            });
            
            req.on('error', (err) => {
                reject(err);
            });
            
            if (options.body) {
                req.write(options.body);
            }
            
            req.end();
        });
    }
    
    /**
     * Check if the scraper is healthy
     */
    async healthCheck() {
        try {
            const response = await this.makeRequest(`${this.scraperUrl}/health`);
            if (response.statusCode === 200) {
                const healthData = JSON.parse(response.data);
                console.log(`Scraper health: ${healthData.status || 'unknown'}`);
                return healthData.status === 'healthy';
            } else {
                console.error(`Health check failed with status ${response.statusCode}`);
                return false;
            }
        } catch (error) {
            console.error(`Health check error: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Check if a URL is likely a recipe URL
     */
    isRecipeUrl(href) {
        if (!href) return false;
        
        const hrefLower = href.toLowerCase();
        
        // Skip non-http(s) URLs
        if (!hrefLower.startsWith('http://') && !hrefLower.startsWith('https://') && !hrefLower.startsWith('/')) {
            return false;
        }
        
        // Skip obvious non-recipe URLs
        const skipPatterns = [
            '/search', '/category', '/tag', '/author', '/about', '/contact',
            '/privacy', '/terms', '/advertise', '/subscribe', '/newsletter',
            '/pag/', '/page/', '/italian-food', '/trends', '/trip-to-italy',
            '/video', '/glossary', '/school', '/label',
            '.jpg', '.jpeg', '.png', '.gif', '.pdf', '.xml', '.rss'
        ];
        
        for (const pattern of skipPatterns) {
            if (hrefLower.includes(pattern)) {
                return false;
            }
        }
        
        // Only accept URLs that start with /recipe/ (actual recipe pages)
        if (hrefLower.startsWith('/recipe/')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Extract recipe URLs from HTML content
     */
    extractRecipeUrls(html, baseUrl) {
        const recipeUrls = new Set();
        
        // Simple regex-based extraction (more robust than trying to parse HTML without a proper parser)
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
        let match;
        
        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            if (this.isRecipeUrl(href)) {
                const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
                recipeUrls.add(fullUrl);
            }
        }
        
        return recipeUrls;
    }
    
    /**
     * Discover recipe URLs from La Cucina Italiana recipes page
     */
    async discoverRecipeUrls(maxPages = 10, maxRecipes = 200) {
        console.log(`Starting recipe discovery from ${this.recipesUrl}`);
        
        let page = 1;
        let discoveredCount = 0;
        
        while (page <= maxPages && discoveredCount < maxRecipes) {
            try {
                // Construct page URL - La Cucina Italiana uses /recipes/pag/ format
                const pageUrl = page === 1 ? this.recipesUrl : `${this.recipesUrl}/pag/${page}`;
                
                console.log(`Discovering recipes from page ${page}: ${pageUrl}`);
                
                const response = await this.makeRequest(pageUrl);
                if (response.statusCode !== 200) {
                    console.warn(`Failed to fetch page ${page}: HTTP ${response.statusCode}`);
                    break;
                }
                
                const recipeUrls = this.extractRecipeUrls(response.data, pageUrl);
                
                // Remove duplicates and add to discovered URLs
                const newUrls = new Set([...recipeUrls].filter(url => !this.discoveredUrls.has(url)));
                newUrls.forEach(url => this.discoveredUrls.add(url));
                
                console.log(`Page ${page}: Found ${recipeUrls.size} links, ${newUrls.size} new`);
                
                if (newUrls.size === 0) {
                    console.log(`No new recipe URLs found on page ${page}, stopping discovery`);
                    break;
                }
                
                discoveredCount += newUrls.size;
                
                // Check if we've reached the limit
                if (discoveredCount >= maxRecipes) {
                    console.log(`Reached maximum recipe limit (${maxRecipes})`);
                    break;
                }
                
                page++;
                
                // Be respectful with delays
                await this.sleep(2000);
                
            } catch (error) {
                console.error(`Error discovering recipes from page ${page}: ${error.message}`);
                break;
            }
        }
        
        console.log(`Recipe discovery complete. Found ${this.discoveredUrls.size} total recipe URLs`);
        return this.discoveredUrls;
    }
    
    /**
     * Scrape a single recipe using the recipe scraper
     */
    async scrapeRecipe(url) {
        try {
            console.log(`Scraping recipe: ${url}`);
            
            const payload = JSON.stringify({ url });
            const response = await this.makeRequest(`${this.scraperUrl}/clip`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: payload
            });
            
            if (response.statusCode === 200) {
                const result = JSON.parse(response.data);
                
                // Check if we got valid recipe data
                if (result.name && result.name.trim()) {
                    console.log(`Successfully scraped recipe: ${result.name}`);
                    this.successfulUrls.push(url);
                    return {
                        success: true,
                        url: url,
                        data: result
                    };
                } else {
                    const errorMsg = result.error || 'No recipe data returned';
                    console.warn(`Failed to scrape ${url}: ${errorMsg}`);
                    this.failedUrls.push(url);
                    return {
                        success: false,
                        url: url,
                        error: errorMsg
                    };
                }
            } else {
                const errorMsg = `HTTP ${response.statusCode}`;
                console.error(`Failed to scrape ${url}: ${errorMsg}`);
                this.failedUrls.push(url);
                return {
                    success: false,
                    url: url,
                    error: errorMsg
                };
            }
            
        } catch (error) {
            console.error(`Error scraping ${url}: ${error.message}`);
            this.failedUrls.push(url);
            return {
                success: false,
                url: url,
                error: error.message
            };
        }
    }
    
    /**
     * Scrape all discovered recipe URLs
     */
    async scrapeAllRecipes(delay = 1000) {
        if (this.discoveredUrls.size === 0) {
            console.warn('No recipe URLs discovered. Run discoverRecipeUrls() first.');
            return [];
        }
        
        console.log(`Starting to scrape ${this.discoveredUrls.size} recipes`);
        
        const results = [];
        const total = this.discoveredUrls.size;
        const urls = Array.from(this.discoveredUrls);
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`Scraping recipe ${i + 1}/${total}: ${url}`);
            
            const result = await this.scrapeRecipe(url);
            results.push(result);
            
            // Progress update
            if ((i + 1) % 10 === 0) {
                const successRate = this.successfulUrls.length / (i + 1) * 100;
                console.log(`Progress: ${i + 1}/${total} (${successRate.toFixed(1)}% success rate)`);
            }
            
            // Delay between requests
            if (i < urls.length - 1) { // Don't delay after the last request
                await this.sleep(delay);
            }
        }
        
        console.log(`Recipe scraping complete. ${this.successfulUrls.length} successful, ${this.failedUrls.length} failed`);
        return results;
    }
    
    /**
     * Save results to a JSON file
     */
    saveResults(results, filename = null) {
        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            filename = `lacucinaitaliana_results_${timestamp}.json`;
        }
        
        const outputData = {
            metadata: {
                crawler: 'La Cucina Italiana Crawler (Node.js)',
                timestamp: new Date().toISOString(),
                baseUrl: this.baseUrl,
                totalDiscovered: this.discoveredUrls.size,
                totalScraped: results.length,
                successful: this.successfulUrls.length,
                failed: this.failedUrls.length
            },
            results: results,
            urls: {
                discovered: Array.from(this.discoveredUrls),
                successful: this.successfulUrls,
                failed: this.failedUrls
            }
        };
        
        fs.writeFileSync(filename, JSON.stringify(outputData, null, 2), 'utf8');
        console.log(`Results saved to ${filename}`);
        return filename;
    }
    
    /**
     * Print a summary of the crawling operation
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('LA CUCINA ITALIANA CRAWLER SUMMARY');
        console.log('='.repeat(60));
        console.log(`Base URL: ${this.baseUrl}`);
        console.log(`Total URLs discovered: ${this.discoveredUrls.size}`);
        console.log(`Total recipes scraped: ${this.successfulUrls.length + this.failedUrls.length}`);
        console.log(`Successful scrapes: ${this.successfulUrls.length}`);
        console.log(`Failed scrapes: ${this.failedUrls.length}`);
        console.log(`Success rate: ${((this.successfulUrls.length / Math.max(1, this.successfulUrls.length + this.failedUrls.length)) * 100).toFixed(1)}%`);
        
        if (this.successfulUrls.length > 0) {
            console.log(`\nSample successful recipes:`);
            this.successfulUrls.slice(0, 5).forEach(url => {
                console.log(`  - ${url}`);
            });
        }
        
        if (this.failedUrls.length > 0) {
            console.log(`\nSample failed URLs:`);
            this.failedUrls.slice(0, 5).forEach(url => {
                console.log(`  - ${url}`);
            });
        }
        
        console.log('='.repeat(60));
    }
    
    /**
     * Sleep for a specified number of milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution function
async function main() {
    const args = process.argv.slice(2);
    
    // Simple argument parsing
    let maxPages = 10;
    let maxRecipes = 200;
    let delay = 1000;
    let discoverOnly = false;
    let healthCheck = false;
    let outputFile = null;
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--max-pages':
                maxPages = parseInt(args[++i]) || 10;
                break;
            case '--max-recipes':
                maxRecipes = parseInt(args[++i]) || 200;
                break;
            case '--delay':
                delay = parseInt(args[++i]) || 1000;
                break;
            case '--discover-only':
                discoverOnly = true;
                break;
            case '--health-check':
                healthCheck = true;
                break;
            case '--output':
                outputFile = args[++i];
                break;
            case '--help':
                console.log(`
La Cucina Italiana Recipe Crawler

Usage: node lacucinaitaliana_crawler.js [options]

Options:
  --max-pages <number>     Maximum pages to crawl (default: 10)
  --max-recipes <number>   Maximum recipes to discover (default: 200)
  --delay <ms>            Delay between requests in milliseconds (default: 1000)
  --discover-only         Only discover URLs, don't scrape recipes
  --health-check          Perform health check before crawling
  --output <filename>     Output filename for results
  --help                  Show this help message

Examples:
  node lacucinaitaliana_crawler.js --discover-only
  node lacucinaitaliana_crawler.js --max-pages 5 --max-recipes 100
  node lacucinaitaliana_crawler.js --delay 2000 --output my_results.json
`);
                return;
        }
    }
    
    console.log('La Cucina Italiana Recipe Crawler');
    console.log('==================================');
    
    // Initialize crawler
    const crawler = new LaCucinaItalianaCrawler();
    
    // Health check if requested
    if (healthCheck) {
        if (!(await crawler.healthCheck())) {
            console.error('Recipe scraper is not healthy. Exiting.');
            process.exit(1);
        }
        console.log('Recipe scraper health check passed.');
    }
    
    try {
        // Discover recipe URLs
        console.log('Starting recipe discovery...');
        const discoveredUrls = await crawler.discoverRecipeUrls(maxPages, maxRecipes);
        
        if (discoveredUrls.size === 0) {
            console.warn('No recipe URLs discovered. Exiting.');
            return;
        }
        
        console.log(`Discovered ${discoveredUrls.size} recipe URLs`);
        
        if (discoverOnly) {
            // Save discovered URLs only
            const outputData = {
                metadata: {
                    crawler: 'La Cucina Italiana Crawler (Node.js)',
                    timestamp: new Date().toISOString(),
                    baseUrl: crawler.baseUrl,
                    totalDiscovered: discoveredUrls.size,
                    mode: 'discovery_only'
                },
                urls: Array.from(discoveredUrls)
            };
            
            const filename = outputFile || `lacucinaitaliana_urls_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
            fs.writeFileSync(filename, JSON.stringify(outputData, null, 2), 'utf8');
            
            console.log(`Discovered URLs saved to ${filename}`);
            return;
        }
        
        // Scrape all discovered recipes
        console.log('Starting recipe scraping...');
        const results = await crawler.scrapeAllRecipes(delay);
        
        // Save results
        const filename = crawler.saveResults(results, outputFile);
        
        // Print summary
        crawler.printSummary();
        
        console.log(`All results saved to ${filename}`);
        
    } catch (error) {
        console.error(`Unexpected error: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
if (require.main === module) {
    main().catch(console.error);
}

module.exports = LaCucinaItalianaCrawler;