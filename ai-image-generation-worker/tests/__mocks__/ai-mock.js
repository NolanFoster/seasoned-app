/**
 * Mock AI service for testing
 */

export const mockAI = {
  run: async (model, params) => {
    if (!params.prompt) {
      throw new Error('Prompt is required');
    }
    
    // Simulate successful image generation
    return {
      image: 'mock-base64-image-data'
    };
  }
};