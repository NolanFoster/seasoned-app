/**
 * Mock AI service for testing
 */

export const mockAI = {
  run: async (model, params) => {
    if (!params.prompt) {
      throw new Error('Prompt is required');
    }
    
    // Simulate successful image generation with a valid base64 string
    // This is a 1x1 transparent PNG
    return {
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    };
  }
};