# Recipe Crawler

A Python script that can pass a list of URLs to the recipe scraper worker.

## Features

- **Batch Processing**: Scrape multiple recipes in a single request
- **Individual Processing**: Scrape recipes one by one with configurable delays
- **File Input**: Load URLs from a text file
- **Avoid Overwrite**: Option to prevent overwriting existing recipes
- **Health Checks**: Verify scraper is healthy before crawling
- **Comprehensive Logging**: Detailed logs saved to file and console
- **Result Export**: Save crawl results to JSON files
- **URL Tracking**: Keep detailed records of all URL attempts
- **Statistics**: Track success rates and failure reasons

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. The crawler is configured to use the deployed scraper at:
   ```
   https://recipe-scraper.nolanfoster.workers.dev
   ```
   
   If you want to use a local scraper, specify it with `--scraper-url`:
   ```bash
   python3 recipe_crawler.py --scraper-url "http://localhost:8787" --url-file recipes.txt
   ```

## Usage

### Basic Usage

Scrape a single recipe:
```bash
python recipe_crawler.py --urls "https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/"
```

Scrape multiple recipes:
```bash
python recipe_crawler.py --urls "https://example.com/recipe1" "https://example.com/recipe2"
```

### File Input

Load URLs from a file:
```bash
python recipe_crawler.py --url-file sample_urls.txt
```

### Base URL Crawling

Discover and scrape recipes from a website by crawling from a base URL:
```bash
python recipe_crawler.py --base-url "https://www.allrecipes.com"
```

With custom limit:
```bash
python recipe_crawler.py --base-url "https://www.allrecipes.com" --crawl-limit 50
```

With custom recipe patterns:
```bash
python recipe_crawler.py --base-url "https://example.com" --recipe-patterns "/recipe/" "/food/" "/cook/"
```

### Batch Mode

Use batch mode for faster processing (single request for all URLs):
```bash
python recipe_crawler.py --url-file sample_urls.txt --batch
```

### Avoid Overwriting

Prevent overwriting existing recipes:
```bash
python recipe_crawler.py --url-file sample_urls.txt --avoid-overwrite
```

### Health Check

Perform health check before crawling:
```bash
python recipe_crawler.py --url-file sample_urls.txt --health-check
```

### List Stored Recipes

List all recipes currently in storage:
```bash
python recipe_crawler.py --list-recipes
```

List with custom limit:
```bash
python recipe_crawler.py --list-recipes --limit 100
```

### Advanced Options

Custom scraper URL:
```bash
python recipe_crawler.py --scraper-url "http://localhost:8787" --url-file sample_urls.txt
```

Custom delay between requests:
```bash
python recipe_crawler.py --url-file sample_urls.txt --delay 2.0
```

Don't save to KV storage (just scrape):
```bash
python recipe_crawler.py --url-file sample_urls.txt --no-save
```

Custom output file:
```bash
python recipe_crawler.py --url-file sample_urls.txt --output my_results.json
```

### URL Tracking and Statistics

Save URL attempt history:
```bash
python recipe_crawler.py --url-file recipes.txt --save-history
```

Show statistics after crawling:
```bash
python recipe_crawler.py --url-file recipes.txt --show-stats
```

Custom history filename:
```bash
python recipe_crawler.py --url-file recipes.txt --save-history --history-file my_history.json
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--scraper-url` | URL of the recipe scraper worker | `https://recipe-scraper.nolanfoster.workers.dev` |
| `--urls` | List of URLs to scrape | None |
| `--url-file` | File containing URLs (one per line) | None |
| `--output` | Output file for results | `crawl_results.json` |
| `--batch` | Use batch mode (single request for all URLs) | False |
| `--no-save` | Don't save recipes to KV storage | False |
| `--avoid-overwrite` | Avoid overwriting existing recipes | False |
| `--delay` | Delay between requests in seconds | `1.0` |
| `--health-check` | Perform health check before crawling | False |
| `--list-recipes` | List all stored recipes | False |
| `--limit` | Limit for listing recipes | `50` |
| `--base-url` | Base URL to crawl for recipe discovery | None |
| `--crawl-limit` | Maximum number of recipe URLs to discover | `100` |
| `--recipe-patterns` | Custom regex patterns to identify recipe URLs | Default patterns |
| `--save-history` | Save URL attempt history to file | False |
| `--history-file` | Custom filename for URL history | Auto-generated |
| `--show-stats` | Show URL attempt statistics after crawling | False |

## URL File Format

Create a text file with one URL per line:

```
# Sample recipe URLs
https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/
https://www.allrecipes.com/recipe/12345/another-recipe/
https://www.foodnetwork.com/recipes/recipe-67890/
```

Lines starting with `#` are treated as comments and ignored.

## Output

The crawler generates:

1. **Console Output**: Real-time progress and summary
2. **Log File**: Detailed logs saved to `crawler.log`
3. **Results File**: JSON file with crawl results (default: `crawl_results.json`)
4. **URL History File**: Detailed records of all URL attempts (when using `--save-history`)

### Results Format

```json
[
  {
    "success": true,
    "url": "https://example.com/recipe",
    "data": {
      "name": "Recipe Name",
      "ingredients": [...],
      "instructions": [...],
      ...
    },
    "savedToKV": true,
    "recipeId": "hash-id"
  },
  {
    "success": false,
    "url": "https://example.com/bad-recipe",
    "error": "No valid Recipe JSON-LD found"
  }
]
```

### URL History Format

When using `--save-history`, the crawler creates a detailed JSON file:

```json
{
  "metadata": {
    "scraper_url": "https://recipe-scraper.nolanfoster.workers.dev",
    "exported_at": "2025-08-15 12:30:00",
    "total_records": 10
  },
  "statistics": {
    "total_attempted": 10,
    "successful": 8,
    "failed": 2,
    "skipped": 0,
    "success_rate": 80.0
  },
  "detailed_records": [
    {
      "url": "https://example.com/recipe",
      "timestamp": 1692112200.123,
      "datetime": "2025-08-15 12:30:00",
      "success": true,
      "error": null,
      "already_exists": false,
      "skipped": false
    }
  ]
}
```

## Error Handling

The crawler handles various error scenarios:

- **Network Errors**: Connection timeouts, DNS failures
- **HTTP Errors**: 404, 500, etc.
- **Scraping Errors**: Invalid JSON-LD, missing recipe data
- **File Errors**: Missing URL files, permission issues

All errors are logged and included in the results file.

## Examples

### Example 1: Basic Crawl
```bash
python recipe_crawler.py --url-file recipes.txt --health-check
```

### Example 2: Batch Processing with Overwrite Protection
```bash
python recipe_crawler.py --url-file recipes.txt --batch --avoid-overwrite --output batch_results.json
```

### Example 3: Individual Processing with Custom Delay
```bash
python recipe_crawler.py --url-file recipes.txt --delay 3.0 --output individual_results.json
```

### Example 4: Just Scrape (No Storage)
```bash
python recipe_crawler.py --url-file recipes.txt --no-save --output scrape_only.json
```

### Example 5: Crawl from Base URL
```bash
python recipe_crawler.py --base-url "https://www.allrecipes.com" --crawl-limit 50 --avoid-overwrite
```

### Example 6: Combine Base Crawling with File Input
```bash
python recipe_crawler.py --base-url "https://www.allrecipes.com" --url-file additional_recipes.txt --batch
```
