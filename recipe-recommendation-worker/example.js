/**
 * Example usage of the Recipe Recommendation Worker API
 */

// Example 1: Get recommendations with location and date
async function getRecommendationsWithDate() {
  console.log('Example 1: Getting recommendations for San Francisco in summer...\n');
  
  const response = await fetch('http://localhost:8787/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location: 'San Francisco, CA',
      date: '2024-07-15'
    })
  });

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

// Example 2: Get recommendations with just location (uses current date)
async function getRecommendationsCurrentDate() {
  console.log('\nExample 2: Getting recommendations for New York with current date...\n');
  
  const response = await fetch('http://localhost:8787/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location: 'New York, NY'
    })
  });

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

// Example 3: Different seasons
async function getSeasonalRecommendations() {
  console.log('\nExample 3: Getting recommendations for different seasons...\n');
  
  const seasons = [
    { location: 'Boston, MA', date: '2024-12-25', name: 'Winter/Christmas' },
    { location: 'Austin, TX', date: '2024-04-01', name: 'Spring' },
    { location: 'Seattle, WA', date: '2024-10-31', name: 'Fall/Halloween' }
  ];

  for (const season of seasons) {
    console.log(`\n${season.name} recommendations for ${season.location}:`);
    
    const response = await fetch('http://localhost:8787/recommendations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: season.location,
        date: season.date
      })
    });

    const data = await response.json();
    console.log('Categories:', Object.keys(data.recommendations).join(', '));
  }
}

// Example 4: Error handling
async function demonstrateErrorHandling() {
  console.log('\nExample 4: Demonstrating error handling...\n');
  
  // Missing location
  console.log('Attempting request without location:');
  const response = await fetch('http://localhost:8787/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date: '2024-07-15'
    })
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Error:', data.error);
}

// Run examples
async function runExamples() {
  console.log('🍳 Recipe Recommendation Worker Examples\n');
  console.log('Make sure the worker is running locally with: npm run dev\n');
  console.log('═'.repeat(60) + '\n');

  try {
    await getRecommendationsWithDate();
    await getRecommendationsCurrentDate();
    await getSeasonalRecommendations();
    await demonstrateErrorHandling();
  } catch (error) {
    console.error('\nError running examples:', error.message);
    console.log('\nMake sure the worker is running with: npm run dev');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}