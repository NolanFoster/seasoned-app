# Recipe Search System Architecture

The Seasoned application uses a sophisticated graph-based search system built around Cloudflare D1, implemented as a dedicated Cloudflare Worker that provides powerful recipe discovery, relationship mapping, and semantic search capabilities.

## System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[Frontend App]
        B[Mobile App]
        C[Browser Extension]
        D[Recipe Workers]
    end
    
    subgraph "Search Layer"
        E[Recipe Search Worker]
        F[Search Database D1]
        G[Recipe KV Storage]
    end
    
    subgraph "Data Processing Layer"
        H[Recipe Embedding Worker]
        I[Vectorize Index]
        J[Recipe Scraper]
    end
    
    subgraph "Integration Layer"
        K[User Management Worker]
        L[Recipe Generation Worker]
        M[Recipe Recommendation Worker]
    end
    
    A --> E
    B --> E
    C --> E
    D --> E
    E --> F
    E --> G
    H --> I
    J --> G
    K --> E
    L --> E
    M --> E
    
    style E fill:#e1f5fe
    style F fill:#f3e5f5
    style G fill:#e8f5e8
    style I fill:#fff3e0
```

## Search Architecture

```mermaid
graph LR
    subgraph "Search Types"
        A[Full-Text Search]
        B[Graph Traversal]
        C[Smart Search]
        D[Tag-Based Search]
    end
    
    subgraph "Data Sources"
        E[Recipe Properties]
        F[Ingredient Data]
        G[Category Tags]
        H[Relationship Edges]
    end
    
    subgraph "Search Engine"
        I[SQLite FTS5]
        J[Graph Algorithms]
        K[Token Processing]
        L[Ranking Engine]
    end
    
    A --> I
    B --> J
    C --> K
    D --> L
    
    E --> I
    F --> I
    G --> I
    H --> J
    
    style I fill:#e1f5fe
    style J fill:#f3e5f5
    style K fill:#e8f5e8
    style L fill:#fff3e0
```

## Data Flow Architecture

```mermaid
flowchart TD
    A[Search Request] --> B{{Request Type?}}
    
    B -->|Text Search| C[Parse Query]
    B -->|Graph Search| D[Node ID Lookup]
    B -->|Smart Search| E[Token Breakdown]
    B -->|Tag Search| F[Tag Processing]
    
    C --> G[FTS5 Query]
    G --> H[Property Search]
    H --> I[Result Ranking]
    
    D --> J[Edge Traversal]
    J --> K[Depth Limiting]
    K --> L[Graph Building]
    
    E --> M[Token Analysis]
    M --> N[Multi-Strategy Search]
    N --> O[Result Aggregation]
    
    F --> P[Tag Matching]
    P --> Q[Category Filtering]
    Q --> R[Relevance Scoring]
    
    I --> S[Response Formatting]
    L --> S
    O --> S
    R --> S
    
    S --> T[Return Results]
