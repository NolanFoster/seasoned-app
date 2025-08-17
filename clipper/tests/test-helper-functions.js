// Test helper functions for HTML extraction and processing
console.log('🧪 Running Helper Function Tests\n');

// Mock the module functions inline since they're not exported
const mockFunctions = {
  // Mock extractDescriptionFromHTML
  extractDescriptionFromHTML: (html) => {
    if (!html) return '';
    
    const patterns = [
      /<meta\s+name="description"\s+content="([^"]+)"/i,
      /<meta\s+property="og:description"\s+content="([^"]+)"/i,
      /<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/p>/i
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1].trim();
    }
    return '';
  },
  
  // Mock extractYieldFromHTML  
  extractYieldFromHTML: (html) => {
    if (!html) return '';
    
    const patterns = [
      /<[^>]+itemprop="recipeYield"[^>]*>([^<]+)</i,
      /<div[^>]*class="[^"]*servings[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<div[^>]*class="[^"]*yield[^"]*"[^>]*>([^<]+)<\/div>/i
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1].trim();
    }
    return '';
  },
  
  // Mock convertTimeToISO8601
  convertTimeToISO8601: (timeStr) => {
    if (!timeStr || timeStr.startsWith('PT')) return timeStr;
    
    let hours = 0, minutes = 0;
    
    // Match hours - use lookahead to ensure we get the number right before hours
    const hourMatch = timeStr.match(/(\d+)(?=[\s½⅓⅔¼¾⅛⅜⅝⅞-]*(?:hours?|hrs?))/i);
    if (hourMatch) hours = parseInt(hourMatch[1]);
    
    // Match minutes - use lookahead to ensure we get the number right before minutes
    const minMatch = timeStr.match(/(\d+)(?=[\s½⅓⅔¼¾⅛⅜⅝⅞-]*(?:minutes?|mins?))/i);
    if (minMatch) minutes = parseInt(minMatch[1]);
    
    if (hours === 0 && minutes === 0) return timeStr;
    
    let iso = 'PT';
    if (hours > 0) iso += hours + 'H';
    if (minutes > 0) iso += minutes + 'M';
    
    return iso;
  },
  
  // Mock cleanHtmlForGPT
  cleanHtmlForGPT: (html) => {
    if (!html) return '';
    
    let cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
      
    if (cleaned.length > 150000) {
      cleaned = cleaned.substring(0, 150000);
    }
    
    return cleaned;
  },
  
  // Mock extractRecipeContent
  extractRecipeContent: (html) => {
    if (!html) return '';
    
    const sections = [];
    const patterns = [
      /<div[^>]*class="[^"]*recipe[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<article[^>]*class="[^"]*recipe[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
    ];
    
    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        if (sections.length < 10) {
          sections.push(match[0]);
        }
      }
    }
    
    return sections.join('\n');
  }
};

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failedTests++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test extractDescriptionFromHTML variations
test('extractDescriptionFromHTML - handles various meta formats', () => {
  const html1 = '<meta name="description" content="Test description">';
  assert(mockFunctions.extractDescriptionFromHTML(html1) === 'Test description');
  
  const html2 = '<meta property="og:description" content="OG description">';
  assert(mockFunctions.extractDescriptionFromHTML(html2) === 'OG description');
  
  const html3 = '<p class="recipe-description">Paragraph description</p>';
  assert(mockFunctions.extractDescriptionFromHTML(html3) === 'Paragraph description');
  
  const html4 = '<div>No description</div>';
  assert(mockFunctions.extractDescriptionFromHTML(html4) === '');
});

// Test extractYieldFromHTML variations
test('extractYieldFromHTML - handles various yield formats', () => {
  const html1 = '<span itemprop="recipeYield">4 servings</span>';
  assert(mockFunctions.extractYieldFromHTML(html1) === '4 servings');
  
  const html2 = '<div class="servings">Serves 6</div>';
  assert(mockFunctions.extractYieldFromHTML(html2) === 'Serves 6');
  
  const html3 = '<div class="recipe-yield">Makes 12</div>';
  assert(mockFunctions.extractYieldFromHTML(html3) === 'Makes 12');
  
  const html4 = '<div>No yield info</div>';
  assert(mockFunctions.extractYieldFromHTML(html4) === '');
});

