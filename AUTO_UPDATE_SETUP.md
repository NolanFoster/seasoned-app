# 🚀 Automated Documentation System Setup

This guide will help you set up **automatic documentation updates** that sync with your code changes in real-time!

## 🎯 **What You Get**

✅ **Real-time Sync**: Documentation automatically updates when you change code  
✅ **GitHub Actions**: Automatic deployment on code pushes  
✅ **Local Watching**: Watch files locally for instant updates  
✅ **Smart Parsing**: Automatically extracts endpoints, functions, and features  
✅ **Zero Maintenance**: Set it up once, works forever  

## 🛠️ **Setup Steps**

### **Step 1: Install Dependencies**

```bash
# Navigate to scripts directory
cd scripts

# Install dependencies
npm install

# Make scripts executable
chmod +x generate-docs.js
chmod +x watch-docs.js
```

### **Step 2: Test the Generator**

```bash
# Generate documentation from your current code
npm run generate

# Check that docs/index.html was updated
ls -la ../docs/
```

### **Step 3: Set Up GitHub Secrets**

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:
- `CLOUDFLARE_PAGES_PROJECT_NAME`: Your main docs project name
- `CLOUDFLARE_PAGES_STAGING_PROJECT_NAME`: Your staging docs project name

### **Step 4: Configure Cloudflare Authentication**

```bash
# Login to Cloudflare (if not already done)
wrangler login

# Test deployment
cd ../docs
wrangler pages deploy . --project-name=your-project-name
```

## 🚀 **Usage Options**

### **Option 1: Manual Generation**

```bash
# Generate docs once
npm run docs:generate

# Generate and deploy
npm run docs:auto
```

### **Option 2: Local File Watching**

```bash
# Start watching for changes
npm run docs:watch

# Make changes to your code - docs update automatically!
```

### **Option 3: GitHub Actions (Automatic)**

The GitHub Actions workflow automatically:
- Detects code changes
- Generates updated documentation
- Commits changes to your repo
- Deploys to Cloudflare Pages
- Comments on PRs

## 🔧 **How It Works**

### **Code Parsing**
The generator automatically:
1. **Reads your worker source code**
2. **Extracts API endpoints** from route patterns
3. **Identifies functions** and their descriptions
4. **Parses comments** for documentation
5. **Generates HTML** with all the information

### **Smart Detection**
- **Route Patterns**: `if (path === '/api/endpoint' && method === 'POST')`
- **Function Definitions**: `async function functionName()`
- **Comments**: `// This endpoint does X` or `/** JSDoc comment */`
- **File Changes**: Monitors all source directories

### **Auto-Deployment**
- **Local Changes**: Watch script regenerates docs instantly
- **Git Pushes**: GitHub Actions auto-deploys to Cloudflare Pages
- **PR Updates**: Comments on pull requests when docs change

## 📁 **File Structure**

```
recipe-app/
├── scripts/
│   ├── generate-docs.js      # Main generator
│   ├── watch-docs.js         # File watcher
│   └── package.json          # Script dependencies
├── docs/
│   ├── index.html            # Auto-generated docs
│   ├── styles.css            # Styling
│   ├── script.js             # Interactive features
│   └── package.json          # Updated with auto-scripts
├── .github/workflows/
│   └── auto-docs.yml         # GitHub Actions workflow
└── AUTO_UPDATE_SETUP.md      # This file
```

## 🎨 **Customization**

### **Adding New Workers**
Edit `scripts/generate-docs.js`:

```javascript
const CONFIG = {
  workers: [
    // ... existing workers
    {
      name: 'New Worker',
      path: '../new-worker/src/index.js',
      type: 'worker',
      database: 'D1',
      features: ['Feature 1', 'Feature 2']
    }
  ]
};
```

### **Custom Parsing Rules**
Modify the parsing functions:

```javascript
function parseWorkerCode(sourceCode, worker) {
  // Add your custom parsing logic here
  // Extract specific patterns from your code
}
```

