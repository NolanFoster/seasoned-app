#!/usr/bin/env node

/**
 * Setup script for USER_DB in User Management Worker
 * This script helps initialize the database schema and optionally creates test data
 * 
 * Usage:
 *   node setup-user-db.js [--env=production|staging|preview] [--create-test-data]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  databaseName: 'user-db',
  schemaFile: './schema.sql',
  environments: ['production', 'staging', 'preview']
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ERROR: ${message}`, 'red');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    env: 'preview', // default to preview
    createTestData: false
  };

  args.forEach(arg => {
    if (arg.startsWith('--env=')) {
      const env = arg.split('=')[1];
      if (CONFIG.environments.includes(env)) {
        options.env = env;
      } else {
        logError(`Invalid environment: ${env}. Must be one of: ${CONFIG.environments.join(', ')}`);
        process.exit(1);
      }
    } else if (arg === '--create-test-data') {
      options.createTestData = true;
    }
  });

  return options;
}

// Check if wrangler is installed
function checkWrangler() {
  try {
    execSync('wrangler --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Check if schema file exists
function checkSchemaFile() {
  const schemaPath = path.resolve(CONFIG.schemaFile);
  if (!fs.existsSync(schemaPath)) {
    logError(`Schema file not found: ${schemaPath}`);
    return false;
  }
  return true;
}

// Get database ID from wrangler.toml
function getDatabaseId(env) {
  try {
    const wranglerPath = path.resolve('./wrangler.toml');
    if (!fs.existsSync(wranglerPath)) {
      logError('wrangler.toml not found in current directory');
      return null;
    }

    const wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
    const lines = wranglerContent.split('\n');
    
    let currentEnv = null;
    let databaseId = null;

    for (const line of lines) {
      if (line.startsWith('[env.')) {
        currentEnv = line.match(/\[env\.(\w+)\]/)?.[1];
      } else if (currentEnv === env && line.includes('database_id')) {
        const match = line.match(/database_id\s*=\s*"([^"]+)"/);
        if (match) {
          databaseId = match[1];
          break;
        }
      }
    }

    if (!databaseId) {
      logWarning(`Database ID not found for environment: ${env}`);
      logInfo('You may need to create the database first or update wrangler.toml');
    }

    return databaseId;
  } catch (error) {
    logError(`Error reading wrangler.toml: ${error.message}`);
    return null;
  }
}

// Create database if it doesn't exist
function createDatabase() {
  try {
    logInfo('Creating D1 database...');
    const output = execSync(`wrangler d1 create ${CONFIG.databaseName}`, { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    // Extract database ID from output
    const match = output.match(/Created D1 database '([^']+)' in region ([^\s]+) with ID ([^\s]+)/);
    if (match) {
      const [, name, region, id] = match;
      logSuccess(`Database created: ${name} (${id}) in ${region}`);
      return id;
    } else {
      logWarning('Database created but ID not found in output');
      return null;
    }
  } catch (error) {
    if (error.message.includes('already exists')) {
      logInfo('Database already exists');
      return null;
    } else {
      logError(`Failed to create database: ${error.message}`);
      return null;
    }
  }
}

// Apply schema to database
function applySchema(env, databaseId = null) {
  try {
    logInfo(`Applying schema to ${env} environment...`);
    
    let command = `wrangler d1 execute ${CONFIG.databaseName}`;
    
    if (env !== 'preview') {
      command += ` --env=${env}`;
    }
    
    if (databaseId) {
      command += ` --local=false`;
    }
    
    command += ` --file=${CONFIG.schemaFile}`;
    
    execSync(command, { stdio: 'inherit' });
    logSuccess('Schema applied successfully');
    return true;
  } catch (error) {
    logError(`Failed to apply schema: ${error.message}`);
    return false;
  }
}

// Create test data
function createTestData(env) {
  try {
    logInfo('Creating test data...');
    
    const testDataSQL = `
-- Insert test users
INSERT INTO users (user_id, email_hash, status, account_type, email_verified) VALUES
('test_user_1_hash', 'test1@example.com_hash', 'ACTIVE', 'FREE', TRUE),
('test_user_2_hash', 'test2@example.com_hash', 'ACTIVE', 'PREMIUM', TRUE),
('admin_user_hash', 'admin@example.com_hash', 'ACTIVE', 'ADMIN', TRUE);

-- Insert test login history
INSERT INTO user_login_history (user_id, ip_address, login_method, success, risk_score) VALUES
('test_user_1_hash', '192.168.1.100', 'OTP', TRUE, 10),
('test_user_2_hash', '192.168.1.101', 'OTP', TRUE, 15);
`;

    const testDataFile = './test-data.sql';
    fs.writeFileSync(testDataFile, testDataSQL);

    let command = `wrangler d1 execute ${CONFIG.databaseName}`;
    
    if (env !== 'preview') {
      command += ` --env=${env}`;
    }
    
    command += ` --file=${testDataFile}`;
    
    execSync(command, { stdio: 'inherit' });
    
    // Clean up test data file
    fs.unlinkSync(testDataFile);
    
    logSuccess('Test data created successfully');
    return true;
  } catch (error) {
    logError(`Failed to create test data: ${error.message}`);
    return false;
  }
}

// Verify database setup
function verifySetup(env) {
  try {
    logInfo('Verifying database setup...');
    
    let command = `wrangler d1 execute ${CONFIG.databaseName}`;
    
    if (env !== 'preview') {
      command += ` --env=${env}`;
    }
    
    command += ` --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"`;
    
    const output = execSync(command, { stdio: 'pipe', encoding: 'utf8' });
    
    const expectedTables = ['users', 'user_login_history'];
    const foundTables = output.split('\n')
      .filter(line => line.trim() && !line.startsWith('name'))
      .map(line => line.trim());
    
    const missingTables = expectedTables.filter(table => !foundTables.includes(table));
    
    if (missingTables.length === 0) {
      logSuccess('All expected tables found');
      return true;
    } else {
      logError(`Missing tables: ${missingTables.join(', ')}`);
      return false;
    }
  } catch (error) {
    logError(`Failed to verify setup: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  log('🚀 User Management Worker - USER_DB Setup Script', 'bright');
  log('================================================', 'bright');
  
  const options = parseArgs();
  
  logInfo(`Target environment: ${options.env}`);
  logInfo(`Create test data: ${options.createTestData ? 'Yes' : 'No'}`);
  
  // Check prerequisites
  if (!checkWrangler()) {
    logError('Wrangler CLI not found. Please install it first: npm install -g wrangler');
    process.exit(1);
  }
  
  if (!checkSchemaFile()) {
    process.exit(1);
  }
  
  // Get or create database
  let databaseId = getDatabaseId(options.env);
  if (!databaseId) {
    if (options.env === 'preview') {
      databaseId = createDatabase();
    } else {
      logError(`Cannot proceed without database ID for ${options.env} environment`);
      logInfo('Please create the database manually or check wrangler.toml configuration');
      process.exit(1);
    }
  }
  
  // Apply schema
  if (!applySchema(options.env, databaseId)) {
    process.exit(1);
  }
  
  // Verify setup
  if (!verifySetup(options.env)) {
    process.exit(1);
  }
  
  // Create test data if requested
  if (options.createTestData) {
    if (!createTestData(options.env)) {
      logWarning('Test data creation failed, but database setup was successful');
    }
  }
  
  logSuccess('USER_DB setup completed successfully!');
  log('');
  log('Next steps:', 'bright');
  log('1. Update your wrangler.toml with the database ID if needed');
  log('2. Test the database connection in your user-management-worker');
  log('3. Deploy the worker to your target environment');
  log('');
  
  if (databaseId) {
    logInfo(`Database ID: ${databaseId}`);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    logError(`Unexpected error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, checkWrangler, checkSchemaFile };