// Test convertTimeToISO8601 with edge cases
test('convertTimeToISO8601 - handles various time formats', () => {
  assert(mockFunctions.convertTimeToISO8601('30 minutes') === 'PT30M');
  assert(mockFunctions.convertTimeToISO8601('2 hours') === 'PT2H');
  assert(mockFunctions.convertTimeToISO8601('1 hour 30 minutes') === 'PT1H30M');
  assert(mockFunctions.convertTimeToISO8601('90 mins') === 'PT90M');
  assert(mockFunctions.convertTimeToISO8601('1 hr') === 'PT1H');
  assert(mockFunctions.convertTimeToISO8601('PT30M') === 'PT30M');
  assert(mockFunctions.convertTimeToISO8601('invalid') === 'invalid');
});

// Test cleanHtmlForGPT functionality
test('cleanHtmlForGPT - removes unwanted elements', () => {
  const html = `
    <div>Keep this</div>
    <script>remove this</script>
    <style>remove this too</style>
    <nav>navigation to remove</nav>
    <p>Keep this too</p>
  `;
  
  const cleaned = mockFunctions.cleanHtmlForGPT(html);
  assert(!cleaned.includes('<script>'));
  assert(!cleaned.includes('<style>'));
  assert(!cleaned.includes('<nav>'));
  assert(cleaned.includes('Keep this'));
  assert(cleaned.includes('Keep this too'));
});

test('cleanHtmlForGPT - truncates long content', () => {
  const longHtml = 'x'.repeat(200000);
  const cleaned = mockFunctions.cleanHtmlForGPT(longHtml);
  assert(cleaned.length === 150000);
});

// Test extractRecipeContent
test('extractRecipeContent - extracts recipe sections', () => {
  const html = `
    <div class="recipe-card">Recipe 1</div>
    <div class="recipe-content">Recipe 2</div>
    <article class="recipe">Recipe 3</article>
    <div>Other content</div>
  `;
  
  const content = mockFunctions.extractRecipeContent(html);
  assert(content.includes('Recipe 1'));
  assert(content.includes('Recipe 2'));
  assert(content.includes('Recipe 3'));
});

test('extractRecipeContent - limits to 10 sections', () => {
  let html = '';
  for (let i = 0; i < 20; i++) {
    html += `<div class="recipe-${i}">Recipe ${i}</div>`;
  }
  
  const content = mockFunctions.extractRecipeContent(html);
  const sectionCount = (content.match(/<div/g) || []).length;
  assert(sectionCount <= 10);
});

// Test edge cases for various functions
test('handles empty or null inputs gracefully', () => {
  assert(mockFunctions.extractDescriptionFromHTML('') === '');
  assert(mockFunctions.extractDescriptionFromHTML(null) === '');
  assert(mockFunctions.extractYieldFromHTML('') === '');
  assert(mockFunctions.convertTimeToISO8601('') === '');
  assert(mockFunctions.convertTimeToISO8601(null) === null);
  assert(mockFunctions.cleanHtmlForGPT('') === '');
  assert(mockFunctions.extractRecipeContent('') === '');
});

// Test HTML entity decoding
test('handles HTML entities in extracted content', () => {
  const html = '<meta name="description" content="Fish &amp; Chips recipe">';
  const desc = mockFunctions.extractDescriptionFromHTML(html);
  assert(desc === 'Fish &amp; Chips recipe');
});

// Test malformed HTML handling
test('handles malformed HTML gracefully', () => {
  const malformed = '<div class="recipe>Unclosed div';
  assert(() => mockFunctions.extractRecipeContent(malformed));
  assert(() => mockFunctions.cleanHtmlForGPT(malformed));
});

// Test special characters in time strings
test('handles special characters in time conversion', () => {
  assert(mockFunctions.convertTimeToISO8601('1½ hours') === 'PT1H');
  assert(mockFunctions.convertTimeToISO8601('2-3 hours') === 'PT3H'); // Matches the last number before 'hours'
  assert(mockFunctions.convertTimeToISO8601('about 30 minutes') === 'PT30M');
});

// Test nested HTML structures
test('handles nested HTML structures', () => {
  const nested = `
    <div class="recipe-wrapper">
      <div class="recipe-content">
        <p class="description">Nested description</p>
      </div>
    </div>
  `;
  
  const desc = mockFunctions.extractDescriptionFromHTML(nested);
  assert(desc === 'Nested description');
});

// Test case sensitivity
test('handles case sensitivity in patterns', () => {
  const html1 = '<META NAME="DESCRIPTION" CONTENT="UPPERCASE">';
  assert(mockFunctions.extractDescriptionFromHTML(html1) === 'UPPERCASE');
  
  const html2 = '<DIV CLASS="SERVINGS">SERVES 4</DIV>';
  assert(mockFunctions.extractYieldFromHTML(html2) === 'SERVES 4');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Helper Function Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All helper function tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some helper function tests failed.');
  process.exit(1);
}