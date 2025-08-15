#!/usr/bin/env node

// Comprehensive Test Suite for Recipe Search Database
// Tests all API endpoints and functionality

const BASE_URL = 'http://localhost:8787'; // Update with your worker URL

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retries: 3
};

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Helper function to make HTTP requests with retry logic
async function makeRequest(endpoint, method = 'GET', data = null, retries = TEST_CONFIG.retries) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, options);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${result.error || 'Unknown error'}`);
      }
      
      return result;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.log(`Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Test assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test runner helper
async function runTest(testName, testFunction) {
  testResults.total++;
  console.log(`\n🧪 Running test: ${testName}`);
  
  try {
    await testFunction();
    console.log(`✅ ${testName} - PASSED`);
    testResults.passed++;
  } catch (error) {
    console.error(`❌ ${testName} - FAILED: ${error.message}`);
    testResults.failed++;
  }
}

// Generate test IDs
function generateTestId() {
  return 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Test 1: Health Check
async function testHealthCheck() {
  const health = await makeRequest('/api/health');
  assert(health.status === 'healthy', 'Health check should return healthy status');
  assert(health.timestamp, 'Health check should include timestamp');
}

// Test 2: Create Node
async function testCreateNode() {
  const testNode = {
    id: generateTestId(),
    type: 'TEST_NODE',
    properties: {
      name: 'Test Node',
      description: 'A test node for testing purposes',
      test_field: 'test_value'
    }
  };

  const result = await makeRequest('/api/nodes', 'POST', testNode);
  assert(result.success, 'Node creation should succeed');
  assert(result.nodeId === testNode.id, 'Returned node ID should match input');
  
  return testNode;
}

// Test 3: Get Node
async function testGetNode(testNode) {
  const retrievedNode = await makeRequest(`/api/nodes/${testNode.id}`);
  assert(retrievedNode.id === testNode.id, 'Retrieved node ID should match');
  assert(retrievedNode.type === testNode.type, 'Retrieved node type should match');
  assert(retrievedNode.properties.name === testNode.properties.name, 'Retrieved node properties should match');
}

// Test 4: Update Node
async function testUpdateNode(testNode) {
  const updatedProperties = {
    ...testNode.properties,
    description: 'Updated description',
    new_field: 'new_value'
  };

  const result = await makeRequest(`/api/nodes/${testNode.id}`, 'PUT', {
    type: 'UPDATED_TEST_NODE',
    properties: updatedProperties
  });

  assert(result.success, 'Node update should succeed');

  // Verify the update
  const updatedNode = await makeRequest(`/api/nodes/${testNode.id}`);
  assert(updatedNode.type === 'UPDATED_TEST_NODE', 'Node type should be updated');
  assert(updatedNode.properties.description === 'Updated description', 'Node properties should be updated');
  assert(updatedNode.properties.new_field === 'new_value', 'New properties should be added');
}

// Test 5: Create Edge
async function testCreateEdge(testNode) {
  // Create a target node first to satisfy foreign key constraint
  const targetNode = {
    id: generateTestId(),
    type: 'TARGET_NODE',
    properties: {
      name: 'Target Node',
      description: 'A target node for edge testing'
    }
  };

  // Create the target node
  const targetResult = await makeRequest('/api/nodes', 'POST', targetNode);
  assert(targetResult.success, 'Target node creation should succeed');

  const testEdge = {
    from_id: testNode.id,
    to_id: targetNode.id,
    type: 'TEST_RELATIONSHIP',
    properties: {
      strength: 'strong',
      bidirectional: false
    }
  };

  const result = await makeRequest('/api/edges', 'POST', testEdge);
  assert(result.success, 'Edge creation should succeed');
  assert(result.edgeId, 'Edge creation should return edge ID');
  
  return { ...testEdge, id: result.edgeId, targetNode };
}

// Test 6: Get Edges
async function testGetEdges(testNode, testEdge) {
  // Get edges by from_id
  const edgesFrom = await makeRequest(`/api/edges?from_id=${testNode.id}`);
  assert(edgesFrom.edges.length > 0, 'Should find edges from test node');
  
  // Get edges by type
  const edgesByType = await makeRequest(`/api/edges?type=${testEdge.type}`);
  assert(edgesByType.edges.length > 0, 'Should find edges by type');
  
  // Get edges by to_id
  const edgesTo = await makeRequest(`/api/edges?to_id=${testEdge.targetNode.id}`);
  assert(edgesTo.edges.length > 0, 'Should find edges to target node');
}

// Test 7: Search Nodes
async function testSearchNodes(testNode) {
  // Search by node name
  const searchResults = await makeRequest(`/api/search?q=${testNode.properties.name}`);
  assert(searchResults.results.length > 0, 'Search should return results');
  assert(searchResults.query === testNode.properties.name, 'Search query should match');
  
  // Search by type
  const typeResults = await makeRequest(`/api/search?q=test&type=${testNode.type}`);
  assert(typeResults.results.length > 0, 'Type-filtered search should return results');
  
  // Search with limit
  const limitedResults = await makeRequest(`/api/search?q=test&limit=1`);
  assert(limitedResults.results.length <= 1, 'Limited search should respect limit');
}

// Test 8: Graph Traversal
async function testGraphTraversal(testNode, testEdge) {
  const graph = await makeRequest(`/api/graph?node_id=${testNode.id}&depth=1`);
  assert(graph.centerNode === testNode.id, 'Graph center should match input node');
  assert(graph.depth === 1, 'Graph depth should match input depth');
  assert(graph.nodes.length > 0, 'Graph should contain nodes');
  assert(graph.edges.length > 0, 'Graph should contain edges');
}

// Test 9: Get Nodes with Pagination
async function testGetNodesPagination() {
  // Use a unique type name to avoid conflicts with previous test runs
  const uniqueType = `PAGINATION_TEST_${Date.now()}`;
  
  // Create multiple test nodes
  const testNodes = [];
  for (let i = 0; i < 5; i++) {
    const node = {
      id: generateTestId(),
      type: uniqueType,
      properties: {
        name: `Test Node ${i}`,
        index: i
      }
    };
    
    await makeRequest('/api/nodes', 'POST', node);
    testNodes.push(node);
  }

  // Get total count first
  const allNodes = await makeRequest(`/api/nodes?type=${uniqueType}`);
  console.log(`Total ${uniqueType} nodes: ${allNodes.nodes.length}`);
  
  // Test pagination
  const firstPage = await makeRequest(`/api/nodes?type=${uniqueType}&limit=2&offset=0`);
  console.log(`First page (limit=2, offset=0): ${firstPage.nodes.length} nodes`);
  assert(firstPage.nodes.length === 2, 'First page should have 2 nodes');
  
  const secondPage = await makeRequest(`/api/nodes?type=${uniqueType}&limit=2&offset=2`);
  console.log(`Second page (limit=2, offset=2): ${secondPage.nodes.length} nodes`);
  assert(secondPage.nodes.length === 2, 'Second page should have 2 nodes');
  
  const thirdPage = await makeRequest(`/api/nodes?type=${uniqueType}&limit=2&offset=4`);
  console.log(`Third page (limit=2, offset=4): ${thirdPage.nodes.length} nodes`);
  assert(thirdPage.nodes.length === 1, 'Third page should have 1 node');
}

// Test 10: Delete Operations
async function testDeleteOperations(testNode, testEdge) {
  // Delete edge
  const edgeDeleteResult = await makeRequest(`/api/edges/${testEdge.id}`, 'DELETE');
  assert(edgeDeleteResult.success, 'Edge deletion should succeed');
  
  // Verify edge is deleted
  const remainingEdges = await makeRequest(`/api/edges?from_id=${testNode.id}`);
  assert(remainingEdges.edges.length === 0, 'Edge should be deleted');
  
  // Soft delete node
  const nodeDeleteResult = await makeRequest(`/api/nodes/${testNode.id}`, 'DELETE');
  assert(nodeDeleteResult.success, 'Node deletion should succeed');
  
  // Verify node is marked as deleted in metadata
  // Note: The node still exists but is marked as deleted in metadata
  const deletedNode = await makeRequest(`/api/nodes/${testNode.id}`);
  assert(deletedNode.id === testNode.id, 'Deleted node should still be retrievable');
  
  // Also delete the target node to clean up
  const targetDeleteResult = await makeRequest(`/api/nodes/${testEdge.targetNode.id}`, 'DELETE');
  assert(targetDeleteResult.success, 'Target node deletion should succeed');
}

// Test 11: Error Handling
async function testErrorHandling() {
  // Test invalid node creation
  try {
    await makeRequest('/api/nodes', 'POST', { id: 'test' }); // Missing required fields
    throw new Error('Should have failed with missing fields');
  } catch (error) {
    assert(error.message.includes('Missing required fields'), 'Should return validation error');
  }
  
  // Test invalid search
  try {
    await makeRequest('/api/search'); // Missing query parameter
    throw new Error('Should have failed with missing query');
  } catch (error) {
    assert(error.message.includes('Search query parameter'), 'Should return query error');
  }
  
  // Test non-existent node
  try {
    await makeRequest('/api/nodes/non_existent_id');
    throw new Error('Should have failed with non-existent node');
  } catch (error) {
    assert(error.message.includes('Node not found'), 'Should return not found error');
  }
}

// Test 12: Full-Text Search
async function testFullTextSearch() {
  // Create nodes with searchable content
  const searchableNodes = [
    {
      id: generateTestId(),
      type: 'SEARCH_TEST',
      properties: {
        name: 'Delicious Chocolate Cake',
        description: 'A rich and moist chocolate cake with chocolate frosting',
        ingredients: ['chocolate', 'flour', 'eggs', 'sugar'],
        tags: ['dessert', 'chocolate', 'cake', 'baking']
      }
    },
    {
      id: generateTestId(),
      type: 'SEARCH_TEST',
      properties: {
        name: 'Spicy Chicken Tacos',
        description: 'Authentic Mexican tacos with spicy chicken and fresh vegetables',
        ingredients: ['chicken', 'tortillas', 'spices', 'vegetables'],
        tags: ['mexican', 'spicy', 'chicken', 'tacos']
      }
    }
  ];

  for (const node of searchableNodes) {
    await makeRequest('/api/nodes', 'POST', node);
  }

  // Test various search queries
  const chocolateResults = await makeRequest('/api/search?q=chocolate');
  assert(chocolateResults.results.length > 0, 'Should find chocolate-related content');
  
  const spicyResults = await makeRequest('/api/search?q=spicy');
  assert(spicyResults.results.length > 0, 'Should find spicy-related content');
  
  const mexicanResults = await makeRequest('/api/search?q=mexican');
  assert(mexicanResults.results.length > 0, 'Should find Mexican-related content');
  
  const cakeResults = await makeRequest('/api/search?q=cake&type=SEARCH_TEST');
  assert(cakeResults.results.length > 0, 'Should find cake with type filter');
}

// Test 13: Complex Graph Relationships
async function testComplexGraphRelationships() {
  // Create a complex graph structure
  const recipe = {
    id: generateTestId(),
    type: 'RECIPE',
    properties: {
      name: 'Complex Recipe Test',
      description: 'A recipe for testing complex graph relationships'
    }
  };
  
  const ingredients = [
    {
      id: generateTestId(),
      type: 'INGREDIENT',
      properties: { name: 'Ingredient A' }
    },
    {
      id: generateTestId(),
      type: 'INGREDIENT',
      properties: { name: 'Ingredient B' }
    }
  ];
  
  const category = {
    id: generateTestId(),
    type: 'CATEGORY',
    properties: { name: 'Test Category' }
  };

  // Create all nodes
  await makeRequest('/api/nodes', 'POST', recipe);
  for (const ingredient of ingredients) {
    await makeRequest('/api/nodes', 'POST', ingredient);
  }
  await makeRequest('/api/nodes', 'POST', category);

  // Create edges
  const edges = [
    { from_id: recipe.id, to_id: ingredients[0].id, type: 'HAS_INGREDIENT' },
    { from_id: recipe.id, to_id: ingredients[1].id, type: 'HAS_INGREDIENT' },
    { from_id: recipe.id, to_id: category.id, type: 'BELONGS_TO' }
  ];

  for (const edge of edges) {
    await makeRequest('/api/edges', 'POST', edge);
  }

  // Test graph traversal with depth 2
  const graph = await makeRequest(`/api/graph?node_id=${recipe.id}&depth=2`);
  assert(graph.nodes.length >= 4, 'Graph should contain recipe, ingredients, and category');
  assert(graph.edges.length >= 3, 'Graph should contain all relationships');
}

// Main test execution
async function runAllTests() {
  console.log('🚀 Starting Recipe Search Database Test Suite\n');
  
  let testNode, testEdge;

  try {
    // Basic functionality tests
    await runTest('Health Check', testHealthCheck);
    await runTest('Create Node', async () => { testNode = await testCreateNode(); });
    await runTest('Get Node', async () => await testGetNode(testNode));
    await runTest('Update Node', async () => await testUpdateNode(testNode));
    await runTest('Create Edge', async () => { testEdge = await testCreateEdge(testNode); });
    await runTest('Get Edges', async () => await testGetEdges(testNode, testEdge));
    await runTest('Search Nodes', async () => await testSearchNodes(testNode));
    await runTest('Graph Traversal', async () => await testGraphTraversal(testNode, testEdge));
    
    // Advanced functionality tests
    await runTest('Get Nodes with Pagination', testGetNodesPagination);
    await runTest('Full-Text Search', testFullTextSearch);
    await runTest('Complex Graph Relationships', testComplexGraphRelationships);
    
    // Error handling tests
    await runTest('Error Handling', testErrorHandling);
    
    // Cleanup tests
    await runTest('Delete Operations', async () => await testDeleteOperations(testNode, testEdge));

  } catch (error) {
    console.error('❌ Test suite failed with unexpected error:', error);
    testResults.failed++;
  }

  // Print test results
  console.log('\n📊 Test Results:');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed! The search database is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the errors above.');
  }

  return testResults.failed === 0;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testResults
};