### **Custom HTML Generation**
Update the HTML templates in `generateHTML()` function.

## 🧪 **Testing Your Setup**

### **Test 1: Basic Generation**
```bash
cd scripts
npm run generate
```

**Expected Output:**
```
🚀 Generating automated documentation...
📖 Parsed: Recipe Search DB
📖 Parsed: Clipped Recipe DB
📖 Parsed: Recipe Scraper
📖 Parsed: Recipe Clipper
📚 Parsed: KV Storage
✅ Documentation generated successfully!
```

### **Test 2: File Watching**
```bash
cd scripts
npm run watch
```

**Expected Output:**
```
👀 Starting documentation watcher...
📁 Watching directories:
   - ../recipe-search-db/src
   - ../clipped-recipe-db-worker/src
   - ../recipe-scraper
   - ../clipper/src
   - ../shared
   - ../crawler
✅ Watching: ../recipe-search-db/src
✅ Watching: ../clipped-recipe-db-worker/src
...
🚀 Documentation watcher is now active!
```

### **Test 3: Make a Code Change**
1. Open `recipe-search-db/src/index.js`
2. Add a new endpoint or function
3. Save the file
4. Watch the docs regenerate automatically!

## 🚨 **Troubleshooting**

### **Common Issues**

#### **1. "Module not found" errors**
```bash
# Ensure you're using Node.js 18+
node --version

# Install dependencies
cd scripts
npm install
```

#### **2. "Permission denied" errors**
```bash
# Make scripts executable
chmod +x scripts/*.js
```

#### **3. Documentation not updating**
- Check file paths in `CONFIG.workers`
- Verify source files exist
- Check console for error messages

#### **4. GitHub Actions failing**
- Verify secrets are set correctly
- Check Cloudflare authentication
- Review workflow logs

### **Debug Mode**
```bash
# Run with verbose output
cd scripts
DEBUG=* node generate-docs.js

# Check generated files
ls -la ../docs/
cat ../docs/index.html | head -20
```

## 🔄 **Workflow Integration**

### **Pre-commit Hook**
Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
echo "🔄 Updating documentation..."
cd scripts
node generate-docs.js
git add ../docs/
```

### **CI/CD Pipeline**
The GitHub Actions workflow automatically:
1. **Triggers** on code changes
2. **Generates** updated documentation
3. **Commits** changes to your repo
4. **Deploys** to Cloudflare Pages
5. **Notifies** team members

### **Team Workflow**
1. **Developer** makes code changes
2. **GitHub Actions** auto-updates docs
3. **Documentation** deploys automatically
4. **Team** sees updated docs instantly

## 📈 **Advanced Features**

### **JSDoc Integration**
Add JSDoc comments to your code:

```javascript
/**
 * Creates a new recipe node in the graph database
 * @param {string} id - Unique recipe identifier
 * @param {string} type - Node type (always 'RECIPE')
 * @param {Object} properties - Recipe properties
 * @returns {Promise<Object>} Creation result
 */
async function createRecipeNode(id, type, properties) {
  // Implementation
}
```

### **Custom Endpoint Descriptions**
Add comments above your endpoints:

```javascript
// Creates a new recipe with validation and storage
if (pathname === '/recipe' && request.method === 'POST') {
  // Implementation
}
```

### **Schema Extraction**
The generator can also extract database schemas from SQL files.

## 🎉 **You're All Set!**

Your documentation now automatically:
- ✅ **Updates** when you change code
- ✅ **Deploys** when you push to GitHub
- ✅ **Watches** files locally for instant updates
- ✅ **Parses** your code intelligently
- ✅ **Maintains** itself with zero effort

### **Next Steps**
1. **Test** the system with a code change
2. **Customize** parsing rules if needed
3. **Deploy** to Cloudflare Pages
4. **Share** with your team!

---

**🚀 Happy Auto-Documenting!** Your team will love having always-up-to-date documentation! 🎯
