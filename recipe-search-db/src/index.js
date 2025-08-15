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
      } else if (path === '/api/graph' && method === 'GET') {
        return await getGraph(request, env, corsHeaders);
      } else if (path === '/api/health' && method === 'GET') {
        return new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
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

// Search operations
async function searchNodes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const type = url.searchParams.get('type');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  if (!query) {
    throw new Error('Search query parameter "q" is required');
  }

  let sqlQuery = `
    SELECT n.*, m.status, m.version
    FROM nodes n
    JOIN metadata m ON n.id = m.node_id
    JOIN nodes_fts fts ON n.rowid = fts.rowid
    WHERE fts.properties MATCH ? AND m.status = 'ACTIVE'
  `;
  
  let params = [query];

  if (type) {
    sqlQuery += ' AND n.type = ?';
    params.push(type);
  }

  sqlQuery += ' ORDER BY rank LIMIT ?';
  params.push(limit);

  const result = await env.SEARCH_DB.prepare(sqlQuery).bind(...params).all();
  
  return new Response(JSON.stringify({
    query,
    results: result.results.map(node => ({
      ...node,
      properties: JSON.parse(node.properties)
    }))
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
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
