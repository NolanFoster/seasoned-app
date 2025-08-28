# Optik SDK Integration for Recipe Generation Worker

## Overview

This document describes the integration of the Optik SDK into the Recipe Generation Worker, enabling advanced recipe generation with comprehensive tracing and observability.

## What Was Implemented

### 1. Optik SDK Installation
- Installed the official `opik` package (version 1.8.34)
- Added it as a dependency in `package.json`

### 2. Node.js Compatibility Mode
- Updated `wrangler.toml` to enable Node.js compatibility mode
- Added `compatibility_flags = ["nodejs_compat"]`
- Updated compatibility date to "2024-09-23"

### 3. Optik Client Implementation
- Created `src/optik-client.js` with a comprehensive Optik client class
- Integrates with Cloudflare Workers AI for recipe generation
- Provides comprehensive tracing and observability

### 4. Environment Configuration
- Added `OPTIK_API_KEY` environment variable to all environments (development, preview, staging, production)
- API key: `bnqBJrjlbKfk7brgjTB9G6uel`

### 5. Recipe Generation Integration
- Modified `generate-handler.js` to use Optik as the primary recipe generation method
- Falls back to existing LLaMA implementation if Optik fails
- Maintains backward compatibility

## Key Features

### Optik Client Class
- **Constructor**: Accepts API key and workspace name
- **API Key Management**: Dynamic API key setting from environment variables
- **Client Initialization**: Lazy initialization when API key is provided

### Recipe Generation
- **Primary Method**: Uses Optik AI with Cloudflare Workers AI binding
- **Model**: `@cf/meta/llama-3.1-8b-instruct`
- **Tracing**: Comprehensive tracing with spans for LLM calls
- **Fallback**: Graceful fallback to existing LLaMA implementation

### Tracing and Observability
- **Trace Creation**: Creates traces for each recipe generation request
- **Span Management**: Tracks LLM calls with detailed input/output
- **Data Flushing**: Ensures trace data is sent to Optik platform

### Recipe Parsing
- **Structured Output**: Parses AI-generated text into structured recipe format
- **Error Handling**: Graceful handling of malformed responses
- **Fallback Values**: Provides sensible defaults when parsing fails

## API Endpoints

### POST /generate
- **Primary**: Attempts recipe generation using Optik AI
- **Fallback**: Falls back to LLaMA if Optik fails
- **Response**: Structured recipe with generation metadata

## Configuration

### Environment Variables
```bash
OPTIK_API_KEY=bnqBJrjlbKfk7brgjTB9G6uel
```

### Wrangler Configuration
```toml
compatibility_flags = [
  "nodejs_compat"
]
compatibility_date = "2024-09-23"

[vars]
OPTIK_API_KEY = "bnqBJrjlbKfk7brgjTB9G6uel"
```

## Usage Examples

### Basic Recipe Generation
```javascript
const optikClient = createOptikClient(env.OPTIK_API_KEY);
const recipe = await optikClient.generateRecipe({
  ingredients: ['chicken', 'rice'],
  cuisine: 'italian'
}, env);
```

### Custom Workspace
```javascript
const customClient = createOptikClient(apiKey, 'custom-workspace');
```

## Testing

### Unit Tests
- Comprehensive test coverage for Optik client
- Mocked Optik SDK for isolated testing
- Tests for error handling and edge cases

### Integration Tests
- Tests the complete recipe generation flow
- Verifies fallback behavior
- Ensures backward compatibility

## Error Handling

### Optik Failures
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
- **Success Rates**: Monitor Optik vs LLaMA usage
- **Error Rates**: Track failure patterns

## Deployment

### Development
- Uses development environment configuration
- Mock responses for testing without API access

### Production
- Full Optik integration enabled
- Environment-specific API keys
- Comprehensive monitoring

## Future Enhancements

### Potential Improvements
1. **Batch Processing**: Support for multiple recipe generation requests
2. **Caching**: Implement recipe caching to reduce API calls
3. **Rate Limiting**: Add rate limiting for Optik API calls
4. **Advanced Tracing**: More granular span creation for detailed analysis

### Monitoring
1. **Dashboard Integration**: Connect to Optik monitoring dashboards
2. **Alerting**: Set up alerts for API failures
3. **Performance Metrics**: Track response times and success rates

## Troubleshooting

### Common Issues
1. **API Key Not Set**: Ensure `OPTIK_API_KEY` is configured
2. **Node.js Compatibility**: Verify `nodejs_compat` flag is enabled
3. **Network Issues**: Check connectivity to Optik API endpoints

### Debug Steps
1. Check environment variable configuration
2. Verify Optik client initialization
3. Review Cloudflare Workers AI binding
4. Check Optik platform for trace data

## Support

For issues related to:
- **Optik SDK**: Check Optik documentation and support
- **Integration**: Review this documentation and test logs
- **Configuration**: Verify environment variables and wrangler settings