```

## Database Schema Architecture

```mermaid
erDiagram
    NODES {
        text id PK
        text type
        text properties
        datetime created_at
        datetime updated_at
    }
    
    EDGES {
        int id PK
        text from_id FK
        text to_id FK
        text type
        text properties
        datetime created_at
    }
    
    METADATA {
        int id PK
        text node_id FK
        int version
        datetime timestamp
        text status
    }
    
    NODES_FTS {
        text id
        text type
        text properties
    }
    
    NODES ||--o{ EDGES : "from"
    NODES ||--o{ EDGES : "to"
    NODES ||--o{ METADATA : "has"
    NODES ||--o{ NODES_FTS : "indexed_in"
```

## Key Components

### 1. **Recipe Search Worker** (`recipe-search-db/`)
- **Purpose**: Central search engine for recipe discovery and relationship mapping
- **Responsibilities**:
  - Full-text search across recipe properties
  - Graph traversal and relationship discovery
  - Smart search with token breakdown strategies
  - Tag-based filtering and categorization
  - KV migration and data synchronization
- **Technologies**: Cloudflare Workers, D1 Database, SQLite FTS5

### 2. **Graph Database System**
- **Storage**: Cloudflare D1 with SQLite FTS5 integration
- **Structure**: Node-edge graph model for flexible relationships
- **Features**: Bidirectional traversal, soft deletes, versioning
- **Performance**: Optimized indexes, prepared statements, pagination

### 3. **Search Engine Architecture**
- **Full-Text Search**: SQLite FTS5 for powerful text queries
- **Graph Traversal**: Depth-limited relationship navigation
- **Smart Search**: Multi-strategy token processing
- **Tag System**: Flexible categorization and filtering

### 4. **Data Integration System**
- **KV Migration**: Automatic import from Cloudflare KV storage
- **Batch Processing**: Efficient handling of large datasets
- **Relationship Building**: Automatic edge creation during migration
- **Progress Tracking**: Real-time migration monitoring

## Search Capabilities

### Full-Text Search
```mermaid
graph LR
    A[Query Input] --> B[Token Processing]
    B --> C[FTS5 Query]
    C --> D[Property Search]
    D --> E[Result Ranking]
    E --> F[Response]
    
    style C fill:#e1f5fe
    style D fill:#f3e5f5
```

### Graph Traversal
```mermaid
graph LR
    A[Node ID] --> B[Edge Discovery]
    B --> C[Depth Limiting]
    C --> D[Relationship Building]
    D --> E[Graph Response]
    
    style B fill:#e8f5e8
    style C fill:#fff3e0
```

### Smart Search
```mermaid
graph LR
    A[Query] --> B[Token Breakdown]
    B --> C[Strategy Selection]
    C --> D[Multi-Search]
    D --> E[Result Aggregation]
    E --> F[Ranked Response]
    
    style C fill:#e1f5fe
    style D fill:#f3e5f5
```

## API Architecture

```mermaid
graph TB
    subgraph "Core Operations"
        A[Node Management]
        B[Edge Management]
        C[Search Operations]
        D[Graph Operations]
    end
    
    subgraph "Advanced Features"
        E[Smart Search]
        F[Tag Processing]
        G[Migration Tools]
        H[Debug Endpoints]
    end
    
    subgraph "Utility Endpoints"
        I[Health Checks]
        J[Version Info]
        K[Database Cleanup]
        L[KV Debugging]
    end
    
    A --> C
    B --> D
    C --> E
    D --> F
    E --> G
    F --> H
    
    style A fill:#e1f5fe
    style C fill:#f3e5f5
    style E fill:#e8f5e8
```

## Environment Configuration

The search worker supports multiple deployment environments:

```mermaid
graph TB
    subgraph "Environments"
        A[Preview]
        B[Staging]
        C[Production]
    end
    
    subgraph "Configuration"
        D[D1 Database]
        E[KV Namespaces]
        F[Worker URLs]
        G[Search Limits]
    end
    
    A --> D
    B --> D
    C --> D
    
    A --> E
    B --> E
    C --> E
    
    A --> F
    B --> F
    C --> F
    
    A --> G
    B --> G
    C --> G
    
    style A fill:#fff3e0
    style B fill:#e8f5e8
    style C fill:#ffebee
```

## API Endpoints

| Endpoint | Method | Purpose | Request Body | Response |
|----------|--------|---------|--------------|----------|
| `/api/health` | GET | Service health check | None | Health status |
| `/api/version` | GET | API version and features | None | Version info |
| `/api/nodes` | POST | Create new node | `{id, type, properties}` | Node data |
| `/api/nodes` | GET | List nodes with filtering | Query params | Node list |
| `/api/nodes/:id` | GET | Get specific node | None | Node data |
| `/api/nodes/:id` | PUT | Update node | `{properties}` | Updated node |
| `/api/nodes/:id` | DELETE | Soft delete node | None | Success status |
| `/api/edges` | POST | Create relationship | `{from_id, to_id, type, properties}` | Edge data |
| `/api/edges` | GET | List edges with filtering | Query params | Edge list |
| `/api/edges/:id` | DELETE | Delete relationship | None | Success status |
| `/api/search` | GET | Full-text search | Query params | Search results |
| `/api/smart-search` | GET | Advanced search | Query params | Smart results |
| `/api/graph` | GET | Graph traversal | Query params | Graph data |
| `/api/migrate-kv` | POST | KV migration | None | Migration status |

## Search Features

1. **Text Search Capabilities**
   - Full-text search across all node properties
   - Partial word matching and fuzzy search
   - Relevance ranking and scoring
   - Type filtering for targeted results

2. **Graph Intelligence**
   - Bidirectional relationship traversal
   - Depth-limited graph exploration
   - Relationship type filtering
   - Circular reference detection

3. **Smart Search Strategies**
   - Token breakdown and analysis
   - Multi-strategy search execution
   - Result aggregation and ranking
   - Context-aware query processing

4. **Tag and Category System**
   - Flexible tag assignment
   - Multi-tag search support
   - Category hierarchy navigation
   - Tag-based filtering

## Performance Architecture

```mermaid
graph LR
    subgraph "Query Optimization"
        A[Prepared Statements]
        B[Index Usage]
        C[Result Limiting]
        D[Pagination]
    end
    
    subgraph "Caching Strategy"
        E[KV Storage]
        F[Result Caching]
        G[Query Caching]
        H[Graph Caching]
    end
    
    subgraph "Scaling Features"
        I[D1 Auto-scaling]
        J[Worker Distribution]
        K[Load Balancing]
        L[Resource Management]
    end
    
    A --> B
    B --> C
    C --> D
    
    E --> F
    F --> G
    G --> H
    
    I --> J
    J --> K
    K --> L
    
    style A fill:#e1f5fe
    style E fill:#f3e5f5
    style I fill:#e8f5e8
```

## Security Features

1. **Input Validation**
   - Comprehensive input sanitization
   - SQL injection protection
   - JSON schema validation
   - Type checking and validation

2. **Access Control**
   - CORS configuration
   - Rate limiting considerations
   - Authentication ready
   - Environment isolation

3. **Data Protection**
   - Soft delete support
   - Version tracking
   - Audit trail maintenance
   - Secure data handling

## Monitoring and Observability

```mermaid
graph LR
    subgraph "Health Checks"
        A[Database Connectivity]
        B[KV Storage Access]
        C[Search Performance]
        D[Overall Status]
    end
    
    subgraph "Metrics"
        E[Search Response Times]
        F[Query Success Rates]
        G[Graph Traversal Depth]
        H[Migration Progress]
    end
    
    subgraph "Logging"
        I[Search Queries]
        J[Error Tracking]
        K[Performance Metrics]
        L[Security Events]
    end
    
    A --> D
    B --> D
    C --> D
    
    E --> K
    F --> K
    G --> K
    H --> K
    
    I --> J
    J --> L
    K --> L
```

## Migration and Data Management

### KV Migration Process
```mermaid
flowchart TD
    A[Start Migration] --> B[Batch Processing]
    B --> C[Recipe Extraction]
    C --> D[Node Creation]
    D --> E[Relationship Building]
    E --> F[Progress Tracking]
    F --> G{More Batches?}
    G -->|Yes| B
    G -->|No| H[Cleanup]
    H --> I[Migration Complete]
    
    style B fill:#e1f5fe
    style D fill:#f3e5f5
    style E fill:#e8f5e8
```

### Data Synchronization
- **Automatic Updates**: Real-time data synchronization
- **Conflict Resolution**: Smart handling of data conflicts
- **Performance Optimization**: Efficient batch processing
- **Error Recovery**: Graceful handling of migration failures

## Future Enhancements

1. **Advanced Search**
   - Semantic search with embeddings
   - Machine learning ranking
   - Natural language processing
   - Voice search capabilities

2. **Real-time Features**
   - WebSocket support
   - Live data updates
   - Collaborative filtering
   - Real-time recommendations

3. **Analytics and Insights**
   - Search pattern analysis
   - Popularity tracking
   - Trend identification
   - User behavior insights

4. **Integration Expansion**
   - External recipe databases
   - Social media integration
   - Mobile app support
   - API marketplace

This search architecture provides a powerful, scalable, and maintainable solution for recipe discovery while maintaining clean separation of concerns and following modern database design principles.