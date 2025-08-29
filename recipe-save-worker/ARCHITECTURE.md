# Recipe Save System Architecture

The Seasoned application uses a robust recipe storage system built around Cloudflare Workers with Durable Objects, providing atomic operations, automatic search database synchronization, and intelligent image processing.

## System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[Frontend App]
        B[Mobile App]
        C[Browser Extension]
        D[Recipe Scraper]
    end
    
    subgraph "Recipe Storage Layer"
        E[Recipe Save Worker]
        F[Recipe Saver Durable Object]
        G[KV Storage]
        H[R2 Image Storage]
    end
    
    subgraph "Search & Indexing Layer"
        I[Search Database Worker]
        J[Recipe Search DB]
        K[Elasticsearch/Meilisearch]
    end
    
    subgraph "Data Processing Layer"
        L[Nutrition Calculator]
        M[Image Processor]
        N[Data Compressor]
    end
    
    A --> E
    B --> E
    C --> E
    D --> E
    E --> F
    F --> G
    F --> H
    F --> I
    I --> J
    J --> K
    F --> L
    F --> M
    F --> N
    
    style E fill:#e1f5fe
    style F fill:#f3e5f5
    style G fill:#e8f5e8
    style H fill:#fff3e0
    style I fill:#fce4ec
```

## Recipe Save Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant W as Recipe Save Worker
    participant DO as Recipe Saver DO
    participant KV as KV Storage
    participant R2 as R2 Storage
    participant S as Search DB Worker
    participant N as Nutrition Calculator
    
    Note over C,N: Recipe Save Flow
    C->>W: POST /recipe/save
    W->>DO: Route to Durable Object
    DO->>DO: Validate recipe data
    DO->>N: Calculate nutritional facts
    DO->>R2: Download & store images
    DO->>KV: Store compressed recipe
    DO->>S: Sync with search database
    S-->>DO: Search sync confirmation
    DO-->>W: Success response
    W-->>C: Recipe saved with ID
    
    Note over C,N: Recipe Update Flow
    C->>W: PUT /recipe/update
    W->>DO: Route to Durable Object
    DO->>KV: Retrieve existing recipe
    DO->>DO: Merge updates
    DO->>R2: Process new images if any
    DO->>KV: Update recipe data
    DO->>S: Sync updated recipe
    DO-->>W: Update confirmation
    W-->>C: Recipe updated
```

## Data Architecture

```mermaid
graph LR
    subgraph "Data Flow"
        A[Raw Recipe Data]
        B[Data Validation]
        C[Image Processing]
        D[Data Compression]
        E[Storage & Sync]
    end
    
    subgraph "Storage Systems"
        F[KV Storage - Recipes]
        G[R2 Storage - Images]
        H[Search Index]
    end
    
    subgraph "Data Processing"
        I[Nutrition Calculation]
        J[Image Optimization]
        K[Metadata Extraction]
    end
    
    A --> B
    B --> C
    B --> I
    C --> J
    C --> G
    I --> D
    D --> F
    F --> H
    K --> F
    
    style A fill:#e3f2fd
    style F fill:#e8f5e8
    style G fill:#fff3e0
    style H fill:#fce4ec
```

## Key Components

### 1. **Recipe Save Worker** (`recipe-save-worker/`)
- **Purpose**: Main entry point for recipe operations
- **Responsibilities**:
  - Request routing and CORS handling
  - Durable Object coordination
  - Batch operation processing
  - Health monitoring and logging
- **Technologies**: Cloudflare Workers, Hono.js, Durable Objects

### 2. **Recipe Saver Durable Object** (`RecipeSaver`)
- **Purpose**: Ensures atomic operations and data consistency
- **Responsibilities**:
  - Atomic recipe saves, updates, and deletes
  - Image processing and R2 storage
  - Search database synchronization
  - Operation status tracking
- **Key Features**:
  - Prevents race conditions
  - Guarantees write atomicity
  - Handles complex multi-step operations

### 3. **Storage Systems**
- **KV Storage**: Compressed recipe data with metadata
- **R2 Storage**: Optimized image storage with CDN delivery
- **Search Database**: Real-time search indexing and synchronization

