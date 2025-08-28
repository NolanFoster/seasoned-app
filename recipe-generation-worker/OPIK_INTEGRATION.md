# Opik Integration for Recipe Generation Worker

## Overview

The Opik integration provides comprehensive tracing and observability around the existing LLaMA-based recipe generation implementation. Rather than replacing the original AI logic, the Opik client wraps the existing methods with tracing calls to provide insights into the recipe generation process.

## Architecture

The integration follows a **tracing wrapper pattern**:

- **Original Implementation**: The existing LLaMA-based recipe generation logic remains unchanged
- **Opik Client**: A lightweight tracing client that adds observability around the original methods
- **Tracing Integration**: Opik traces and spans are created around key operations without modifying the core logic

## Key Features

### Tracing Capabilities
- **Recipe Generation Trace**: Tracks the entire recipe generation process
- **Query Text Generation Span**: Monitors query text building from request data
- **Embedding Generation Span**: Tracks vector embedding creation
- **Similarity Search Span**: Observes recipe similarity search operations
- **LLaMA Generation Span**: Monitors the actual AI recipe generation

### Health Checking
- **Graceful Degradation**: If Opik is not healthy (no API key or SDK issues), tracing is skipped entirely
- **Non-blocking**: Tracing failures don't affect the core recipe generation functionality
- **Environment Aware**: Only attempts tracing when `OPIK_API_KEY` is available

## Implementation Details

### Opik Client (`src/opik-client.js`)

The Opik client is a pure tracing wrapper with no business logic:

```javascript
export class OpikClient {
  // Core tracing methods
  createTrace(operationName, input)
  createSpan(trace, spanName, spanType, input)
  endSpan(span, output, error)
  endTrace(trace, output, error)
  
  // Health checking
  isHealthy()
}
```

### Integration Points

Tracing is integrated at key points in the recipe generation flow:

1. **Main Trace**: Wraps the entire `generateRecipeWithAI` function
2. **Query Text Span**: Around `buildQueryText` execution
3. **Embedding Span**: Around `generateQueryEmbedding` calls
4. **Search Span**: Around `findSimilarRecipes` operations
5. **LLaMA Span**: Around the actual AI generation in `generateRecipeWithLLaMA`

### Error Handling

- **Tracing Errors**: All tracing errors are caught and logged as warnings
- **Graceful Fallback**: If tracing fails, the original functionality continues unchanged
- **Non-blocking**: Tracing issues never prevent recipe generation

## Configuration

### Environment Variables

```toml
# wrangler.toml
[vars]
OPIK_API_KEY = "your-opik-api-key"
```

### Node.js Compatibility

The Opik SDK requires Node.js compatibility mode:

```toml
# wrangler.toml
compatibility_flags = ["nodejs_compat"]
compatibility_date = "2024-01-01"
```

## Usage Examples

### Basic Tracing

```javascript
// The Opik client automatically wraps the existing implementation
const recipe = await generateRecipeWithAI(requestData, env);

// If Opik is healthy, this will include:
// - Recipe generation trace
// - Multiple operation spans
// - Performance metrics
// - Error tracking (if any)
```

### Health Checking

```javascript
if (opikClient.isHealthy()) {
  // Tracing is available
  const trace = opikClient.createTrace('Custom Operation');
  // ... use tracing
}
```

## Benefits

### Observability
- **Performance Monitoring**: Track timing of each step in recipe generation
- **Error Tracking**: Capture and analyze failures at each stage
- **Request Tracing**: Follow individual requests through the entire pipeline

### Non-intrusive
- **Zero Business Logic Changes**: Original recipe generation logic is untouched
- **Optional Feature**: Tracing can be disabled by simply not setting the API key
- **Performance Impact**: Minimal overhead when tracing is disabled

### Maintainability
- **Single Responsibility**: Opik client only handles tracing
- **Easy Testing**: Core logic can be tested independently of tracing
- **Clear Separation**: Tracing concerns are isolated from business logic

## Testing

The Opik client includes comprehensive tests that verify:

- **Constructor and Configuration**: API key management and workspace setup
- **Health Checking**: Proper detection of client readiness
- **Tracing Operations**: Safe handling of trace/span creation and cleanup
- **Error Handling**: Graceful degradation when tracing fails
- **Factory Functions**: Client creation utilities

## Deployment

### Prerequisites
1. Valid Opik API key
2. Node.js compatibility mode enabled in `wrangler.toml`
3. Opik SDK installed (`npm install opik`)

### Environment Setup
1. Set `OPIK_API_KEY` in your environment
2. Deploy with `wrangler deploy`
3. Monitor traces in the Opik dashboard

## Future Enhancements

### Potential Improvements
- **Custom Metrics**: Add business-specific metrics beyond basic tracing
- **Alerting**: Configure alerts based on tracing data
- **Performance Baselines**: Establish performance thresholds
- **Advanced Filtering**: Filter traces based on request characteristics

### Integration Opportunities
- **Log Aggregation**: Correlate traces with application logs
- **Metrics Export**: Export tracing data to monitoring systems
- **Custom Dashboards**: Build recipe generation-specific observability views

## Troubleshooting

### Common Issues

1. **Tracing Not Working**
   - Verify `OPIK_API_KEY` is set
   - Check Node.js compatibility mode is enabled
   - Ensure Opik SDK is properly installed

2. **Performance Impact**
   - Tracing is designed to be lightweight
   - If issues occur, tracing can be disabled by removing the API key

3. **SDK Errors**
   - Check Opik SDK version compatibility
   - Verify API key permissions
   - Review Opik service status

### Debug Mode

Enable additional logging by setting environment variables:

```bash
DEBUG=opik:* npm start
```

## Support

For Opik-specific issues:
- **Opik Documentation**: [https://docs.opik.ai](https://docs.opik.ai)
- **Opik Support**: [https://support.opik.ai](https://support.opik.ai)

For integration issues:
- **Project Issues**: Use the project's issue tracker
- **Documentation**: Review this file and related code comments