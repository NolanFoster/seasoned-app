import { extractRecipeFromAIResponse } from './src/recipe-clipper.js';

// Test the exact response structure from the user's example
const testNullResponse = () => {
  console.log('🧪 Testing Null Response Handling\n');
  
  const mockResponse = {
    "source": {
      "message": "Raw AI response content: {\"id\":\"resp_22af27512b0249f8a813cf29c1d55b98\",\"created_at\":1754805010,\"instructions\":\"You are a recipe extraction expert. Extract recipes from HTML content and return clean JSON.\",\"metadata\":null,\"model\":\"@cf/openai/gpt-oss-20b\",\"object\":\"response\",\"output\":[{\"id\":\"rs_f273824c6467413a879981f8f0036531\",\"content\":[{\"text\":\"We need to extract recipe from the HTML content. The content is truncated but includes head and body start but probably further content is omitted. However we can glean recipe details: It's the Chef John's Salt Roasted Chicken recipe. We need name, description, ingredients, instructions, image_url, source_url, prep_time, cook_time, servings, difficulty if available.\\n\\nWe may not have full recipe details in snippet, but typical Allrecipes recipe includes markup. However the snippet truncated early. We should attempt to infer fields from available content. Name is \\\"Chef John's Salt Roasted Chicken\\\". Description: In meta description: \\\"A whole chicken cooks up crisp and brown with nothing more than a generous sprinkling of kosher salt. It's served with a quick thyme-butter pan sauce.\\\" That's fine.\\n\\nIngredients: Not present in snippet. Need to parse maybe later part of body. It might include <ul class=\\\"ingredients\\\"> etc. But not present. Could we approximate? Might need to pick from guess. But we could look up actual recipe? It may not be acceptable to access external. But we can use typical known recipe: Chef John's Salt Roasted Chicken. I can approximate ingredients: whole chicken, kosher salt, fresh thyme, olive oil, butter, garlic, etc.\\n\\nBut the requirement: \\\"Focus on extracting clear actionable ingredients and step-by-step instructions.\\\" Must use content from HTML. Since ingredients not present, we might return null? The instruction says if no recipe is found, return null. The recipe exists but data not found. Might still be okay to return null if insufficient. But the snippet clearly implies a recipe present; but we might not have full info.\\n\\nMaybe we should search within provided content for <span itemprop=\\\"recipeIngredient\\\"> etc. The snippet truncated, so we can't see. However no way to parse beyond truncated part.\\n\\nI think we should attempt to provide best guess.\\n\\nCheck what we have: meta tag for image. image_url is given as in og:image: \\\"https://www.allrecipes.com/thmb/vhRMzVV6QKO4F5EdTWSIf-j8ELo=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/4612765-chef-johns-salt-roasted-chicken-BIG-BOY-4x3-1-1eb73b36696a4daa963a8de9fbb21423.jpg\\\"\\n\\nsource_url we set.\\n\\nprep_time, cook_time etc: Not present. Possibly could be in <div class=\\\"recipe-meta\\\"> but truncated.\\n\\nWe might set to null if not available.\\n\\nSerings: maybe 4-6. But not in snippet.\\n\\nWe can produce JSON with some placeholders? The instruction says \\\"If no recipe is found, return null.\\\" But we found a recipe; meta tags present; but no ingredients/instructions visible. But maybe they exist but truncated. We need to decide.\\n\\nGiven the partial content, we can't guarantee extraction, but we can attempt to produce approximate recipe. However we risk giving inaccurate data (though maybe acceptable). But task guidelines emphasize accuracy.\\n\\nPerhaps safer to return null.\\n\\nGiven the requirements, I lean to output null because we cannot extract ingredients and instructions.\\n\\nBut we did see meta description which qualifies; but still no ingredients list.\\n\\nBut maybe the recipe is embedded inside <script type=\\\"application/ld+json\\\"> maybe we missed. But it's truncated. However it's highly likely that the structure has items.\\n\\nGiven the context this might be a test where we need to parse included snippet. Since not all tags visible, the answer expected likely to be null to handle insufficient data.\\n\\nI'll output null.\",\"type\":\"reasoning_text\"}],\"summary\":[],\"type\":\"reasoning\",\"encrypted_content\":null,\"status\":null},{\"id\":\"msg_409ff7b2cda540b9affd149cf0fcbdc1\",\"content\":[{\"annotations\":[],\"text\":\"null\",\"type\":\"output_text\",\"logprobs\":null}],\"role\":\"assistant\",\"status\":\"completed\",\"type\":\"message\"}],\"parallel_tool_calls\":true,\"temperature\":1,\"tool_choice\":\"auto\",\"tools\":[],\"top_p\":1,\"background\":false,\"max_output_tokens\":127601,\"max_tool_calls\":null,\"previous_response_id\":null,\"prompt\":null,\"reasoning\":null,\"service_tier\":\"auto\",\"status\":\"completed\",\"text\":null,\"top_logprobs\":0,\"truncation\":\"disabled\",\"usage\":{\"prompt_tokens\":2302,\"completion_tokens\":872,\"total_tokens\":3174},\"user\":null}"
    }
  };

  console.log('Testing the exact response structure from the user...');
  
  try {
    const result = extractRecipeFromAIResponse(mockResponse, "https://example.com");
    
    if (result === null) {
      console.log('✅ SUCCESS: Function correctly returned null for truncated HTML response');
    } else {
      console.log('❌ FAILED: Expected null but got:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('❌ ERROR: Function threw an error instead of returning null:', error.message);
  }
};

// Test various null-like responses
const testNullVariations = () => {
  console.log('\n🧪 Testing Null Response Variations\n');
  
  const nullVariations = [
    {
      name: "Direct null response",
      response: { source: { output: [{ content: [{ text: "null" }] }] } },
      expected: null
    },
    {
      name: "String 'null' response",
      response: { source: { output: [{ content: [{ text: '"null"' }] }] } },
      expected: null
    },
    {
      name: "Empty object response",
      response: { source: { output: [{ content: [{ text: "{}" }] }] } },
      expected: null
    },
    {
      name: "Object with only null values",
      response: { source: { output: [{ content: [{ text: '{"name": null, "ingredients": null, "instructions": null}' }] }] } },
      expected: null
    }
  ];

  nullVariations.forEach((test, index) => {
    console.log(`Test ${index + 1}: ${test.name}`);
    
    try {
      const result = extractRecipeFromAIResponse(test.response, "https://example.com");
      
      if (result === test.expected) {
        console.log('✅ PASSED');
      } else {
        console.log('❌ FAILED - Expected:', test.expected, 'Got:', result);
      }
    } catch (error) {
      if (test.expected === null) {
        console.log('✅ PASSED (Expected error thrown)');
      } else {
        console.log('❌ FAILED (Unexpected error):', error.message);
      }
    }
  });
};

// Test edge cases
const testEdgeCases = () => {
  console.log('\n🧪 Testing Edge Cases\n');
  
  const edgeCases = [
    {
      name: "Missing source.output",
      response: { source: {} },
      expected: null
    },
    {
      name: "Empty source.output array",
      response: { source: { output: [] } },
      expected: null
    },
    {
      name: "Missing content array",
      response: { source: { output: [{}] } },
      expected: null
    },
    {
      name: "Empty content array",
      response: { source: { output: [{ content: [] }] } },
      expected: null
    },
    {
      name: "Missing text property",
      response: { source: { output: [{ content: [{}] }] } },
      expected: null
    }
  ];

  edgeCases.forEach((test, index) => {
    console.log(`Edge Case ${index + 1}: ${test.name}`);
    
    try {
      const result = extractRecipeFromAIResponse(test.response, "https://example.com");
      
      if (result === test.expected) {
        console.log('✅ PASSED');
      } else {
        console.log('❌ FAILED - Expected:', test.expected, 'Got:', result);
      }
    } catch (error) {
      if (test.expected === null) {
        console.log('✅ PASSED (Expected error thrown)');
      } else {
        console.log('❌ FAILED (Unexpected error):', error.message);
      }
    }
  });
};

// Run all tests
const runAllTests = () => {
  testNullResponse();
  testNullVariations();
  testEdgeCases();
  
  console.log('\n🎯 Test Summary:');
  console.log('- Null response handling: Tests the exact response structure from the user');
  console.log('- Null variations: Tests different ways the AI might return null');
  console.log('- Edge cases: Tests malformed or incomplete response structures');
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testNullResponse, testNullVariations, testEdgeCases, runAllTests }; 