### 4. **Data Processing Pipeline**
- **Nutrition Calculator**: Parses ingredients and calculates nutritional facts
- **Image Processor**: Downloads, optimizes, and stores external images
- **Data Compressor**: Reduces storage footprint while maintaining accessibility

## API Architecture

```mermaid
graph TB
    subgraph "API Endpoints"
        A[/health]
        B[/recipe/save]
        C[/recipe/update]
        D[/recipe/delete]
        E[/recipe/status]
        F[/batch]
    end
    
    subgraph "Request Flow"
        G[Client Request]
        H[Worker Router]
        I[Durable Object]
        J[Storage Operations]
        K[Search Sync]
    end
    
    G --> H
    H --> A
    H --> B
    H --> C
    H --> D
    H --> E
    H --> F
    
    B --> I
    C --> I
    D --> I
    E --> I
    F --> I
    
    I --> J
    I --> K
    
    style A fill:#e8f5e8
    style B fill:#e1f5fe
    style C fill:#e1f5fe
    style D fill:#e1f5fe
    style E fill:#e1f5fe
    style F fill:#f3e5f5
```

## Image Processing Architecture

```mermaid
flowchart TD
    A[Recipe with Image URLs] --> B{External Images?}
    B -->|Yes| C[Download Images]
    B -->|No| D[Skip Image Processing]
    
    C --> E[Validate Image Format]
    E --> F{Valid Format?}
    F -->|No| G[Skip Invalid Image]
    F -->|Yes| H[Generate Storage Path]
    
    H --> I[Upload to R2]
    I --> J[Replace URLs in Recipe]
    J --> K[Store Recipe with CDN URLs]
    
    D --> K
    G --> K
    
    style A fill:#e3f2fd
    style C fill:#e8f5e8
    style I fill:#fff3e0
    style K fill:#fce4ec
```

## Batch Operations Architecture

```mermaid
graph LR
    subgraph "Batch Processing"
        A[Batch Request]
        B[Operation Validation]
        C[Parallel Processing]
        D[Result Aggregation]
        E[Response Generation]
    end
    
    subgraph "Operation Types"
        F[Save Operations]
        G[Update Operations]
        H[Delete Operations]
    end
    
    A --> B
    B --> C
    C --> F
    C --> G
    C --> H
    F --> D
    G --> D
    H --> D
    D --> E
    
    style A fill:#e3f2fd
    style C fill:#e8f5e8
    style D fill:#fff3e0
    style E fill:#fce4ec
```

## Environment Configuration

The recipe save worker supports multiple deployment environments:

```mermaid
graph TB
    subgraph "Environments"
        A[Preview]
        B[Staging]
        C[Production]
    end
    
    subgraph "Configuration"
        D[KV Namespaces]
        E[R2 Buckets]
        F[Search DB URLs]
        G[Image Domains]
        H[Durable Objects]
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
    
    A --> H
    B --> H
    C --> H
    
    style A fill:#fff3e0
    style B fill:#e8f5e8
    style C fill:#ffebee
```

## API Endpoints

| Endpoint | Method | Purpose | Request Body | Response |
|----------|--------|---------|--------------|----------|
| `/health` | GET | Service health check | None | Health status |
| `/recipe/save` | POST | Save new recipe | `{recipe: object, options?: object}` | `{success: boolean, id: string, recipe: object}` |
| `/recipe/update` | PUT | Update existing recipe | `{recipeId: string, updates: object}` | `{success: boolean, recipe: object}` |
| `/recipe/delete` | DELETE | Delete recipe | `{recipeId: string}` | `{success: boolean}` |
| `/recipe/status` | GET | Check operation status | `?id=string` | `{status: string, data?: object}` |
| `/batch` | POST | Process multiple operations | `{operations: array}` | `{results: array}` |

## Data Models

