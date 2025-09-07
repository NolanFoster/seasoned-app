/**
 * Mock R2 bucket for testing
 */

export const mockR2Bucket = {
  put: async (key, value, options) => {
    // Simulate successful upload
    return {
      key,
      uploaded: true
    };
  },
  
  get: async (key) => {
    // Simulate getting an object
    return {
      key,
      body: 'mock-image-data'
    };
  },
  
  head: async (key) => {
    // Simulate checking if object exists
    if (key.includes('existing')) {
      return { key };
    }
    return null;
  },
  
  delete: async (key) => {
    // Simulate deletion
    return true;
  }
};