// Recipe Search Database Worker
// Provides graph-based search capabilities for recipes

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    try {

      // Handle preflight requests
      if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Route handling
      if (path === '/api/nodes' && method === 'POST') {
        return await createNode(request, env, corsHeaders);
      } else if (path === '/api/nodes' && method === 'GET') {
        return await getNodes(request, env, corsHeaders);
      } else if (path.startsWith('/api/nodes/') && method === 'GET') {
        const nodeId = path.split('/')[3];
        return await getNode(nodeId, env, corsHeaders);
      } else if (path.startsWith('/api/nodes/') && method === 'PUT') {
        const nodeId = path.split('/')[3];
        return await updateNode(nodeId, request, env, corsHeaders);
      } else if (path.startsWith('/api/nodes/') && method === 'DELETE') {
        const nodeId = path.split('/')[3];
        return await deleteNode(nodeId, env, corsHeaders);
      } else if (path === '/api/edges' && method === 'POST') {
        return await createEdge(request, env, corsHeaders);
      } else if (path === '/api/edges' && method === 'GET') {
        return await getEdges(request, env, corsHeaders);
      } else if (path.startsWith('/api/edges/') && method === 'DELETE') {
        const edgeId = path.split('/')[3];
        return await deleteEdge(edgeId, env, corsHeaders);
      } else if (path === '/api/search' && method === 'GET') {
        return await searchNodes(request, env, corsHeaders);
      } else if (path === '/api/smart-search' && method === 'GET') {
        return await smartSearchNodes(request, env, corsHeaders);
      } else if (path === '/api/debug/search' && method === 'GET') {
        return await debugSearch(request, env, corsHeaders);
      } else if (path === '/api/graph' && method === 'GET') {
        return await getGraph(request, env, corsHeaders);
      } else if (path === '/api/health' && method === 'GET') {
        return new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (path === '/api/version' && method === 'GET') {
        return new Response(JSON.stringify({ 
          version: '1.3.0',
          features: {
            partialWordSearch: true,
            smartSearch: true,
            description: 'Supports partial word search and smart search with token breakdown strategies'
          },
          timestamp: new Date().toISOString() 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (path === '/api/migrate-kv' && method === 'POST') {
        return await migrateKVToSearch(request, env, corsHeaders);
      } else if (path === '/api/debug-kv' && method === 'GET') {
        return await debugKVStorage(request, env, corsHeaders);
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Node operations
async function createNode(request, env, corsHeaders) {
  const { id, type, properties } = await request.json();
  
  if (!id || !type || !properties) {
    throw new Error('Missing required fields: id, type, properties');
  }

  const result = await env.SEARCH_DB.prepare(`
    INSERT INTO nodes (id, type, properties) 
    VALUES (?, ?, ?)
  `).bind(id, type, JSON.stringify(properties)).run();

  return new Response(JSON.stringify({ 
    success: true, 
    nodeId: id,
    message: 'Node created successfully' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getNodes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = `
    SELECT n.* 
    FROM nodes n
    JOIN metadata m ON n.id = m.node_id
    WHERE m.status = 'ACTIVE'
  `;
  let params = [];

  if (type) {
    query += ' AND n.type = ?';
    params.push(type);
  }

  query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await env.SEARCH_DB.prepare(query).bind(...params).all();
  
  return new Response(JSON.stringify({
    nodes: result.results.map(node => ({
      ...node,
      properties: JSON.parse(node.properties)
    }))
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getNode(nodeId, env, corsHeaders) {
  const result = await env.SEARCH_DB.prepare(`
    SELECT * FROM nodes WHERE id = ?
  `).bind(nodeId).first();

  if (!result) {
    return new Response(JSON.stringify({ error: 'Node not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    ...result,
    properties: JSON.parse(result.properties)
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function updateNode(nodeId, request, env, corsHeaders) {
  const { type, properties } = await request.json();
  
  if (!type || !properties) {
    throw new Error('Missing required fields: type, properties');
  }

  // Start transaction
  const transaction = await env.SEARCH_DB.batch([
    env.SEARCH_DB.prepare(`
      UPDATE nodes SET type = ?, properties = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(type, JSON.stringify(properties), nodeId),
    
    env.SEARCH_DB.prepare(`
      INSERT INTO metadata (node_id, version, timestamp, status) 
      SELECT ?, MAX(version) + 1, CURRENT_TIMESTAMP, 'ACTIVE' 
      FROM metadata WHERE node_id = ?
    `).bind(nodeId, nodeId)
  ]);

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Node updated successfully' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function deleteNode(nodeId, env, corsHeaders) {
  // Soft delete - mark as deleted in metadata
  const result = await env.SEARCH_DB.prepare(`
    INSERT INTO metadata (node_id, version, timestamp, status) 
    SELECT ?, MAX(version) + 1, CURRENT_TIMESTAMP, 'DELETED' 
    FROM metadata WHERE node_id = ?
  `).bind(nodeId, nodeId).run();

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Node marked as deleted' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Edge operations
async function createEdge(request, env, corsHeaders) {
  const { from_id, to_id, type, properties } = await request.json();
  
  if (!from_id || !to_id || !type) {
    throw new Error('Missing required fields: from_id, to_id, type');
  }

  const result = await env.SEARCH_DB.prepare(`
    INSERT INTO edges (from_id, to_id, type, properties) 
    VALUES (?, ?, ?, ?)
  `).bind(from_id, to_id, type, properties ? JSON.stringify(properties) : null).run();

  return new Response(JSON.stringify({ 
    success: true, 
    edgeId: result.meta.last_row_id,
    message: 'Edge created successfully' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getEdges(request, env, corsHeaders) {
  const url = new URL(request.url);
  const from_id = url.searchParams.get('from_id');
  const to_id = url.searchParams.get('to_id');
  const type = url.searchParams.get('type');

  let query = 'SELECT * FROM edges WHERE 1=1';
  let params = [];

  if (from_id) {
    query += ' AND from_id = ?';
    params.push(from_id);
  }
  if (to_id) {
    query += ' AND to_id = ?';
    params.push(to_id);
  }
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY created_at DESC';

  const result = await env.SEARCH_DB.prepare(query).bind(...params).all();
  
  return new Response(JSON.stringify({
    edges: result.results.map(edge => ({
      ...edge,
      properties: edge.properties ? JSON.parse(edge.properties) : null
    }))
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function deleteEdge(edgeId, env, corsHeaders) {
  const result = await env.SEARCH_DB.prepare(`
    DELETE FROM edges WHERE id = ?
  `).bind(edgeId).run();

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Edge deleted successfully' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Debug search function
async function debugSearch(request, env, corsHeaders) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  
  if (!query) {
    return new Response(JSON.stringify({ error: 'Query parameter "q" is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Transform the query to support prefix matching
  const searchTerms = query.trim().split(/\s+/).filter(term => term.length > 0);
  const ftsQuery = searchTerms.map(term => {
    const escapedTerm = term.replace(/['"]/g, '');
    return escapedTerm.endsWith('*') ? escapedTerm : escapedTerm + '*';
  }).join(' ');

  // Test different queries
  const debugInfo = {
    originalQuery: query,
    searchTerms: searchTerms,
    ftsQuery: ftsQuery,
    tests: []
  };

  // Test 1: Basic FTS query
  try {
    const basicResult = await env.SEARCH_DB.prepare(`
      SELECT COUNT(*) as count FROM nodes_fts WHERE properties MATCH ?
    `).bind(ftsQuery).first();
    debugInfo.tests.push({
      name: 'Basic FTS Match',
      query: ftsQuery,
      count: basicResult.count
    });
  } catch (error) {
    debugInfo.tests.push({
      name: 'Basic FTS Match',
      error: error.message
    });
  }

  // Test 2: Without wildcards
  try {
    const noWildcardResult = await env.SEARCH_DB.prepare(`
      SELECT COUNT(*) as count FROM nodes_fts WHERE properties MATCH ?
    `).bind(query).first();
    debugInfo.tests.push({
      name: 'Without Wildcards',
      query: query,
      count: noWildcardResult.count
    });
  } catch (error) {
    debugInfo.tests.push({
      name: 'Without Wildcards',
      error: error.message
    });
  }

  // Test 3: Check FTS table content
  try {
    const ftsContent = await env.SEARCH_DB.prepare(`
      SELECT COUNT(*) as total_rows FROM nodes_fts
    `).first();
    debugInfo.ftsTableRows = ftsContent.total_rows;
  } catch (error) {
    debugInfo.ftsTableError = error.message;
  }

  // Test 4: Sample FTS content
  try {
    const sampleFTS = await env.SEARCH_DB.prepare(`
      SELECT properties FROM nodes_fts LIMIT 3
    `).all();
    debugInfo.sampleFTSContent = sampleFTS.results.map(row => {
      const props = JSON.parse(row.properties);
      return props.title || props.name || 'No title';
    });
  } catch (error) {
    debugInfo.sampleFTSError = error.message;
  }

  return new Response(JSON.stringify(debugInfo, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Search operations
async function searchNodes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const type = url.searchParams.get('type');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  if (!query) {
    throw new Error('Search query parameter "q" is required');
  }

  // Transform the query to support prefix matching
  // Split the query into words and add * to each word for prefix matching
  const searchTerms = query.trim().split(/\s+/).filter(term => term.length > 0);
  const ftsQuery = searchTerms.map(term => {
    // Escape special characters and add prefix wildcard
    // Don't add * if the term already ends with *
    const escapedTerm = term.replace(/['"]/g, '');
    return escapedTerm.endsWith('*') ? escapedTerm : escapedTerm + '*';
  }).join(' ');

  let sqlQuery = `
    SELECT n.*, m.status, m.version
    FROM nodes n
    JOIN metadata m ON n.id = m.node_id
    JOIN nodes_fts fts ON n.rowid = fts.rowid
    WHERE fts.properties MATCH ? AND m.status = 'ACTIVE'
  `;
  
  let params = [ftsQuery];

  if (type) {
    sqlQuery += ' AND n.type = ?';
    params.push(type);
  }

  sqlQuery += ' ORDER BY rank LIMIT ?';
  params.push(limit);

  const result = await env.SEARCH_DB.prepare(sqlQuery).bind(...params).all();
  
  return new Response(JSON.stringify({
    query,
    ftsQuery, // Include the transformed query for debugging
    results: result.results.map(node => ({
      ...node,
      properties: JSON.parse(node.properties)
    }))
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Smart search function that breaks down queries into smaller tokens until it gets results
async function smartSearchNodes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const originalQuery = url.searchParams.get('q');
  const type = url.searchParams.get('type');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  if (!originalQuery) {
    throw new Error('Search query parameter "q" is required');
  }

  // Strategy 1: Try the original query first
  let result = await searchNodesInternal(originalQuery, type, limit, env);
  if (result.results && result.results.length > 0) {
    return new Response(JSON.stringify({
      query: originalQuery,
      strategy: 'original',
      similarityScore: 1.0,
      results: result.results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Strategy 2: Break down into individual words and try each
  const words = originalQuery.trim().split(/\s+/).filter(word => word.length > 0);
  if (words.length > 1) {
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      result = await searchNodesInternal(word, type, limit, env);
      if (result.results && result.results.length > 0) {
        // Calculate similarity based on word position and total words
        // First word gets higher score than later words
        const wordScore = 0.8 - (i * 0.1 / words.length);
        const similarityScore = Math.max(0.6, wordScore);
        
        return new Response(JSON.stringify({
          query: originalQuery,
          strategy: 'word-breakdown',
          effectiveQuery: word,
          similarityScore: Math.round(similarityScore * 100) / 100,
          results: result.results
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  }

  // Strategy 3: Try progressive word combinations (longest first)
  if (words.length > 2) {
    // Try combinations of decreasing length
    for (let len = words.length - 1; len >= 2; len--) {
      for (let start = 0; start <= words.length - len; start++) {
        const combination = words.slice(start, start + len).join(' ');
        result = await searchNodesInternal(combination, type, limit, env);
        if (result.results && result.results.length > 0) {
          // Calculate similarity based on how many words we kept vs original
          const wordsKept = len;
          const totalWords = words.length;
          const similarityScore = 0.5 + (wordsKept / totalWords) * 0.3; // 0.5-0.8 range
          
          return new Response(JSON.stringify({
            query: originalQuery,
            strategy: 'word-combination',
            effectiveQuery: combination,
            similarityScore: Math.round(similarityScore * 100) / 100,
            results: result.results
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }

  // Strategy 4: Try partial matches with shorter terms
  for (const word of words) {
    if (word.length > 3) {
      // Try progressively shorter prefixes
      for (let len = Math.max(3, Math.floor(word.length * 0.7)); len >= 3; len--) {
        const prefix = word.substring(0, len);
        result = await searchNodesInternal(prefix, type, limit, env);
        if (result.results && result.results.length > 0) {
          // Calculate similarity based on how much of the original word we kept
          const charKept = len;
          const totalChars = word.length;
          const prefixRatio = charKept / totalChars;
          const similarityScore = 0.2 + (prefixRatio * 0.3); // 0.2-0.5 range
          
          return new Response(JSON.stringify({
            query: originalQuery,
            strategy: 'prefix-match',
            effectiveQuery: prefix,
            similarityScore: Math.round(similarityScore * 100) / 100,
            results: result.results
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }

  // Strategy 5: Try common cooking terms if no results found
  const commonTerms = ['recipe', 'dish', 'food', 'cooking', 'meal'];
  for (let i = 0; i < commonTerms.length; i++) {
    const term = commonTerms[i];
    result = await searchNodesInternal(term, type, limit, env);
    if (result.results && result.results.length > 0) {
      // Very low similarity since we're using completely different terms
      // Earlier terms in the list get slightly higher scores
      const termScore = 0.15 - (i * 0.02);
      const similarityScore = Math.max(0.05, termScore);
      
      return new Response(JSON.stringify({
        query: originalQuery,
        strategy: 'common-terms',
        effectiveQuery: term,
        similarityScore: Math.round(similarityScore * 100) / 100,
        results: result.results
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // If all strategies fail, return empty results
  return new Response(JSON.stringify({
    query: originalQuery,
    strategy: 'none',
    similarityScore: 0.0,
    results: []
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Internal search function used by smart search
async function searchNodesInternal(query, type, limit, env) {
  try {
    // Transform the query to support prefix matching
    const searchTerms = query.trim().split(/\s+/).filter(term => term.length > 0);
    const ftsQuery = searchTerms.map(term => {
      const escapedTerm = term.replace(/['"]/g, '');
      return escapedTerm.endsWith('*') ? escapedTerm : escapedTerm + '*';
    }).join(' ');

    let sqlQuery = `
      SELECT n.*, m.status, m.version
      FROM nodes n
      JOIN metadata m ON n.id = m.node_id
      JOIN nodes_fts fts ON n.rowid = fts.rowid
      WHERE fts.properties MATCH ? AND m.status = 'ACTIVE'
    `;
    
    let params = [ftsQuery];

    if (type) {
      sqlQuery += ' AND n.type = ?';
      params.push(type);
    }

    sqlQuery += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    const result = await env.SEARCH_DB.prepare(sqlQuery).bind(...params).all();
    
    return {
      results: result.results.map(node => ({
        ...node,
        properties: JSON.parse(node.properties)
      }))
    };
  } catch (error) {
    console.error('Search error:', error);
    return { results: [] };
  }
}

// Graph operations
async function getGraph(request, env, corsHeaders) {
  const url = new URL(request.url);
  const nodeId = url.searchParams.get('node_id');
  const depth = parseInt(url.searchParams.get('depth') || '2');

  if (!nodeId) {
    throw new Error('node_id parameter is required');
  }

  // Get nodes and edges within specified depth
  // Use a simpler approach that's more reliable
  let allNodeIds = [nodeId];
  let currentLevel = 0;
  
  // Collect nodes level by level
  while (currentLevel < depth && allNodeIds.length > 0) {
    const currentPlaceholders = allNodeIds.map(() => '?').join(',');
    const connectedNodes = await env.SEARCH_DB.prepare(`
      SELECT DISTINCT n.id, n.type, n.properties
      FROM nodes n
      JOIN edges e ON (e.from_id = n.id OR e.to_id = n.id)
      WHERE (e.from_id IN (${currentPlaceholders}) OR e.to_id IN (${currentPlaceholders}))
        AND n.id NOT IN (${currentPlaceholders})
    `).bind(...allNodeIds, ...allNodeIds, ...allNodeIds).all();
    
    if (connectedNodes.results.length === 0) break;
    
    const newIds = connectedNodes.results.map(n => n.id);
    allNodeIds = [...allNodeIds, ...newIds];
    currentLevel++;
  }
  
  // Get all the nodes
  if (allNodeIds.length === 0) {
    return new Response(JSON.stringify({
      centerNode: nodeId,
      depth,
      nodes: [],
      edges: []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const nodePlaceholders = allNodeIds.map(() => '?').join(',');
  const result = await env.SEARCH_DB.prepare(`
    SELECT id, type, properties
    FROM nodes 
    WHERE id IN (${nodePlaceholders})
  `).bind(...allNodeIds).all();

  // Get edges for the graph
  const nodeIds = result.results.map(n => n.id);
  
  // Use a simple approach that won't hit SQL variable limits
  let edgesResult = { results: [] };
  
  if (nodeIds.length <= 100) { // Only query if reasonable number of nodes
    const edgePlaceholders = nodeIds.map(() => '?').join(',');
    edgesResult = await env.SEARCH_DB.prepare(`
      SELECT * FROM edges 
      WHERE from_id IN (${edgePlaceholders}) OR to_id IN (${edgePlaceholders})
    `).bind(...nodeIds, ...nodeIds).all();
  }

  return new Response(JSON.stringify({
    centerNode: nodeId,
    depth,
    nodes: result.results.map(node => ({
      ...node,
      properties: JSON.parse(node.properties)
    })),
    edges: edgesResult.results.map(edge => ({
      ...edge,
      properties: edge.properties ? JSON.parse(edge.properties) : null
    }))
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Migration operations
async function migrateKVToSearch(request, env, corsHeaders) {
  try {
    console.log('🚀 Starting KV to Search Database Migration...');
    
    // Get all recipe keys from KV
    const keys = await env.RECIPE_STORAGE.list();
    
    if (!keys.keys || keys.keys.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No recipes found in KV storage' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`📊 Found ${keys.keys.length} recipes to migrate`);
    
    // Process recipes in batches
    const batchSize = 5; // Smaller batch size for worker environment
    const batches = chunkArray(keys.keys, batchSize);
    let totalProcessed = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} recipes)`);
      
      // Process batch sequentially to avoid overwhelming the system
      for (const key of batch) {
        try {
          const result = await processKVRecipe(key, env);
          totalProcessed++;
          
          if (result.success) {
            if (result.skipped) {
              totalSkipped++;
            } else {
              totalSuccessful++;
            }
          } else {
            totalFailed++;
          }
        } catch (error) {
          totalProcessed++;
          totalFailed++;
          console.error(`Failed to process recipe ${key.name}:`, error);
        }
      }
      
      // Small delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const stats = {
      total: keys.keys.length,
      processed: totalProcessed,
      successful: totalSuccessful,
      failed: totalFailed,
      skipped: totalSkipped
    };
    
    console.log('✅ Migration complete:', stats);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Migration completed successfully',
      stats
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function processKVRecipe(key, env) {
  try {
    // Get recipe from KV - handle both compressed and uncompressed data
    let recipe;
    try {
      // First try to get as JSON (uncompressed)
      recipe = await env.RECIPE_STORAGE.get(key.name, 'json');
    } catch (jsonError) {
      // If JSON fails, try to get as text and decompress
      const compressedData = await env.RECIPE_STORAGE.get(key.name, 'text');
      if (compressedData && compressedData.startsWith('H4sI')) {
        // This looks like compressed data, try to decompress
        try {
          recipe = await decompressKVData(compressedData);
        } catch (decompressError) {
          throw new Error(`Failed to decompress recipe data: ${decompressError.message}`);
        }
      } else {
        throw new Error(`Invalid recipe data format: ${jsonError.message}`);
      }
    }
    
    if (!recipe) {
      throw new Error('Recipe not found in KV');
    }
    
    // Check if recipe already exists in search database
    const existingNode = await checkExistingNode(key.name, env);
    if (existingNode) {
      return { success: true, skipped: true, reason: 'Already exists' };
    }
    
    // Extract recipe data from the nested structure
    const recipeData = recipe.data || recipe;
    
    // Create recipe node
    const recipeNode = await createRecipeNodeFromKV(key.name, recipeData, env);
    if (!recipeNode.success) {
      throw new Error(`Failed to create recipe node: ${recipeNode.error}`);
    }
    
    // Create ingredient nodes and relationships
    if (recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
      await createIngredientNodesFromKV(recipeNode.nodeId, recipeData.ingredients, env);
    }
    
    // Create tag relationships from multiple sources
    const tags = [];
    if (recipeData.recipeCategory && Array.isArray(recipeData.recipeCategory)) {
      tags.push(...recipeData.recipeCategory);
    }
    if (recipeData.recipeCuisine && Array.isArray(recipeData.recipeCuisine)) {
      tags.push(...recipeData.recipeCuisine);
    }
    if (recipeData.keywords && recipeData.keywords.trim()) {
      tags.push(...recipeData.keywords.split(',').map(k => k.trim()).filter(k => k));
    }
    
    if (tags.length > 0) {
      await createTagNodesFromKV(recipeNode.nodeId, tags, env);
    }
    
    return { success: true, nodeId: recipeNode.nodeId };
    
  } catch (error) {
    throw error;
  }
}

async function createRecipeNodeFromKV(recipeId, recipeData, env) {
  const nodeData = {
    id: recipeId,
    type: 'RECIPE',
    properties: {
      title: recipeData.name || recipeData.title || 'Untitled Recipe',
      description: recipeData.description || '',
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || [],
      url: recipeData.url || '',
      scrapedAt: recipeData.scrapedAt || new Date().toISOString(),
      prepTime: recipeData.prepTime || null,
      cookTime: recipeData.cookTime || null,
      servings: recipeData.recipeYield ? recipeData.recipeYield[0] : null,
      difficulty: recipeData.difficulty || null,
      cuisine: recipeData.recipeCuisine ? recipeData.recipeCuisine[0] : null,
      category: recipeData.recipeCategory ? recipeData.recipeCategory[0] : null,
      author: recipeData.author ? recipeData.author[0]?.name : null,
      image: recipeData.image || null,
      rating: recipeData.aggregateRating ? recipeData.aggregateRating.ratingValue : null,
      ratingCount: recipeData.aggregateRating ? recipeData.aggregateRating.ratingCount : null,
      nutrition: recipeData.nutrition || null
    }
  };
  
  try {
    const result = await env.SEARCH_DB.prepare(`
      INSERT INTO nodes (id, type, properties) 
      VALUES (?, ?, ?)
    `).bind(nodeData.id, nodeData.type, JSON.stringify(nodeData.properties)).run();
    
    return { success: true, nodeId: nodeData.id };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function createIngredientNodesFromKV(recipeNodeId, ingredients, env) {
  for (const ingredient of ingredients) {
    try {
      // Normalize ingredient name
      const ingredientName = normalizeIngredientName(ingredient);
      const ingredientId = `ingredient_${ingredientName.toLowerCase().replace(/\s+/g, '_')}`;
      
      // Create ingredient node if it doesn't exist
      const ingredientNode = await createOrGetNodeFromKV(env, {
        id: ingredientId,
        type: 'INGREDIENT',
        properties: {
          name: ingredientName,
          category: categorizeIngredient(ingredientName)
        }
      });
      
      if (ingredientNode.success) {
        // Create HAS_INGREDIENT relationship
        await createEdgeFromKV(env, {
          from_id: recipeNodeId,
          to_id: ingredientNode.nodeId,
          type: 'HAS_INGREDIENT',
          properties: {
            originalText: ingredient,
            quantity: extractQuantity(ingredient),
            unit: extractUnit(ingredient)
          }
        });
      }
      
    } catch (error) {
      console.warn(`Failed to create ingredient node for "${ingredient}":`, error.message);
    }
  }
}

async function createTagNodesFromKV(recipeNodeId, tags, env) {
  for (const tag of tags) {
    try {
      const tagName = tag.trim().toLowerCase();
      const tagId = `tag_${tagName.replace(/\s+/g, '_')}`;
      
      // Create tag node if it doesn't exist
      const tagNode = await createOrGetNodeFromKV(env, {
        id: tagId,
        type: 'TAG',
        properties: {
          name: tagName,
          category: categorizeTag(tagName)
        }
      });
      
      if (tagNode.success) {
        // Create HAS_TAG relationship
        await createEdgeFromKV(env, {
          from_id: recipeNodeId,
          to_id: tagNode.nodeId,
          type: 'HAS_TAG'
        });
      }
      
    } catch (error) {
      console.warn(`Failed to create tag node for "${tag}":`, error.message);
    }
  }
}

async function createOrGetNodeFromKV(env, nodeData) {
  try {
    // Try to get existing node first
    const existingNode = await env.SEARCH_DB.prepare(`
      SELECT id FROM nodes WHERE id = ?
    `).bind(nodeData.id).first();
    
    if (existingNode) {
      // Node exists, return it
      return { success: true, nodeId: existingNode.id };
    }
    
    // Node doesn't exist, create it
    await env.SEARCH_DB.prepare(`
      INSERT INTO nodes (id, type, properties) 
      VALUES (?, ?, ?)
    `).bind(nodeData.id, nodeData.type, JSON.stringify(nodeData.properties)).run();
    
    return { success: true, nodeId: nodeData.id };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function createEdgeFromKV(env, edgeData) {
  try {
    await env.SEARCH_DB.prepare(`
      INSERT INTO edges (from_id, to_id, type, properties) 
      VALUES (?, ?, ?, ?)
    `).bind(
      edgeData.from_id, 
      edgeData.to_id, 
      edgeData.type, 
      edgeData.properties ? JSON.stringify(edgeData.properties) : null
    ).run();
    
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function checkExistingNode(nodeId, env) {
  try {
    const result = await env.SEARCH_DB.prepare(`
      SELECT id FROM nodes WHERE id = ?
    `).bind(nodeId).first();
    
    return !!result;
  } catch (error) {
    return false;
  }
}

// Utility functions for KV migration
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function normalizeIngredientName(ingredient) {
  return ingredient
    .replace(/^\d+\/\d+|\d+\.?\d*\s*(cup|tbsp|tsp|oz|lb|g|kg|ml|l|pound|ounce|gram|kilogram|milliliter|liter)s?\.?\s*/gi, '')
    .replace(/^\d+\s*/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .toLowerCase();
}

function categorizeIngredient(ingredientName) {
  const categories = {
    'vegetables': ['tomato', 'onion', 'garlic', 'carrot', 'celery', 'bell pepper', 'mushroom', 'spinach', 'lettuce'],
    'fruits': ['apple', 'banana', 'orange', 'lemon', 'lime', 'strawberry', 'blueberry'],
    'proteins': ['chicken', 'beef', 'pork', 'fish', 'shrimp', 'tofu', 'egg', 'beans'],
    'dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream'],
    'grains': ['rice', 'pasta', 'bread', 'flour', 'quinoa', 'oats'],
    'herbs_spices': ['basil', 'oregano', 'thyme', 'rosemary', 'cumin', 'paprika', 'cinnamon']
  };
  
  for (const [category, ingredients] of Object.entries(categories)) {
    if (ingredients.some(ing => ingredientName.includes(ing))) {
      return category;
    }
  }
  
  return 'other';
}

function categorizeTag(tagName) {
  const categories = {
    'cuisine': ['italian', 'mexican', 'chinese', 'indian', 'french', 'japanese', 'thai'],
    'meal_type': ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'appetizer'],
    'dietary': ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto', 'paleo'],
    'cooking_method': ['baked', 'fried', 'grilled', 'roasted', 'steamed', 'slow-cooked'],
    'difficulty': ['easy', 'medium', 'hard', 'beginner', 'advanced']
  };
  
  for (const [category, tags] of Object.entries(categories)) {
    if (tags.some(t => tagName.includes(t))) {
      return category;
    }
  }
  
  return 'other';
}

function extractQuantity(ingredient) {
  const match = ingredient.match(/^(\d+\/\d+|\d+\.?\d*)/);
  return match ? match[1] : null;
}

function extractUnit(ingredient) {
  const units = ['cup', 'tbsp', 'tsp', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'pound', 'ounce', 'gram', 'kilogram', 'milliliter', 'liter'];
  const lowerIngredient = ingredient.toLowerCase();
  
  for (const unit of units) {
    if (lowerIngredient.includes(unit)) {
      return unit;
    }
  }
  
  return null;
}

// Decompress KV data (similar to shared/kv-storage.js)
async function decompressKVData(compressedBase64) {
  try {
    // Convert base64 string back to Uint8Array
    const compressedData = new Uint8Array(
      atob(compressedBase64).split('').map(char => char.charCodeAt(0))
    );
    
    // Use DecompressionStream for gzip decompression
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    
    writer.write(compressedData);
    writer.close();
    
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    // Combine chunks and decode to string
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const decompressedBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressedBytes.set(chunk, offset);
      offset += chunk.length;
    }
    
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decompressedBytes);
    return JSON.parse(jsonString);
    
  } catch (error) {
    throw new Error(`Decompression failed: ${error.message}`);
  }
}

// Debug function to inspect KV storage
async function debugKVStorage(request, env, corsHeaders) {
  try {
    // Get a few recipe keys to inspect
    const keys = await env.RECIPE_STORAGE.list({ limit: 3 });
    
    if (!keys.keys || keys.keys.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No recipes found in KV storage' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get the first recipe to see its structure
    const firstKey = keys.keys[0];
    let firstRecipe;
    try {
      firstRecipe = await env.RECIPE_STORAGE.get(firstKey.name, 'json');
    } catch (jsonError) {
      // Try to get as text and decompress
      const compressedData = await env.RECIPE_STORAGE.get(firstKey.name, 'text');
      if (compressedData && compressedData.startsWith('H4sI')) {
        firstRecipe = await decompressKVData(compressedData);
      } else {
        firstRecipe = { error: 'Failed to parse recipe data' };
      }
    }
    
    const debugInfo = {
      totalKeys: keys.keys.length,
      sampleKey: firstKey.name,
      sampleRecipe: firstRecipe,
      keyStructure: keys.keys.map(k => ({
        name: k.name,
        expiration: k.expiration,
        metadata: k.metadata
      }))
    };
    
    return new Response(JSON.stringify(debugInfo, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