### Recipe Structure
```typescript
interface Recipe {
  id: string;                    // Generated hash from URL
  url: string;                   // Original recipe URL
  title: string;                 // Recipe title
  description?: string;          // Recipe description
  ingredients: string[];         // List of ingredients
  instructions: string[];        // Cooking steps
  prepTime?: string;             // Preparation time
  cookTime?: string;             // Cooking time
  servings?: string;             // Number of servings
  cuisine?: string;              // Cuisine type
  tags?: string[];               // Recipe tags
  imageUrl?: string;             // Main image (CDN URL)
  images?: string[];             // Step-by-step images (CDN URLs)
  author?: string;               // Recipe author
  nutritionalFacts?: object;     // Calculated nutrition data
  _originalImageUrls?: string[]; // Original external URLs
  _metadata: {                   // System metadata
    createdAt: string;
    updatedAt: string;
    version: number;
    compressed: boolean;
  };
}
```

### Operation Status
```typescript
interface OperationStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  operationId: string;
  recipeId?: string;
  data?: any;
  error?: string;
  timestamp: string;
  duration?: number;
}
```

## Security Features

1. **Data Validation**
   - Comprehensive input validation
   - URL sanitization and validation
   - Image format verification
   - Size and content type restrictions

2. **Storage Security**
   - Compressed data storage
   - Secure image processing
   - Access control through environment isolation
   - No sensitive data exposure

3. **Operational Security**
   - Atomic operations prevent data corruption
   - Comprehensive error handling and logging
   - Rate limiting and request validation
   - CORS configuration for cross-origin requests

## Monitoring and Observability

```mermaid
graph LR
    subgraph "Health Checks"
        A[KV Connectivity]
        B[R2 Storage]
        C[Search DB Worker]
        D[Durable Objects]
        E[Overall Status]
    end
    
    subgraph "Metrics"
        F[Save Operations Rate]
        G[Image Processing Success]
        H[Search Sync Performance]
        I[Storage Usage]
        J[Response Times]
    end
    
    subgraph "Logging"
        K[Operation Events]
        L[Error Tracking]
        M[Performance Metrics]
        N[Image Processing Logs]
    end
    
    A --> E
    B --> E
    C --> E
    D --> E
    
    F --> M
    G --> M
    H --> M
    I --> M
    J --> M
    
    K --> L
    L --> N
    M --> N
```

## Performance Optimizations

1. **Data Compression**
   - Recipe data compression before KV storage
   - Efficient serialization/deserialization
   - Metadata optimization

2. **Image Processing**
   - Parallel image downloads
   - Format validation and optimization
   - CDN delivery for fast access

3. **Batch Operations**
   - Parallel processing of multiple operations
   - Efficient error handling and rollback
   - Optimized response aggregation

4. **Caching Strategy**
   - R2 CDN caching for images
   - KV storage optimization
   - Search database indexing

## Error Handling and Resilience

```mermaid
flowchart TD
    A[Operation Request] --> B{Validation Pass?}
    B -->|No| C[Return Validation Error]
    B -->|Yes| D[Begin Operation]
    
    D --> E{Storage Success?}
    E -->|No| F[Rollback Changes]
    E -->|Yes| G{Image Processing Success?}
    
    G -->|No| H[Continue with Original URLs]
    G -->|Yes| I{Search Sync Success?}
    
    H --> I
    I -->|No| J[Log Sync Failure]
    I -->|Yes| K[Operation Complete]
    
    F --> L[Return Error Response]
    J --> K
    K --> M[Return Success Response]
    
    style C fill:#ffebee
    style F fill:#ffebee
    style J fill:#fff3e0
    style K fill:#e8f5e8
```

## Future Enhancements

1. **Advanced Image Processing**
   - AI-powered image optimization
   - Automatic image tagging
   - Thumbnail generation

2. **Enhanced Search Integration**
   - Real-time search updates
   - Advanced indexing strategies
   - Search analytics

3. **Performance Monitoring**
   - Detailed performance metrics
   - Automated scaling
   - Cost optimization

4. **Data Analytics**
   - Recipe popularity tracking
   - Usage pattern analysis
   - Performance insights

This architecture provides a robust, scalable, and maintainable solution for recipe storage while ensuring data consistency, automatic synchronization, and efficient image processing.