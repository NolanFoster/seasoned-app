# Recipe Clipper Worker Architecture

The Recipe Clipper Worker is a specialized Cloudflare Worker service that extracts structured recipe data from web pages using AI-powered content analysis and intelligent caching strategies.

## System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[Frontend App]
        B[Mobile App]
        C[Browser Extension]
        D[Recipe Scraper Worker]
    end
    
    subgraph "Recipe Clipper Layer"
        E[Clipper Worker]
        F[AI Processing Engine]
        G[Content Extraction]
        H[Recipe Validation]
    end
    
    subgraph "Storage Layer"
        I[KV Storage]
        J[Recipe Save Worker]
        K[Compression Engine]
    end
    
    subgraph "AI Services"
        L[Cloudflare AI]
        M[GPT-4o-mini Model]
        N[Content Analysis]
    end
    
    A --> E
    B --> E
    C --> E
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    E --> J
    I --> K
    F --> L
    L --> M
    M --> N
    
    style E fill:#e1f5fe
    style F fill:#f3e5f5
    style I fill:#e8f5e8
    style L fill:#fff3e0
```

## Recipe Extraction Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant CW as Clipper Worker
    participant KV as KV Storage
    participant AI as AI Engine
    participant RW as Recipe Save Worker
    
    Note over C,RW: Recipe Extraction with Caching
    C->>CW: POST /clip with URL
    CW->>CW: Generate Recipe ID (SHA-256 hash)
    CW->>KV: Check if recipe exists
    
    alt Recipe Found in Cache
        KV-->>CW: Return cached recipe
        CW-->>C: Recipe + cache metadata
    else Recipe Not Cached
        CW->>AI: Extract recipe using GPT-4o-mini
        AI-->>CW: Structured recipe data
        CW->>CW: Validate recipe structure
        CW->>RW: Save recipe to KV storage
        RW-->>CW: Save confirmation
        CW-->>C: Recipe + save metadata
    end
    
    Note over C,RW: Cache Management
    C->>CW: DELETE /cached with URL
    CW->>RW: Delete recipe from KV
    RW-->>CW: Deletion confirmation
    CW-->>C: Success response
```

## AI-Powered Content Extraction

```mermaid
graph LR
    subgraph "Content Processing Pipeline"
        A[URL Fetch]
        B[HTML Parsing]
        C[Content Extraction]
        D[AI Analysis]
        E[Recipe Structuring]
        F[Validation]
    end
    
    subgraph "AI Models"
        G[GPT-4o-mini]
        H[Content Understanding]
        I[Recipe Recognition]
        J[Data Normalization]
    end
    
    subgraph "Output Format"
        K[Structured Recipe]
        L[Ingredients List]
        M[Instructions]
        N[Metadata]
        O[Validation Status]
    end
    
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    
    D --> G
    G --> H
    H --> I
    I --> J
    
    F --> K
    K --> L
    K --> M
    K --> N
    K --> O
    
    style G fill:#e1f5fe
    style K fill:#e8f5e8
    style F fill:#fff3e0
```

## Caching Architecture

```mermaid
graph TB
    subgraph "Cache Strategy"
        A[First Request]
        B[Extract & Save]
        C[Subsequent Requests]
        D[Cache Hit]
        E[Cache Miss]
    end
    
    subgraph "Storage Optimization"
        F[Gzip Compression]
        G[Base64 Encoding]
        H[Automatic Cleanup]
        I[TTL Management]
    end
    
    subgraph "Cache Operations"
        J[Check Cache]
        K[Retrieve Recipe]
        L[Update Cache]
        M[Delete Cache]
    end
    
    A --> B
    B --> F
    C --> J
    
    J --> D
    J --> E
    
    D --> K
    E --> B
    
    F --> G
    G --> H
    H --> I
    
    L --> F
    M --> H
    
    style A fill:#e8f5e8
    style D fill:#e1f5fe
    style F fill:#fff3e0
```

## Key Components

### 1. **Clipper Worker** (`clipper/src/`)
- **Purpose**: Orchestrates recipe extraction and caching
- **Responsibilities**:
  - URL validation and processing
  - Cache management and optimization
  - AI service integration
  - Recipe validation and structuring
  - Integration with Recipe Save Worker
- **Technologies**: Cloudflare Workers, AI bindings, KV storage

### 2. **AI Processing Engine**
- **Model**: GPT-4o-mini via Cloudflare AI
- **Capabilities**:
  - Web page content analysis
  - Recipe structure recognition
  - Ingredient and instruction extraction
  - Metadata identification
  - Content validation and normalization
- **Performance**: Optimized for recipe-specific content

### 3. **Caching System**
- **Storage**: Cloudflare KV with compression
- **Strategy**: First-extract-then-cache
- **Optimization**: Gzip compression + Base64 encoding
- **Management**: Automatic cache checking and updates
- **Integration**: Seamless with Recipe Save Worker

### 4. **Recipe Validation**
- **Structure**: Ensures consistent recipe format
- **Content**: Validates ingredients and instructions
- **Metadata**: Extracts cooking time, servings, difficulty
- **Quality**: AI-powered content quality assessment

## Data Flow Architecture

