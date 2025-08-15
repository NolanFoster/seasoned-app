-- Search Database Schema for Recipe Graph
-- This database supports graph-based search with nodes, edges, and metadata

-- Drop existing tables if they exist
DROP TABLE IF EXISTS metadata;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;

-- Nodes table - represents entities in the graph (recipes, ingredients, etc.)
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY, -- UUID as TEXT for SQLite compatibility
    type TEXT NOT NULL, -- Type of node (RECIPE, INGREDIENT, CATEGORY, etc.)
    properties TEXT NOT NULL, -- JSON properties stored as TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Edges table - represents relationships between nodes
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL, -- Foreign key to source node
    to_id TEXT NOT NULL, -- Foreign key to target node
    type TEXT NOT NULL, -- Type of relationship (HAS_INGREDIENT, BELONGS_TO, etc.)
    properties TEXT, -- JSON properties for the edge (optional)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Metadata table - tracks versioning and status of nodes
CREATE TABLE IF NOT EXISTS metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL, -- Foreign key to node
    version INTEGER NOT NULL DEFAULT 1, -- Version number
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, -- When this version was created
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DELETED')) DEFAULT 'ACTIVE', -- Status enum
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
-- Index on node type for filtering
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);

-- Index on edge relationships for traversal
CREATE INDEX IF NOT EXISTS idx_edges_from_id ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to_id ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);

-- Composite index for efficient edge lookups
CREATE INDEX IF NOT EXISTS idx_edges_from_type ON edges(from_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_to_type ON edges(to_id, type);

-- Index on metadata for versioning queries
CREATE INDEX IF NOT EXISTS idx_metadata_node_id ON metadata(node_id);
CREATE INDEX IF NOT EXISTS idx_metadata_status ON metadata(status);
CREATE INDEX IF NOT EXISTS idx_metadata_version ON metadata(node_id, version);

-- Full-text search index on node properties (using SQLite FTS5)
-- Note: SQLite FTS5 is used instead of JSONB for full-text search capabilities
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id UNINDEXED, -- Don't index the ID
    type UNINDEXED, -- Don't index the type
    properties, -- Index the properties for full-text search
    content='nodes', -- Source table
    content_rowid='rowid' -- Row ID mapping
);

-- Trigger to keep FTS index in sync with nodes table
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, properties) VALUES (new.rowid, new.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, properties) VALUES('delete', old.rowid, old.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, properties) VALUES('delete', old.rowid, old.properties);
    INSERT INTO nodes_fts(rowid, properties) VALUES (new.rowid, new.properties);
END;

-- Insert initial metadata for all existing nodes
CREATE TRIGGER IF NOT EXISTS nodes_metadata_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO metadata (node_id, version, timestamp, status) 
    VALUES (new.id, 1, CURRENT_TIMESTAMP, 'ACTIVE');
END;
