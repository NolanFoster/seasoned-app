// Debug script for queue functionality
import { addToEmbeddingQueue, getQueueStats } from './src/handlers/embedding-handler.js';

// Mock environment
const mockEnv = {
  RECIPE_STORAGE: {
    get: (key) => {
      console.log('GET:', key);
      if (key === 'embedding_queue') {
        return null; // No existing queue
      }
      return null;
    },
    put: (key, value) => {
      console.log('PUT:', key, value);
      return Promise.resolve();
    }
  }
};

async function debugQueue() {
  console.log('Testing queue functionality...');
  
  try {
    // Test adding to queue
    const result = await addToEmbeddingQueue(mockEnv, 'recipe1', 'high');
    console.log('Add result:', result);
    
    // Test getting stats
    const stats = await getQueueStats(mockEnv);
    console.log('Queue stats:', stats);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugQueue();