#!/usr/bin/env node

/**
 * Automated Documentation Generator for Seasoned Recipe App
 * 
 * This script automatically generates documentation by:
 * 1. Reading worker source code
 * 2. Parsing API endpoints and functions
 * 3. Extracting database schemas
 * 4. Generating updated HTML documentation
 * 5. Updating package.json and other config files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  workers: [
    {
      name: 'Recipe Search DB',
      path: '../recipe-search-db/src/index.js',
      type: 'worker',
      database: 'D1',
      features: ['Graph Search', 'FTS', 'Node/Edge Management']
    },
    {
      name: 'Clipped Recipe DB',
      path: '../clipped-recipe-db-worker/src/index.js',
      type: 'worker',
      database: 'D1',
      features: ['Recipe CRUD', 'Image Uploads', 'Health Monitoring']
    },
    {
      name: 'Recipe Scraper',
      path: '../recipe-scraper/worker.js',
      type: 'worker',
      database: 'KV',
      features: ['JSON-LD Extraction', 'Batch Processing', 'KV Storage']
    },
    {
      name: 'Recipe Clipper',
      path: '../clipper/src/recipe-clipper.js',
      type: 'worker',
      database: 'KV + AI',
      features: ['AI Extraction', 'GPT-4o-mini', 'Smart Caching']
    },
    {
      name: 'Recipe Crawler',
      path: '../crawler/recipe_crawler.py',
      type: 'python',
      database: 'N/A',
      features: ['Batch Processing', 'Health Monitoring', 'Progress Tracking']
    }
  ],
  sharedLibraries: [
    {
      name: 'KV Storage',
      path: '../shared/kv-storage.js',
      type: 'library',
      features: ['Compression', 'ID Generation', 'CRUD Operations']
    }
  ]
};

// Main generation function
async function generateDocumentation() {
  console.log('🚀 Generating automated documentation...');
  
  try {
    // Parse all workers and libraries
    const workerDocs = await parseWorkers();
    const libraryDocs = await parseLibraries();
    
    // Generate HTML documentation
    const html = generateHTML(workerDocs, libraryDocs);
    
    // Write updated files
    writeUpdatedFiles(html);
    
    console.log('✅ Documentation generated successfully!');
    console.log('📁 Updated files:');
    console.log('   - docs/index.html');
    console.log('   - docs/package.json');
    console.log('   - docs/auto-update.js');
    
  } catch (error) {
    console.error('❌ Error generating documentation:', error);
    process.exit(1);
  }
}

// Parse worker source code
async function parseWorkers() {
  const workerDocs = [];
  
  for (const worker of CONFIG.workers) {
    try {
      const sourcePath = join(__dirname, worker.path);
      
      if (!existsSync(sourcePath)) {
        console.warn(`⚠️  Worker source not found: ${worker.path}`);
        continue;
      }
      
      const sourceCode = readFileSync(sourcePath, 'utf8');
      const parsed = parseWorkerCode(sourceCode, worker);
      workerDocs.push(parsed);
      
      console.log(`📖 Parsed: ${worker.name}`);
      
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${worker.name}:`, error.message);
    }
  }
  
  return workerDocs;
}

// Parse library source code
async function parseLibraries() {
  const libraryDocs = [];
  
  for (const lib of CONFIG.sharedLibraries) {
    try {
      const sourcePath = join(__dirname, lib.path);
      
      if (!existsSync(sourcePath)) {
        console.warn(`⚠️  Library source not found: ${lib.path}`);
        continue;
      }
      
      const sourceCode = readFileSync(sourcePath, 'utf8');
      const parsed = parseLibraryCode(sourceCode, lib);
      libraryDocs.push(parsed);
      
      console.log(`📚 Parsed: ${lib.name}`);
      
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${lib.name}:`, error.message);
    }
  }
  
  return libraryDocs;
}

// Parse worker code to extract endpoints and features
function parseWorkerCode(sourceCode, worker) {
  const endpoints = [];
  const functions = [];
  
  // Extract API endpoints
  const endpointPatterns = [
    // Route patterns
    /if\s*\(path(?:name)?\s*===?\s*['"`]([^'"`]+)['"`]\s*&&\s*request\.method\s*===?\s*['"`]([^'"`]+)['"`]/g,
    /if\s*\(path(?:name)?\.startsWith\(['"`]([^'"`]+)['"`]\)\s*&&\s*request\.method\s*===?\s*['"`]([^'"`]+)['"`]/g,
    // Function definitions
    /async\s+function\s+(\w+)\s*\(/g,
    /const\s+(\w+)\s*=\s*async\s*\(/g
  ];
  
  // Extract endpoints from route patterns
  let match;
  const routePattern = /if\s*\(path(?:name)?\s*===?\s*['"`]([^'"`]+)['"`]\s*&&\s*request\.method\s*===?\s*['"`]([^'"`]+)['"`]/g;
  
  while ((match = routePattern.exec(sourceCode)) !== null) {
    const path = match[1];
    const method = match[2];
    
    if (path && method) {
      endpoints.push({
        path,
        method: method.toUpperCase(),
        description: extractEndpointDescription(sourceCode, path)
      });
    }
  }
  
  // Extract function definitions
  const functionPattern = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  while ((match = functionPattern.exec(sourceCode)) !== null) {
    const funcName = match[1];
    if (funcName && !funcName.startsWith('_')) {
      functions.push({
        name: funcName,
        description: extractFunctionDescription(sourceCode, funcName)
      });
    }
  }
  
  return {
    ...worker,
    endpoints,
    functions,
    sourceCode: sourceCode.substring(0, 1000) + '...' // Truncated for display
  };
}

// Parse library code
function parseLibraryCode(sourceCode, library) {
  const functions = [];
  
  // Extract exported functions
  const exportPattern = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  let match;
  
  while ((match = exportPattern.exec(sourceCode)) !== null) {
    const funcName = match[1];
    functions.push({
      name: funcName,
      description: extractFunctionDescription(sourceCode, funcName)
    });
  }
  
  return {
    ...library,
    functions,
    sourceCode: sourceCode.substring(0, 1000) + '...'
  };
}

// Extract endpoint description from code
function extractEndpointDescription(sourceCode, path) {
  // Look for comments above the endpoint
  const lines = sourceCode.split('\n');
  const pathIndex = lines.findIndex(line => line.includes(path));
  
  if (pathIndex > 0) {
    // Look for comments above
    for (let i = pathIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*')) {
        return line.replace(/^\/\/\s*/, '').replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '');
      }
      if (line && !line.startsWith('//') && !line.startsWith('/*')) {
        break;
      }
    }
  }
  
  // Default descriptions based on path
  const pathDescriptions = {
    '/health': 'Health check endpoint',
    '/recipes': 'List all recipes',
    '/recipe': 'Recipe CRUD operations',
    '/upload-image': 'Image upload endpoint',
    '/clip': 'Recipe clipping endpoint',
    '/scrape': 'Recipe scraping endpoint',
    '/api/nodes': 'Graph node operations',
    '/api/edges': 'Graph edge operations',
    '/api/search': 'Search functionality',
    '/api/graph': 'Graph visualization'
  };
  
  return pathDescriptions[path] || `Endpoint for ${path}`;
}

