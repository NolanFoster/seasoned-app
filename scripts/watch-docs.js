#!/usr/bin/env node

/**
 * Watch Script for Documentation Auto-Generation
 * 
 * This script monitors your source code files and automatically
 * regenerates documentation when changes are detected.
 * 
 * Usage: node scripts/watch-docs.js
 */

import { watch } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration for files to watch
const WATCH_PATHS = [
  '../recipe-search-db/src',
  '../clipped-recipe-db-worker/src',
  '../recipe-scraper',
  '../clipper/src',
  '../shared',
  '../crawler'
];

// Debounce timer
let debounceTimer = null;
const DEBOUNCE_DELAY = 1000; // 1 second

console.log('👀 Starting documentation watcher...');
console.log('📁 Watching directories:');
WATCH_PATHS.forEach(path => console.log(`   - ${path}`));
console.log('');

// Function to regenerate documentation
function regenerateDocs() {
  console.log('🔄 Source code changed, regenerating documentation...');
  
  const generator = spawn('node', ['scripts/generate-docs.js'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit'
  });
  
  generator.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Documentation regenerated successfully!');
      console.log('📚 Open docs/index.html in your browser to view changes');
    } else {
      console.error('❌ Documentation generation failed');
    }
  });
}

// Debounced regeneration function
function debouncedRegenerate() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  debounceTimer = setTimeout(() => {
    regenerateDocs();
  }, DEBOUNCE_DELAY);
}

// Watch each directory
WATCH_PATHS.forEach(watchPath => {
  const fullPath = join(__dirname, watchPath);
  
  try {
    watch(fullPath, { recursive: true }, (eventType, filename) => {
      if (filename && !filename.includes('node_modules') && !filename.includes('.git')) {
        console.log(`📝 ${eventType}: ${filename} in ${watchPath}`);
        debouncedRegenerate();
      }
    });
    
    console.log(`✅ Watching: ${watchPath}`);
  } catch (error) {
    console.warn(`⚠️  Could not watch ${watchPath}: ${error.message}`);
  }
});

console.log('');
console.log('🚀 Documentation watcher is now active!');
console.log('📝 Make changes to your source code and watch the docs update automatically');
console.log('🛑 Press Ctrl+C to stop watching');
console.log('');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 Stopping documentation watcher...');
  process.exit(0);
});

// Keep the process alive
process.stdin.resume();
