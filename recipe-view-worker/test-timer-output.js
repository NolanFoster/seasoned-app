import { generateRecipeHTML } from './src/template.js';

const recipe = {
  name: 'Test Recipe',
  instructions: ['Mix ingredients', 'Bake for 30 minutes', 'Let cool and serve']
};

const html = generateRecipeHTML(recipe);

// Extract just the instructions list
const instructionsMatch = html.match(/<ol class="instructions-list">([\s\S]*?)<\/ol>/);
if (instructionsMatch) {
  console.log('Instructions HTML:');
  console.log(instructionsMatch[1]);
  
  // Check if text is present (ignoring HTML tags)
  const textOnly = instructionsMatch[1].replace(/<[^>]*>/g, '');
  console.log('\nText content:');
  console.log(textOnly);
  
  console.log('\nContains "Bake for 30 minutes"?', textOnly.includes('Bake for 30 minutes'));
  console.log('Contains "Bake for"?', html.includes('Bake for'));
  console.log('Contains "30 minutes"?', html.includes('30 minutes'));
}