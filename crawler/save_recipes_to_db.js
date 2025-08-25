#!/usr/bin/env node
/**
 * Script to save extracted La Cucina Italiana recipes to the database
 * using the recipe save worker
 */

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

class RecipeDatabaseSaver {
    constructor(workerUrl = 'https://recipe-save-worker.nolanfoster.workers.dev') {
        this.workerUrl = workerUrl.replace(/\/$/, '');
        this.savedRecipes = [];
        this.failedRecipes = [];
        this.totalProcessed = 0;
    }

    /**
     * Make an HTTP request
     */
    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'User-Agent': 'La Cucina Italiana Recipe Saver',
                    'Content-Type': 'application/json',
                    ...options.headers
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
            
            if (options.body) {
                req.write(options.body);
            }
            
            req.end();
        });
    }

    /**
     * Check if the worker is healthy
     */
    async healthCheck() {
        try {
            const response = await this.makeRequest(`${this.workerUrl}/health`);
            if (response.statusCode === 200) {
                const healthData = JSON.parse(response.data);
                console.log(`Worker health: ${healthData.status || 'unknown'}`);
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
     * Save a single recipe to the database
     * Try different endpoints and approaches to save the recipe data
     */
    async saveRecipeToDatabase(recipeData) {
        try {
            const url = recipeData.url;
            console.log(`Saving recipe: ${recipeData.name}`);
            
            // Try different approaches to save the recipe
            
            // Approach 1: Try POST to root endpoint with recipe data
            console.log('  Trying POST to root endpoint...');
            try {
                const response = await this.makeRequest(`${this.workerUrl}/`, {
                    method: 'POST',
                    body: JSON.stringify(recipeData)
                });
                
                if (response.statusCode === 200) {
                    console.log(`✅ Successfully saved via root endpoint: ${recipeData.name}`);
                    this.savedRecipes.push({
                        name: recipeData.name,
                        url: url,
                        method: 'POST root',
                        workerData: response.data
                    });
                    return { success: true, data: response.data };
                }
            } catch (e) {
                console.log('  Root endpoint failed, trying alternatives...');
            }
            
            // Approach 2: Try POST to /save endpoint
            console.log('  Trying POST to /save endpoint...');
            try {
                const response = await this.makeRequest(`${this.workerUrl}/save`, {
                    method: 'POST',
                    body: JSON.stringify(recipeData)
                });
                
                if (response.statusCode === 200) {
                    console.log(`✅ Successfully saved via /save endpoint: ${recipeData.name}`);
                    this.savedRecipes.push({
                        name: recipeData.name,
                        url: url,
                        method: 'POST /save',
                        workerData: response.data
                    });
                    return { success: true, data: response.data };
                }
            } catch (e) {
                console.log('  /save endpoint failed, trying alternatives...');
            }
            
            // Approach 3: Try POST to /recipe endpoint
            console.log('  Trying POST to /recipe endpoint...');
            try {
                const response = await this.makeRequest(`${this.workerUrl}/recipe`, {
                    method: 'POST',
                    body: JSON.stringify(recipeData)
                });
                
                if (response.statusCode === 200) {
                    console.log(`✅ Successfully saved via /recipe endpoint: ${recipeData.name}`);
                    this.savedRecipes.push({
                        name: recipeData.name,
                        url: url,
                        method: 'POST /recipe',
                        workerData: response.data
                    });
                    return { success: true, data: response.data };
                }
            } catch (e) {
                console.log('  /recipe endpoint failed, trying alternatives...');
            }
            
            // Approach 4: Try GET with query parameters
            console.log('  Trying GET with query parameters...');
            try {
                const queryParams = new URLSearchParams({
                    name: recipeData.name,
                    url: recipeData.url,
                    ingredients: JSON.stringify(recipeData.ingredients),
                    instructions: JSON.stringify(recipeData.instructions)
                });
                
                const response = await this.makeRequest(`${this.workerUrl}/?${queryParams.toString()}`);
                
                if (response.statusCode === 200) {
                    console.log(`✅ Successfully saved via GET endpoint: ${recipeData.name}`);
                    this.savedRecipes.push({
                        name: recipeData.name,
                        url: url,
                        method: 'GET query',
                        workerData: response.data
                    });
                    return { success: true, data: response.data };
                }
            } catch (e) {
                console.log('  GET endpoint failed...');
            }
            
            // If all approaches fail
            console.warn(`⚠️ All save attempts failed for ${recipeData.name}`);
            this.failedRecipes.push({
                name: recipeData.name,
                url: url,
                error: 'All save endpoints failed',
                originalData: recipeData
            });
            return { success: false, error: 'All save endpoints failed' };
            
        } catch (error) {
            console.error(`❌ Error saving ${recipeData.name}: ${error.message}`);
            this.failedRecipes.push({
                name: recipeData.name,
                url: recipeData.url,
                error: error.message,
                originalData: recipeData
            });
            return { success: false, error: error.message };
        }
    }

    /**
     * Save all recipes from the results file
     */
    async saveAllRecipes(resultsFile) {
        try {
            console.log('Loading recipe data from:', resultsFile);
            
            if (!fs.existsSync(resultsFile)) {
                throw new Error(`Results file not found: ${resultsFile}`);
            }
            
            const fileContent = fs.readFileSync(resultsFile, 'utf8');
            const data = JSON.parse(fileContent);
            
            if (!data.results || !Array.isArray(data.results)) {
                throw new Error('Invalid results file format');
            }
            
            // Filter only successful recipes
            const successfulRecipes = data.results.filter(result => 
                result.success && result.data && result.data.name
            );
            
            console.log(`Found ${successfulRecipes.length} successful recipes to save`);
            
            if (successfulRecipes.length === 0) {
                console.log('No recipes to save');
                return;
            }
            
            // Check worker health
            console.log('Checking worker health...');
            if (!(await this.healthCheck())) {
                console.error('Worker is not healthy. Aborting.');
                return;
            }
            
            console.log('Starting to save recipes to database...');
            console.log('='.repeat(60));
            
            // Process recipes with delay to avoid overwhelming the worker
            for (let i = 0; i < successfulRecipes.length; i++) {
                const recipe = successfulRecipes[i];
                this.totalProcessed++;
                
                console.log(`\nProcessing ${i + 1}/${successfulRecipes.length}: ${recipe.data.name}`);
                
                await this.saveRecipeToDatabase(recipe.data);
                
                // Add delay between requests (except for the last one)
                if (i < successfulRecipes.length - 1) {
                    console.log('Waiting 2 seconds before next request...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            console.log('\n' + '='.repeat(60));
            console.log('DATABASE SAVE COMPLETE');
            console.log('='.repeat(60));
            console.log(`Total processed: ${this.totalProcessed}`);
            console.log(`Successfully saved: ${this.savedRecipes.length}`);
            console.log(`Failed: ${this.failedRecipes.length}`);
            console.log(`Success rate: ${((this.savedRecipes.length / this.totalProcessed) * 100).toFixed(1)}%`);
            
            // Save summary to file
            const summary = {
                timestamp: new Date().toISOString(),
                totalProcessed: this.totalProcessed,
                successfullySaved: this.savedRecipes.length,
                failed: this.failedRecipes.length,
                successRate: (this.savedRecipes.length / this.totalProcessed * 100).toFixed(1) + '%',
                savedRecipes: this.savedRecipes.map(r => ({ name: r.name, url: r.url })),
                failedRecipes: this.failedRecipes.map(r => ({ name: r.name, url: r.url, error: r.error }))
            };
            
            const summaryFile = `database_save_summary_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
            console.log(`\nSummary saved to: ${summaryFile}`);
            
        } catch (error) {
            console.error('Error saving recipes:', error.message);
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    let resultsFile = 'lacucinaitaliana_results_2025-08-25T04-50-42.json';
    
    if (args.length > 0) {
        resultsFile = args[0];
    }
    
    console.log('La Cucina Italiana Recipe Database Saver');
    console.log('========================================');
    console.log(`Results file: ${resultsFile}`);
    console.log(`Worker URL: https://recipe-save-worker.nolanfoster.workers.dev`);
    console.log('');
    
    const saver = new RecipeDatabaseSaver();
    await saver.saveAllRecipes(resultsFile);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RecipeDatabaseSaver;