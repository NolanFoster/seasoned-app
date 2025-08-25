#!/usr/bin/env node
/**
 * Debug script for La Cucina Italiana crawler
 */

const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

async function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity', // Don't accept compression
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        };
        
        const req = https.request(requestOptions, (res) => {
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
        
        req.end();
    });
}

function extractRecipeUrls(html) {
    console.log('HTML length:', html.length);
    
    // Show first 1000 characters of HTML
    console.log('\nFirst 1000 characters of HTML:');
    console.log(html.substring(0, 1000));
    
    // Show last 1000 characters of HTML
    console.log('\nLast 1000 characters of HTML:');
    console.log(html.substring(html.length - 1000));
    
    // Look for recipe URLs in different patterns
    const patterns = [
        /href=["'](\/recipe\/[^"']+)["']/gi,
        /href=["']([^"']*\/recipe\/[^"']*)["']/gi,
        /href=["']([^"']*\/recipes\/[^"']*)["']/gi
    ];
    
    const foundUrls = new Set();
    
    patterns.forEach((pattern, index) => {
        console.log(`\nTrying pattern ${index + 1}:`, pattern);
        let match;
        let count = 0;
        
        while ((match = pattern.exec(html)) !== null && count < 20) {
            const href = match[1];
            console.log(`  Found: ${href}`);
            foundUrls.add(href);
            count++;
        }
        
        console.log(`Pattern ${index + 1} found ${count} URLs`);
    });
    
    // Also look for any href attributes
    console.log('\nLooking for any href attributes...');
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let hrefMatch;
    let hrefCount = 0;
    
    while ((hrefMatch = hrefRegex.exec(html)) !== null && hrefCount < 50) {
        const href = hrefMatch[1];
        if (href.includes('recipe') || href.includes('pasta') || href.includes('pizza')) {
            console.log(`  Recipe-like href: ${href}`);
        }
        hrefCount++;
    }
    
    console.log(`Total href attributes found: ${hrefCount}`);
    
    // Look for any text that might contain recipe URLs
    console.log('\nLooking for recipe-related text...');
    const recipeTextRegex = /\/recipe\/[^\s"']+/gi;
    let recipeTextMatch;
    let recipeTextCount = 0;
    
    while ((recipeTextMatch = recipeTextRegex.exec(html)) !== null && recipeTextCount < 20) {
        console.log(`  Recipe text found: ${recipeTextMatch[0]}`);
        recipeTextCount++;
    }
    
    return foundUrls;
}

async function main() {
    try {
        console.log('Debugging La Cucina Italiana recipe discovery...\n');
        
        const url = 'https://www.lacucinaitaliana.com/recipes';
        console.log(`Fetching: ${url}`);
        
        const response = await makeRequest(url);
        console.log(`Status: ${response.statusCode}`);
        console.log(`Content-Type: ${response.headers['content-type']}`);
        console.log(`Content-Encoding: ${response.headers['content-encoding'] || 'none'}`);
        
        if (response.statusCode === 200) {
            console.log('\nExtracting recipe URLs...');
            const recipeUrls = extractRecipeUrls(response.data);
            
            console.log(`\nTotal unique recipe URLs found: ${recipeUrls.size}`);
            if (recipeUrls.size > 0) {
                console.log('\nRecipe URLs:');
                Array.from(recipeUrls).forEach((url, index) => {
                    console.log(`${index + 1}. ${url}`);
                });
            }
        } else {
            console.error(`Failed to fetch page: ${response.statusCode}`);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();