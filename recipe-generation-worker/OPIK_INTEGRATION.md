# Opik SDK Integration for Recipe Generation Worker

## Overview

This document describes the integration of the Opik SDK into the Recipe Generation Worker, enabling advanced recipe generation with comprehensive tracing and observability.

## What Was Implemented

### 1. Opik SDK Installation
- Installed the official `opik` package (version 1.8.34)
- Added it as a dependency in `package.json`

### 2. Node.js Compatibility Mode
- Updated `wrangler.toml` to enable Node.js compatibility mode
- Added `compatibility_flags = ["nodejs_compat"]`
- Updated compatibility date to "2024-09-23"

### 3. Opik Client Implementation
- Created `src/opik-client.js` with a comprehensive Opik client class
- Integrates with Cloudflare Workers AI for recipe generation
- Provides comprehensive tracing and observability

### 4. Environment Configuration
- Added `OPIK_API_KEY` environment variable to all environments (development, preview, staging, production)
- API key: `bnqBJrjlbKfk7brgjTB9G6uel`

### 5. Recipe Generation Integration
- Modified `generate-handler.js` to use Opik as the primary recipe generation method
- Falls back to existing LLaMA implementation if Opik fails
- Maintains backward compatibility

## Key Features

### Opik Client Class
- **Constructor**: Accepts API key and workspace name
- **API Key Management**: Dynamic API key setting from environment variables
- **Client Initialization**: Lazy initialization when API key is provided

### Recipe Generation
- **Primary Method**: Uses Opik AI with Cloudflare Workers AI binding
- **Model**: `@cf/meta/llama-3.1-8b-instruct`
- **Tracing**: Comprehensive tracing with spans for LLM calls
- **Fallback**: Graceful fallback to existing LLaMA implementation

### Tracing and Observability
- **Trace Creation**: Creates traces for each recipe generation request
- **Span Management**: Tracks LLM calls with detailed input/output
- **Data Flushing**: Ensures trace data is sent to Opik platform

### Recipe Parsing
- **Structured Output**: Parses AI-generated text into structured recipe format
- **Error Handling**: Graceful handling of malformed responses
- **Fallback Values**: Provides sensible defaults when parsing fails

## API Endpoints

### POST /generate
- **Primary**: Attempts recipe generation using Opik AI
- **Fallback**: Falls back to LLaMA if Opik fails
- **Response**: Structured recipe with generation metadata

## Configuration

### Environment Variables
```bash
OPIK_API_KEY=bnqBJrjlbKfk7brgjTB9G6uel
```

### Wrangler Configuration
```toml
compatibility_flags = [
  "nodejs_compat"
]
compatibility_date = "2024-09-23"

[vars]
OPIK_API_KEY = "bnqBJrjlbKfk7brgjTB9G6uel"
```

## Usage Examples

### Basic Recipe Generation
```javascript
const opikClient = createOpikClient(env.OPIK_API_KEY);
const recipe = await opikClient.generateRecipe({
  ingredients: ['chicken', 'rice'],
  cuisine: 'italian'
}, env);
```

### Custom Workspace
```javascript
const customClient = createOpikClient(apiKey, 'custom-workspace');
```

## Testing

### Unit Tests
- Comprehensive test coverage for Opik client
- Mocked Opik SDK for isolated testing
- Tests for error handling and edge cases

### Integration Tests
- Tests the complete recipe generation flow
- Verifies fallback behavior
- Ensures backward compatibility

## Error Handling

### Opik Failures
- Logs detailed error information
- Falls back to LLaMA implementation
- Provides comprehensive error messages

### API Key Issues
- Validates API key presence
- Clear error messages for missing configuration
- Graceful degradation

## Monitoring and Observability

### Tracing
- **Recipe Generation Traces**: Track complete request lifecycle
- **LLM Spans**: Monitor AI model performance
- **Input/Output Tracking**: Capture request and response data

### Metrics
- **Generation Time**: Track recipe generation performance
- **Success Rates**: Monitor Opik vs LLaMA usage
- **Error Rates**: Track failure patterns

## Deployment

### Development
- Uses development environment configuration
- Mock responses for testing without API access

### Production
- Full Opik integration enabled
- Environment-specific API keys
- Comprehensive monitoring

## Future Enhancements

### Potential Improvements
1. **Batch Processing**: Support for multiple recipe generation requests
2. **Caching**: Implement recipe caching to reduce API calls
3. **Rate Limiting**: Add rate limiting for Optik API calls
4. **Advanced Tracing**: More granular span creation for detailed analysis

### Monitoring
1. **Dashboard Integration**: Connect to Opik monitoring dashboards
2. **Alerting**: Set up alerts for API failures
3. **Performance Metrics**: Track response times and success rates

## Troubleshooting

### Common Issues
1. **API Key Not Set**: Ensure `OPIK_API_KEY` is configured
2. **Node.js Compatibility**: Verify `nodejs_compat` flag is enabled
3. **Network Issues**: Check connectivity to Opik API endpoints

### Debug Steps
1. Check environment variable configuration
2. Verify Opik client initialization
3. Review Cloudflare Workers AI binding
4. Check Opik platform for trace data

## Support

For issues related to:
- **Opik SDK**: Check Opik documentation and support
- **Integration**: Review this documentation and test logs
- **Configuration**: Verify environment variables and wrangler settings