```mermaid
flowchart TD
    A[Client Request] --> B{{Request Type?}}
    
    B -->|POST /clip| C[Generate Recipe ID]
    B -->|GET /cached| D[Direct Cache Access]
    B -->|DELETE /cached| E[Cache Deletion]
    
    C --> F[Check KV Cache]
    F --> G{{Recipe Cached?}}
    
    G -->|Yes| H[Return Cached Recipe]
    G -->|No| I[Fetch Web Page]
    
    I --> J[Extract HTML Content]
    J --> K[AI Content Analysis]
    K --> L[Recipe Structure Extraction]
    L --> M[Validate Recipe Data]
    M --> N[Save to KV via Save Worker]
    N --> O[Return Extracted Recipe]
    
    D --> P[Retrieve from KV]
    P --> Q{{Found?}}
    Q -->|Yes| R[Return Recipe]
    Q -->|No| S[404 Not Found]
    
    E --> T[Delete from KV]
    T --> U[Return Success]
    
    H --> V[End]
    O --> V
    R --> V
    S --> V
    U --> V
```

## Environment Configuration

The clipper worker supports multiple deployment environments:

```mermaid
graph TB
    subgraph "Environments"
        A[Preview]
        B[Staging]
        C[Production]
    end
    
    subgraph "Configuration"
        D[AI Bindings]
        E[KV Namespaces]
        F[Worker URLs]
        G[Save Worker URLs]
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
| `/health` | GET | Service health check | None | Health status + features |
| `/clip` | POST | Extract recipe from URL | `{url: string, clearCache?: boolean}` | Recipe data + cache metadata |
| `/cached` | GET | Check cached recipe | Query: `url` | Cached recipe or 404 |
| `/cached` | DELETE | Clear recipe cache | Query: `url` | Success message |

## Integration Points

### 1. **Recipe Save Worker**
- **Purpose**: Centralized recipe storage management
- **Communication**: HTTP API calls
- **Operations**: Save, retrieve, delete recipes
- **Benefits**: Consistent storage patterns across workers

### 2. **Shared KV Storage**
- **Module**: `shared/kv-storage.js`
- **Functions**: Recipe ID generation, compression utilities
- **Compression**: Gzip + Base64 for storage optimization
- **Compatibility**: Works with both clipper and scraper workers

### 3. **AI Service Integration**
- **Provider**: Cloudflare Workers AI
- **Model**: GPT-4o-mini for content understanding
- **Binding**: Direct AI binding for optimal performance
- **Fallback**: Graceful degradation if AI service unavailable

## Performance Characteristics

```mermaid
graph LR
    subgraph "Response Times"
        A[Cache Hit: <50ms]
        B[First Extract: 2-5s]
        C[AI Processing: 1-3s]
        D[Storage: <100ms]
    end
    
    subgraph "Throughput"
        E[Concurrent Requests: 100+]
        F[Cache Hit Rate: 80%+]
        G[AI Token Usage: Optimized]
        H[Storage Efficiency: High]
    end
    
    subgraph "Scalability"
        I[Auto-scaling Workers]
        J[Global Edge Network]
        K[KV Storage Distribution]
        L[AI Service Scaling]
    end
    
    A --> E
    B --> F
    C --> G
    D --> H
    
    E --> I
    F --> J
    G --> K
    H --> L
    
    style A fill:#e8f5e8
    style B fill:#fff3e0
    style I fill:#e1f5fe
```

## Security Features

1. **Input Validation**
   - URL format and domain validation
   - Request size limits and sanitization
   - CORS policy enforcement

2. **AI Service Security**
   - Environment-specific API keys
   - Rate limiting and abuse prevention
   - Secure worker-to-worker communication

3. **Data Protection**
   - Compressed storage for efficiency
   - No sensitive data exposure
   - Secure cache management

## Monitoring and Observability

```mermaid
graph LR
    subgraph "Health Checks"
        A[Service Status]
        B[AI Binding Health]
        C[KV Connectivity]
        D[Save Worker Integration]
    end
    
    subgraph "Metrics"
        E[Request Volume]
        F[Cache Hit Rate]
        G[AI Processing Time]
        H[Storage Operations]
    end
    
    subgraph "Logging"
        I[Extraction Events]
        J[Cache Operations]
        K[Error Tracking]
        L[Performance Metrics]
    end
    
    A --> D
    B --> D
    C --> D
    
    E --> L
    F --> L
    G --> L
    H --> L
    
    I --> J
    J --> K
    K --> L
```

## Error Handling and Resilience

1. **Graceful Degradation**
   - Continue operation if AI service fails
   - Fallback to cached content when possible
   - Informative error messages for debugging

2. **Retry Logic**
   - Automatic retry for transient failures
   - Exponential backoff for rate limits
   - Circuit breaker for persistent failures

3. **Monitoring and Alerting**
   - Real-time error tracking
   - Performance degradation alerts
   - Cache miss rate monitoring

## Future Enhancements

1. **Advanced Caching**
   - Intelligent cache invalidation
   - Multi-level caching strategies
   - Cache warming for popular recipes

2. **AI Model Optimization**
   - Recipe-specific fine-tuning
   - Multi-language support
   - Enhanced content validation

3. **Performance Improvements**
   - Edge-side caching optimization
   - Parallel processing for complex recipes
   - Predictive caching based on usage patterns

This architecture provides a robust, scalable, and efficient recipe extraction service that leverages AI capabilities while maintaining high performance through intelligent caching strategies.