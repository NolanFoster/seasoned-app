#!/usr/bin/env node
/**
 * Debug script to examine JSON-LD data from La Cucina Italiana
 */

const https = require('https');
const { URL } = require('url');

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
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
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

function extractJsonLd(html) {
    const jsonLdScripts = [];
    
    // Look for JSON-LD scripts
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    
    while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
            const jsonContent = match[1].trim();
            console.log('Found JSON-LD script:');
            console.log('Raw content length:', jsonContent.length);
            console.log('First 200 chars:', jsonContent.substring(0, 200));
            
            const parsed = JSON.parse(jsonContent);
            console.log('Parsed successfully, type:', typeof parsed);
            
            // Handle both single objects and arrays
            if (Array.isArray(parsed)) {
                console.log('Array with', parsed.length, 'items');
                jsonLdScripts.push(...parsed);
            } else {
                console.log('Single object');
                jsonLdScripts.push(parsed);
            }
        } catch (e) {
            console.warn(`Failed to parse JSON-LD script: ${e.message}`);
        }
    }
    
    return jsonLdScripts;
}

function hasRecipeJsonLd(jsonLdData) {
    if (!jsonLdData || !Array.isArray(jsonLdData)) return false;
    
    for (const item of jsonLdData) {
        if (!item || typeof item !== 'object') continue;
        
        console.log('Checking item:', JSON.stringify(item, null, 2).substring(0, 200) + '...');
        
        // Check direct Recipe type
        if (item['@type'] === 'Recipe') {
            console.log('Found direct Recipe type');
            return true;
        }
        
        // Check for Recipe in @graph
        if (item['@graph'] && Array.isArray(item['@graph'])) {
            for (const graphItem of item['@graph']) {
                if (graphItem && graphItem['@type'] === 'Recipe') {
                    console.log('Found Recipe in @graph');
                    return true;
                }
            }
        }
        
        // Check for array of types including Recipe
        if (Array.isArray(item['@type']) && item['@type'].includes('Recipe')) {
            console.log('Found Recipe in array of types');
            return true;
        }
    }
    
    return false;
}

async function main() {
    const testUrl = 'https://www.lacucinaitaliana.com/recipe/pasta/caserecce-with-broccoli-and-tuna';
    
    console.log('Testing JSON-LD extraction from:', testUrl);
    console.log('='.repeat(60));
    
    try {
        const response = await makeRequest(testUrl);
        console.log(`Response status: ${response.statusCode}`);
        console.log(`Content length: ${response.data.length} characters`);
        
        if (response.statusCode === 200) {
            console.log('\nExtracting JSON-LD data...');
            const jsonLdData = extractJsonLd(response.data);
            
            console.log(`\nFound ${jsonLdData.length} JSON-LD scripts`);
            
            if (jsonLdData.length > 0) {
                console.log('\nChecking for recipe data...');
                const hasRecipe = hasRecipeJsonLd(jsonLdData);
                console.log(`Has recipe JSON-LD: ${hasRecipe}`);
                
                if (hasRecipe) {
                    console.log('\nRecipe JSON-LD found! Here\'s the data:');
                    jsonLdData.forEach((item, index) => {
                        if (item && typeof item === 'object') {
                            console.log(`\n--- Script ${index + 1} ---`);
                            console.log(JSON.stringify(item, null, 2));
                        }
                    });
                }
            }
        } else {
            console.error('Failed to fetch page');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();