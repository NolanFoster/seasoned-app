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
        
        // Tracking for JSON-LD analysis
        this.jsonLdFound = 0;
        this.jsonLdProcessed = 0;
        this.jsonLdSaved = 0;
        this.noJsonLd = 0;
        this.errors = 0;
        
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
     * Extract JSON-LD data from HTML content
     */
    extractJsonLd(html) {
        const jsonLdScripts = [];
        
        // Look for JSON-LD scripts
        const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        
        while ((match = jsonLdRegex.exec(html)) !== null) {
            try {
                const jsonContent = match[1].trim();
                const parsed = JSON.parse(jsonContent);
                
                // Handle both single objects and arrays
                if (Array.isArray(parsed)) {
                    jsonLdScripts.push(...parsed);
                } else {
                    jsonLdScripts.push(parsed);
                }
            } catch (e) {
                console.warn(`Failed to parse JSON-LD script: ${e.message}`);
            }
        }
        
        return jsonLdScripts;
    }
    
    /**
     * Check if JSON-LD contains recipe data
     */
    hasRecipeJsonLd(jsonLdData) {
        if (!jsonLdData || !Array.isArray(jsonLdData)) return false;
        
        for (const item of jsonLdData) {
            if (!item || typeof item !== 'object') continue;
            
            // Check direct Recipe type
            if (item['@type'] === 'Recipe') return true;
            
            // Check for Recipe in @graph
            if (item['@graph'] && Array.isArray(item['@graph'])) {
                for (const graphItem of item['@graph']) {
                    if (graphItem && graphItem['@type'] === 'Recipe') return true;
                }
            }
            
            // Check for array of types including Recipe
            if (Array.isArray(item['@type']) && item['@type'].includes('Recipe')) return true;
        }
        
        return false;
    }
    
    /**
     * Extract recipe data from JSON-LD
     */
    extractRecipeFromJsonLd(jsonLdData, url) {
        if (!jsonLdData || !Array.isArray(jsonLdData)) return null;
        
        for (const item of jsonLdData) {
            if (!item || typeof item !== 'object') continue;
            
            let recipe = null;
            
            // Direct Recipe object
            if (item['@type'] === 'Recipe') {
                recipe = item;
            }
            // Recipe in @graph
            else if (item['@graph'] && Array.isArray(item['@graph'])) {
                recipe = item['@graph'].find(graphItem => 
                    graphItem && graphItem['@type'] === 'Recipe'
                );
            }
            // Array of types including Recipe
            else if (Array.isArray(item['@type']) && item['@type'].includes('Recipe')) {
                recipe = item;
            }
            
            if (recipe) {
                // Handle La Cucina Italiana specific structure
                const name = recipe.name || recipe.headline || '';
                const description = recipe.description || '';
                
                // Handle instructions - they might be objects with 'text' property
                let instructions = [];
                if (Array.isArray(recipe.recipeInstructions)) {
                    instructions = recipe.recipeInstructions.map(step => {
                        if (typeof step === 'string') return step;
                        if (step && typeof step === 'object' && step.text) return step.text;
                        return String(step);
                    });
                } else if (recipe.recipeInstructions) {
                    instructions = [recipe.recipeInstructions];
                }
                
                // Handle image - might be array or single object
                let image = '';
                if (Array.isArray(recipe.image)) {
                    image = recipe.image[0] || '';
                } else if (recipe.image && typeof recipe.image === 'object' && recipe.image.url) {
                    image = recipe.image.url;
                } else if (recipe.image) {
                    image = recipe.image;
                }
                
                return {
                    name: name,
                    description: description,
                    url: url,
                    image: image,
                    author: recipe.author?.name || recipe.author || '',
                    datePublished: recipe.datePublished || '',
                    prepTime: recipe.prepTime || '',
                    cookTime: recipe.cookTime || '',
                    totalTime: recipe.totalTime || '',
                    recipeYield: recipe.recipeYield || '',
                    recipeCategory: recipe.recipeCategory || '',
                    recipeCuisine: recipe.recipeCuisine || '',
                    keywords: recipe.keywords || '',
                    ingredients: Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : 
                                (recipe.recipeIngredient ? [recipe.recipeIngredient] : []),
                    instructions: instructions,
                    nutrition: recipe.nutrition || {},
                    aggregateRating: recipe.aggregateRating || {}
                };
            }
        }
        
        return null;
    }
    
    /**
     * Save recipe data locally since the worker can't handle this site
     */
    async saveRecipe(recipeData, url) {
        try {
            // Since La Cucina Italiana is a JavaScript-heavy site that the worker can't handle,
            // we'll save the extracted JSON-LD data locally
            if (recipeData && recipeData.name && recipeData.name.trim()) {
                // Add metadata
                const recipeWithMetadata = {
                    ...recipeData,
                    extractedAt: new Date().toISOString(),
                    source: 'La Cucina Italiana',
                    originalUrl: url,
                    extractionMethod: 'JSON-LD'
                };
                
                return { success: true, data: recipeWithMetadata };
            } else {
                return { success: false, error: 'Invalid recipe data' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Process a single recipe URL - check for JSON-LD and save if found
     */
    async processRecipe(url) {
        try {
            console.log(`Processing recipe: ${url}`);
            
            // Fetch the page HTML
            const response = await this.makeRequest(url);
            if (response.statusCode !== 200) {
                const errorMsg = `HTTP ${response.statusCode}`;
                console.warn(`Failed to fetch ${url}: ${errorMsg}`);
                this.failedUrls.push(url);
                return {
                    success: false,
                    url: url,
                    error: errorMsg,
                    hasJsonLd: false
                };
            }
            
            // Extract JSON-LD data
            const jsonLdData = this.extractJsonLd(response.data);
            const hasJsonLd = this.hasRecipeJsonLd(jsonLdData);
            
            if (hasJsonLd) {
                console.log(`Found JSON-LD recipe data at ${url}`);
                
                // Extract recipe data from JSON-LD
                const recipeData = this.extractRecipeFromJsonLd(jsonLdData, url);
                if (recipeData && recipeData.name) {
                    // Save recipe to the worker
                    const saveResult = await this.saveRecipe(recipeData, url);
                    
                    if (saveResult.success) {
                        console.log(`Successfully saved recipe: ${recipeData.name}`);
                        this.successfulUrls.push(url);
                        return {
                            success: true,
                            url: url,
                            data: saveResult.data,
                            hasJsonLd: true,
                            source: 'json-ld'
                        };
                    } else {
                        console.warn(`Failed to save recipe ${url}: ${saveResult.error}`);
                        this.failedUrls.push(url);
                        return {
                            success: false,
                            url: url,
                            error: saveResult.error,
                            hasJsonLd: true,
                            source: 'json-ld'
                        };
                    }
                } else {
                    console.warn(`JSON-LD found but no valid recipe data at ${url}`);
                    this.failedUrls.push(url);
                    return {
                        success: false,
                        url: url,
                        error: 'No valid recipe data in JSON-LD',
                        hasJsonLd: true,
                        source: 'json-ld'
                    };
                }
            } else {
                console.log(`No JSON-LD recipe data found at ${url}`);
                this.failedUrls.push(url);
                return {
                    success: false,
                    url: url,
                    error: 'No JSON-LD recipe data found',
                    hasJsonLd: false,
                    source: 'html-only'
                };
            }
            
        } catch (error) {
            console.error(`Error processing ${url}: ${error.message}`);
            this.failedUrls.push(url);
            return {
                success: false,
                url: url,
                error: error.message,
                hasJsonLd: false,
                source: 'error'
            };
        }
    }
    
    /**
     * Process all discovered recipe URLs
     */
    async processAllRecipes(delay = 1000) {
        if (this.discoveredUrls.size === 0) {
            console.warn('No recipe URLs discovered. Run discoverRecipeUrls() first.');
            return [];
        }
        
        console.log(`Starting to process ${this.discoveredUrls.size} recipes`);
        
        const results = [];
        const total = this.discoveredUrls.size;
        const urls = Array.from(this.discoveredUrls);
        
        // Tracking for detailed reporting
        this.jsonLdFound = 0;
        this.jsonLdProcessed = 0;
        this.jsonLdSaved = 0;
        this.noJsonLd = 0;
        this.errors = 0;
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`Processing recipe ${i + 1}/${total}: ${url}`);
            
            const result = await this.processRecipe(url);
            results.push(result);
            
            // Update tracking counters
            if (result.hasJsonLd) {
                this.jsonLdFound++;
                if (result.success) {
                    this.jsonLdSaved++;
                }
                this.jsonLdProcessed++;
            } else {
                this.noJsonLd++;
            }
            
            if (!result.success) {
                this.errors++;
            }
            
            // Progress update
            if ((i + 1) % 10 === 0) {
                const successRate = this.successfulUrls.length / (i + 1) * 100;
                const jsonLdRate = this.jsonLdFound / (i + 1) * 100;
                console.log(`Progress: ${i + 1}/${total} (${successRate.toFixed(1)}% success, ${jsonLdRate.toFixed(1)}% JSON-LD found)`);
            }
            
            // Delay between requests
            if (i < urls.length - 1) { // Don't delay after the last request
                await this.sleep(delay);
            }
        }
        
        console.log(`Recipe processing complete. ${this.successfulUrls.length} successful, ${this.failedUrls.length} failed`);
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
     * Print a comprehensive summary of the crawling operation
     */
    printSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('LA CUCINA ITALIANA CRAWLER - COMPREHENSIVE REPORT');
        console.log('='.repeat(80));
        
        // Basic Statistics
        console.log('\n📊 BASIC STATISTICS');
        console.log('─'.repeat(40));
        console.log(`Base URL: ${this.baseUrl}`);
        console.log(`Total URLs discovered: ${this.discoveredUrls.size}`);
        console.log(`Total recipes processed: ${this.successfulUrls.length + this.failedUrls.length}`);
        console.log(`Successful saves: ${this.successfulUrls.length}`);
        console.log(`Failed attempts: ${this.failedUrls.length}`);
        console.log(`Overall success rate: ${((this.successfulUrls.length / Math.max(1, this.successfulUrls.length + this.failedUrls.length)) * 100).toFixed(1)}%`);
        
        // JSON-LD Analysis
        console.log('\n🔍 JSON-LD ANALYSIS');
        console.log('─'.repeat(40));
        if (this.jsonLdFound !== undefined) {
            console.log(`Pages with JSON-LD recipe data: ${this.jsonLdFound}`);
            console.log(`Pages without JSON-LD: ${this.noJsonLd}`);
            console.log(`JSON-LD detection rate: ${((this.jsonLdFound / Math.max(1, this.jsonLdFound + this.noJsonLd)) * 100).toFixed(1)}%`);
            console.log(`JSON-LD recipes successfully saved: ${this.jsonLdSaved}`);
            console.log(`JSON-LD recipes failed to save: ${this.jsonLdProcessed - this.jsonLdSaved}`);
        } else {
            console.log('JSON-LD tracking not available (run processAllRecipes first)');
        }
        
        // Recipe Categories (if available)
        if (this.successfulUrls.length > 0) {
            console.log('\n🍝 SUCCESSFULLY SAVED RECIPES');
            console.log('─'.repeat(40));
            console.log(`Total recipes saved: ${this.successfulUrls.length}`);
            
            // Group by category
            const categories = {};
            this.successfulUrls.forEach(url => {
                const category = url.includes('/pasta/') ? 'Pasta' :
                               url.includes('/appetizers/') ? 'Appetizers' :
                               url.includes('/main-course/') ? 'Main Course' :
                               url.includes('/cakes-and-desserts/') ? 'Desserts' :
                               url.includes('/risotto/') ? 'Risotto' :
                               url.includes('/sides-and-vegetables/') ? 'Sides' :
                               'Other';
                categories[category] = (categories[category] || 0) + 1;
            });
            
            Object.entries(categories).forEach(([category, count]) => {
                console.log(`  ${category}: ${count} recipes`);
            });
            
            console.log('\nSample saved recipes:');
            this.successfulUrls.slice(0, 5).forEach(url => {
                const recipeName = url.split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                console.log(`  - ${recipeName}`);
            });
        }
        
        // Error Analysis
        if (this.failedUrls.length > 0) {
            console.log('\n❌ FAILURE ANALYSIS');
            console.log('─'.repeat(40));
            console.log(`Total failures: ${this.failedUrls.length}`);
            
            // Group failures by reason
            const failureReasons = {};
            this.failedUrls.forEach(url => {
                // This would need to be enhanced if we want to track specific failure reasons
                failureReasons['Various reasons'] = (failureReasons['Various reasons'] || 0) + 1;
            });
            
            Object.entries(failureReasons).forEach(([reason, count]) => {
                console.log(`  ${reason}: ${count} URLs`);
            });
            
            console.log('\nSample failed URLs:');
            this.failedUrls.slice(0, 5).forEach(url => {
                console.log(`  - ${url}`);
            });
        }
        
        // Performance Summary
        console.log('\n⚡ PERFORMANCE SUMMARY');
        console.log('─'.repeat(40));
        if (this.jsonLdFound !== undefined) {
            const jsonLdSuccessRate = this.jsonLdFound > 0 ? (this.jsonLdSaved / this.jsonLdFound * 100).toFixed(1) : '0.0';
            console.log(`JSON-LD recipes: ${this.jsonLdFound} found, ${this.jsonLdSaved} saved (${jsonLdSuccessRate}% success)`);
            console.log(`Non-JSON-LD pages: ${this.noJsonLd} (cannot be processed)`);
            console.log(`Overall efficiency: ${((this.jsonLdSaved / Math.max(1, this.discoveredUrls.size)) * 100).toFixed(1)}% of discovered URLs saved`);
        }
        
        console.log('='.repeat(80));
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
        
        // Process all discovered recipes
        console.log('Starting recipe processing...');
        const results = await crawler.processAllRecipes(delay);
        
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