// Extract function description from code
function extractFunctionDescription(sourceCode, funcName) {
  const lines = sourceCode.split('\n');
  const funcIndex = lines.findIndex(line => line.includes(`function ${funcName}`));
  
  if (funcIndex > 0) {
    // Look for JSDoc or comments above
    for (let i = funcIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('/**') || line.startsWith('*')) {
        return line.replace(/^\/\*\*\s*/, '').replace(/^\*\s*/, '').replace(/\s*\*\/$/, '');
      }
      if (line.startsWith('//')) {
        return line.replace(/^\/\/\s*/, '');
      }
      if (line && !line.startsWith('//') && !line.startsWith('*')) {
        break;
      }
    }
  }
  
  return `Function ${funcName}`;
}

// Generate HTML documentation
function generateHTML(workerDocs, libraryDocs) {
  const timestamp = new Date().toISOString();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seasoned Recipe App - Developer Documentation</title>
    <link rel="stylesheet" href="styles.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <meta name="generated" content="${timestamp}">
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="header-content">
                <h1 class="title">🍳 Seasoned Recipe App</h1>
                <p class="subtitle">Developer Documentation & API Reference</p>
                <p class="auto-generated">🔄 Auto-generated from source code - ${timestamp}</p>
            </div>
        </header>

        <nav class="sidebar">
            <div class="sidebar-content">
                <div class="nav-section">
                    <h3>Overview</h3>
                    <ul>
                        <li><a href="#introduction">Introduction</a></li>
                        <li><a href="#architecture">Architecture</a></li>
                        <li><a href="#getting-started">Getting Started</a></li>
                    </ul>
                </div>

                <div class="nav-section">
                    <h3>Workers</h3>
                    <ul>
                        ${workerDocs.map(worker => `<li><a href="#${worker.name.toLowerCase().replace(/\s+/g, '-')}">${worker.name}</a></li>`).join('')}
                    </ul>
                </div>

                <div class="nav-section">
                    <h3>Shared Libraries</h3>
                    <ul>
                        ${libraryDocs.map(lib => `<li><a href="#${lib.name.toLowerCase().replace(/\s+/g, '-')}">${lib.name}</a></li>`).join('')}
                    </ul>
                </div>

                <div class="nav-section">
                    <h3>Development</h3>
                    <ul>
                        <li><a href="#testing">Testing</a></li>
                        <li><a href="#deployment">Deployment</a></li>
                        <li><a href="#troubleshooting">Troubleshooting</a></li>
                    </ul>
                </div>
            </div>
        </nav>

        <main class="main-content">
            <section id="introduction" class="section">
                <h2>Introduction</h2>
                <p>Seasoned is a modern recipe management application built with a microservices architecture using Cloudflare Workers. The application provides recipe clipping, storage, search, and management capabilities through a collection of specialized workers.</p>
                
                <div class="auto-update-info">
                    <h3>🔄 Auto-Update Information</h3>
                    <p>This documentation is automatically generated from your source code. When you update your workers, run the generation script to update the docs:</p>
                    <pre><code>npm run docs:generate</code></pre>
                    <p><strong>Last Generated:</strong> ${timestamp}</p>
                </div>
                
                <div class="feature-grid">
                    <div class="feature-card">
                        <h4>🎯 Recipe Clipping</h4>
                        <p>AI-powered recipe extraction from any recipe website</p>
                    </div>
                    <div class="feature-card">
                        <h4>🔍 Graph Search</h4>
                        <p>Advanced recipe search with ingredient and tag relationships</p>
                    </div>
                    <div class="feature-card">
                        <h4>💾 Multi-Storage</h4>
                        <p>Hybrid storage using KV, D1, and R2 for optimal performance</p>
                    </div>
                    <div class="feature-card">
                        <h4>🚀 Edge Computing</h4>
                        <p>Global deployment with Cloudflare Workers for low latency</p>
                    </div>
                </div>
            </section>

            <section id="architecture" class="section">
                <h2>Architecture Overview</h2>
                <div class="architecture-diagram">
                    <div class="arch-layer">
                        <h4>Frontend (React + Vite)</h4>
                        <p>Modern web interface for recipe management</p>
                    </div>
                    <div class="arch-layer">
                        <h4>API Gateway & Workers</h4>
                        <ul>
                            ${workerDocs.map(worker => `<li><strong>${worker.name}:</strong> ${worker.features.join(', ')}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="arch-layer">
                        <h4>Storage Layer</h4>
                        <ul>
                            <li><strong>Cloudflare KV:</strong> Caching and temporary storage</li>
                            <li><strong>Cloudflare D1:</strong> SQLite database for recipes</li>
                            <li><strong>Cloudflare R2:</strong> Image storage</li>
                        </ul>
                    </div>
                </div>
            </section>

            ${workerDocs.map(worker => generateWorkerSection(worker)).join('')}
            
            ${libraryDocs.map(lib => generateLibrarySection(lib)).join('')}

            <section id="testing" class="section">
                <h2>Testing</h2>
                <p>Each worker includes comprehensive testing to ensure reliability and functionality.</p>
                
                <h3>Test Structure</h3>
                <div class="test-grid">
                    <div class="test-section">
                        <h4>Unit Tests</h4>
                        <ul>
                            <li>Core functionality testing</li>
                            <li>API endpoint validation</li>
                            <li>Error handling verification</li>
                        </ul>
                    </div>
                    
                    <div class="test-section">
                        <h4>Integration Tests</h4>
                        <ul>
                            <li>Worker-to-worker communication</li>
                            <li>Database operations</li>
                            <li>Storage system integration</li>
                        </ul>
                    </div>
                    
                    <div class="test-section">
                        <h4>End-to-End Tests</h4>
                        <ul>
                            <li>Complete workflow testing</li>
                            <li>Real URL processing</li>
                            <li>Performance validation</li>
                        </ul>
                    </div>
                </div>

                <h3>Running Tests</h3>
                <div class="example-section">
                    ${workerDocs.map(worker => `
                    <h4>${worker.name}</h4>
                    <pre><code>cd ${worker.path.split('/')[1]}
npm test</code></pre>
                    `).join('')}
                </div>
            </section>

            <section id="deployment" class="section">
                <h2>Deployment</h2>
                <p>All workers are designed for easy deployment to Cloudflare Workers with proper environment configuration.</p>
                
                <h3>Deployment Commands</h3>
                <div class="deployment-grid">
                    <div class="deployment-step">
                        <h4>1. Build & Deploy</h4>
                        <pre><code>npm run deploy</code></pre>
                    </div>
                    
                    <div class="deployment-step">
                        <h4>2. Environment Variables</h4>
                        <pre><code>wrangler secret put MY_SECRET</code></pre>
                    </div>
                    
                    <div class="deployment-step">
                        <h4>3. Database Binding</h4>
                        <pre><code>wrangler d1 execute DB --file=./schema.sql</code></pre>
                    </div>
                </div>

                <h3>Environment Configuration</h3>
                <p>Each worker requires specific environment variables and bindings:</p>
                <ul>
                    <li><strong>D1 Databases:</strong> For SQLite storage</li>
                    <li><strong>KV Namespaces:</strong> For caching and temporary storage</li>
                    <li><strong>R2 Buckets:</strong> For image storage</li>
                    <li><strong>AI Bindings:</strong> For Workers AI functionality</li>
                </ul>
            </section>

            <section id="troubleshooting" class="section">
                <h2>Troubleshooting</h2>
                <p>Common issues and solutions for the Seasoned recipe app workers.</p>
                
                <div class="troubleshooting-grid">
                    <div class="issue">
                        <h4>Database Connection Errors</h4>
                        <p><strong>Symptoms:</strong> 500 errors, database not found</p>
                        <p><strong>Solutions:</strong></p>
                        <ul>
                            <li>Verify D1 database ID in wrangler.toml</li>
                            <li>Check database binding names</li>
                            <li>Ensure database exists and is accessible</li>
                        </ul>
                    </div>
                    
                    <div class="issue">
                        <h4>KV Storage Issues</h4>
                        <p><strong>Symptoms:</strong> Storage failures, data corruption</p>
                        <p><strong>Solutions:</strong></p>
                        <ul>
                            <li>Check KV namespace bindings</li>
                            <li>Verify namespace permissions</li>
                            <li>Check for data compression issues</li>
                        </ul>
                    </div>
                    
                    <div class="issue">
                        <h4>CORS Errors</h4>
                        <p><strong>Symptoms:</strong> Frontend can't access API</p>
                        <p><strong>Solutions:</strong></p>
                        <ul>
                            <li>Verify CORS headers in worker responses</li>
                            <li>Check frontend origin configuration</li>
                            <li>Ensure preflight requests are handled</li>
                        </ul>
                    </div>
                    
                    <div class="issue">
                        <h4>Image Upload Failures</h4>
                        <p><strong>Symptoms:</strong> 500 errors on image upload</p>
                        <p><strong>Solutions:</strong></p>
                        <ul>
                            <li>Check R2 bucket permissions</li>
                            <li>Verify bucket binding names</li>
                            <li>Check file size limits</li>
                        </ul>
                    </div>
                </div>

                <h3>Debug Mode</h3>
                <p>Enable debug logging to troubleshoot issues:</p>
                <pre><code># Enable worker logging
wrangler tail

# Check worker logs
wrangler logs tail

# Test endpoints locally
wrangler dev</code></pre>
            </section>
        </main>
    </div>

    <script src="script.js"></script>
</body>
</html>`;
}

// Generate worker section HTML
function generateWorkerSection(worker) {
  const endpoints = worker.endpoints || [];
  const functions = worker.functions || [];
  
  return `
            <section id="${worker.name.toLowerCase().replace(/\s+/g, '-')}" class="section">
                <h2>${worker.name} Worker</h2>
                <p>${worker.features.join(', ')}</p>
                
                <div class="worker-info">
                    <div class="info-card">
                        <h4>📍 Location</h4>
                        <p><code>${worker.path.split('/')[1]}/</code></p>
                    </div>
                    <div class="info-card">
                        <h4>🗄️ Database</h4>
                        <p>${worker.database}</p>
                    </div>
                    <div class="info-card">
                        <h4>🔧 Main Features</h4>
                        <p>${worker.features.join(', ')}</p>
                    </div>
                </div>

                ${endpoints.length > 0 ? `
                <h3>API Endpoints</h3>
                <div class="endpoint-grid">
                    ${endpoints.map(endpoint => `
                    <div class="endpoint">
                        <h4>${endpoint.method} ${endpoint.path}</h4>
                        <p>${endpoint.description}</p>
                    </div>
                    `).join('')}
                </div>
                ` : ''}

                ${functions.length > 0 ? `
                <h3>Key Functions</h3>
                <div class="function-grid">
                    ${functions.map(func => `
                    <div class="function">
                        <h4><code>${func.name}()</code></h4>
                        <p>${func.description}</p>
                    </div>
                    `).join('')}
                </div>
                ` : ''}

                <div class="source-code-preview">
                    <h3>Source Code Preview</h3>
                    <pre><code>${worker.sourceCode}</code></pre>
                </div>
            </section>`;
}

// Generate library section HTML
function generateLibrarySection(library) {
  const functions = library.functions || [];
  
  return `
            <section id="${library.name.toLowerCase().replace(/\s+/g, '-')}" class="section">
                <h2>${library.name} Library</h2>
                <p>${library.features.join(', ')}</p>
                
                <div class="worker-info">
                    <div class="info-card">
                        <h4>📍 Location</h4>
                        <p><code>${library.path.split('/')[1]}/</code></p>
                    </div>
                    <div class="info-card">
                        <h4>🔧 Main Features</h4>
                        <p>${library.features.join(', ')}</p>
                    </div>
                </div>

                ${functions.length > 0 ? `
                <h3>Key Functions</h3>
                <div class="function-grid">
                    ${functions.map(func => `
                    <div class="function">
                        <h4><code>${func.name}()</code></h4>
                        <p>${func.description}</p>
                    </div>
                    `).join('')}
                </div>
                ` : ''}

                <div class="source-code-preview">
                    <h3>Source Code Preview</h3>
                    <pre><code>${library.sourceCode}</code></pre>
                </div>
            </section>`;
}

// Write updated files
function writeUpdatedFiles(html) {
  const docsDir = join(__dirname, '../docs');
  
  // Ensure docs directory exists
  if (!existsSync(docsDir)) {
    mkdirSync(docsDir, { recursive: true });
  }
  
  // Write updated HTML
  writeFileSync(join(docsDir, 'index.html'), html);
  
  // Update package.json with new scripts
  const packageJson = {
    name: "seasoned-recipe-app-docs",
    version: "1.0.0",
    description: "Developer documentation for the Seasoned Recipe App (Auto-generated)",
    main: "index.html",
    scripts: {
      "dev": "python3 -m http.server 8000",
      "serve": "python3 -m http.server 8000",
      "deploy": "./deploy.sh",
      "deploy:wrangler": "wrangler pages deploy . --project-name=seasoned-docs",
      "build": "echo 'No build step required - static HTML documentation'",
      "preview": "python3 -m http.server 8000",
      "docs:generate": "node ../scripts/generate-docs.js",
      "docs:watch": "nodemon ../scripts/generate-docs.js --watch ../src --watch ../clipped-recipe-db-worker/src --watch ../recipe-scraper --watch ../clipper/src --watch ../shared"
    },
    keywords: [
      "documentation",
      "cloudflare-workers",
      "recipe-app",
      "api-docs",
      "developer-docs",
      "auto-generated"
    ],
    author: "Seasoned Recipe App Team",
    license: "MIT",
    devDependencies: {},
    dependencies: {},
    engines: {
      "node": ">=14.0.0"
    },
    repository: {
      "type": "git",
      "url": "https://github.com/your-username/recipe-app.git",
      "directory": "docs"
    },
    homepage: "https://your-docs-project.pages.dev"
  };
  
  writeFileSync(join(docsDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  
  // Create auto-update script
  const autoUpdateScript = `
// Auto-update script for documentation
// This file is automatically generated - do not edit manually

console.log('🔄 Documentation auto-update system loaded');

// Check for updates every 5 minutes
setInterval(() => {
  console.log('Checking for documentation updates...');
  // You can add logic here to check for source code changes
}, 5 * 60 * 1000);

export default {
  // Auto-update functionality
  checkForUpdates: () => {
    console.log('Checking for updates...');
  }
};
`;
  
  writeFileSync(join(docsDir, 'auto-update.js'), autoUpdateScript);
  
  console.log('📝 Updated documentation files');
}

// Run the generator
generateDocumentation();
