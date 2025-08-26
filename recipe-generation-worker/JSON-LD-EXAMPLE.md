# JSON-LD Recipe Generation Example

The recipe generation worker now returns recipes in both the standard format and valid JSON-LD format according to schema.org standards.

## API Response Format

When you call the recipe generation endpoint, you'll receive a response with both formats:

```json
{
  "success": true,
  "recipe": {
    // Standard recipe object format
    "name": "Chocolate Chip Cookies",
    "description": "Delicious homemade chocolate chip cookies",
    "ingredients": ["2 cups flour", "1 cup sugar", "1/2 cup butter"],
    "instructions": ["1. Mix ingredients", "2. Bake at 350F", "3. Cool and serve"],
    "prepTime": "15 minutes",
    "cookTime": "12 minutes",
    "totalTime": "27 minutes",
    "servings": "24",
    "difficulty": "Easy",
    "cuisine": "American",
    "dietary": ["vegetarian"],
    "generatedAt": "2024-01-15T10:30:00Z",
    "generationTime": 1500
  },
  "jsonLd": {
    // Valid schema.org/Recipe JSON-LD format
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Chocolate Chip Cookies",
    "description": "Delicious homemade chocolate chip cookies",
    "datePublished": "2024-01-15T10:30:00Z",
    "author": {
      "@type": "Organization",
      "name": "AI Recipe Generator"
    },
    "recipeIngredient": [
      "2 cups flour",
      "1 cup sugar", 
      "1/2 cup butter"
    ],
    "recipeInstructions": [
      {
        "@type": "HowToStep",
        "position": 1,
        "text": "Mix ingredients"
      },
      {
        "@type": "HowToStep",
        "position": 2,
        "text": "Bake at 350F"
      },
      {
        "@type": "HowToStep",
        "position": 3,
        "text": "Cool and serve"
      }
    ],
    "prepTime": "PT15M",
    "cookTime": "PT12M",
    "totalTime": "PT27M",
    "recipeYield": "24",
    "recipeCuisine": "American",
    "recipeCategory": "Easy",
    "keywords": "vegetarian",
    "comment": "Generated in 1500ms using AI recipe generation"
  },
  "environment": "development"
}
```

## JSON-LD Features

### Schema.org Compliance
- Uses `@context: "https://schema.org"` for proper schema.org context
- Implements `@type: "Recipe"` for recipe identification
- Follows schema.org/Recipe specification

### Time Formatting
- Converts human-readable times to ISO 8601 duration format:
  - `"15 minutes"` → `"PT15M"`
  - `"1 hour"` → `"PT1H"`
  - `"1 hour 30 minutes"` → `"PT1H30M"`

### Instruction Structure
- Each instruction is formatted as a `HowToStep` object
- Includes position and text properties
- Maintains proper step ordering

### Ingredient Handling
- Cleans up numbered ingredients (removes "1.", "2.", etc.)
- Preserves measurement and ingredient information
- Maintains array format for easy processing

### Metadata Integration
- Includes generation metadata in `comment` field
- Preserves dietary restrictions in `keywords`
- Includes source ingredients in `keywords` for context
- Sets proper author attribution

## Usage Examples

### Recipe Name Generation
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{
    "recipeName": "Chocolate Chip Cookies",
    "servings": "24",
    "cuisine": "American",
    "dietary": ["vegetarian"]
  }'
```

### Ingredients-Based Generation
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{
    "ingredients": ["chicken", "rice", "vegetables"],
    "servings": "4",
    "cuisine": "Asian"
  }'
```

## Benefits of JSON-LD Format

1. **SEO Optimization**: Search engines can understand and display recipe information
2. **Rich Snippets**: Google and other search engines can show recipe cards
3. **Structured Data**: Machine-readable format for applications and APIs
4. **Schema.org Compliance**: Follows web standards for recipe markup
5. **Rich Features**: Supports ratings, reviews, nutrition, and more

## Validation

The JSON-LD output can be validated using:
- [Google's Rich Results Test](https://search.google.com/test/rich-results)
- [Schema.org Validator](https://validator.schema.org/)
- [Structured Data Testing Tool](https://search.google.com/structured-data/testing-tool)

## Integration

The JSON-LD format is ready for:
- Web page embedding in `<script type="application/ld+json">` tags
- API responses for recipe applications
- Search engine optimization
- Recipe aggregators and platforms
- Voice assistants and smart devices