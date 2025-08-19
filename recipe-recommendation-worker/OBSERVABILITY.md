# Recipe Recommendation Worker - Observability Guide

This document describes the comprehensive observability features implemented in the Recipe Recommendation Worker, including logging, metrics, analytics, and monitoring capabilities.

## Overview

The Recipe Recommendation Worker includes built-in observability features to monitor performance, track errors, and analyze usage patterns. The implementation follows industry best practices for distributed systems monitoring.

## Features

### 1. Structured Logging

All logs are structured JSON with consistent fields:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Request completed",
  "worker": "recipe-recommendation-worker",
  "requestId": "req_1642248600000_abc123def",
  "method": "POST",
  "path": "/recommendations",
  "status": 200,
  "duration": "245ms",
  "country": "US"
}
```

#### Log Levels
- **ERROR**: Critical failures and exceptions
- **WARN**: Non-critical issues and fallback scenarios
- **INFO**: Normal operations and key events
- **DEBUG**: Detailed diagnostic information

### 2. Request Tracking

Every request gets a unique ID for end-to-end tracing:
- Format: `req_{timestamp}_{random}`
- Included in all logs and responses
- Enables correlation across distributed systems

### 3. Performance Metrics

The worker collects detailed timing metrics:

#### Request Metrics
- `request_duration`: Total request processing time
- `recommendations_duration`: Time to generate recommendations
- `ai_request_duration`: AI model call duration
- `ai_response_parse_duration`: JSON parsing time
- `mock_generation_duration`: Mock data generation time

#### Counter Metrics
- `requests_total`: Total requests by method, path, country
- `responses_total`: Total responses by status code
- `errors_total`: Total errors by category and severity
- `ai_requests`: AI model calls by model and parameters
- `ai_success`: Successful AI generations
- `ai_errors`: AI failures by type
- `recommendations_requested`: Recommendation requests by parameters

### 4. Error Categorization

Errors are automatically categorized for better analysis:

- **code_error**: Programming errors (TypeError, ReferenceError)
- **ai_service_error**: AI model failures
- **network_error**: Network connectivity issues
- **parsing_error**: JSON parsing failures
- **timeout_error**: Request timeouts
- **unknown**: Uncategorized errors

### 5. Cloudflare Analytics Integration

The worker sends structured events to Cloudflare Analytics Engine:

#### Events Tracked
- `request_completed`: Successful request completion
- `request_error`: Request failures
- `recommendations_generated`: Successful recommendation generation
- `ai_recommendation_success`: Successful AI model calls
- `ai_recommendation_error`: AI model failures

#### Analytics Data Points
Each event includes relevant context:
```json
{
  "timestamp": 1642248600000,
  "event": "recommendations_generated",
  "requestId": "req_1642248600000_abc123def",
  "hasLocation": true,
  "location": "Seattle, WA",
  "duration": 245,
  "categoriesCount": 3,
  "isAIGenerated": true,
  "season": "Winter"
}
```

## Endpoints

### Health Check: `/health`
Comprehensive health monitoring with service status:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1642248600000_abc123def",
  "services": {
    "ai": "healthy"
  },
  "metrics": {
    "uptime": 1000,
    "totalRequests": 150
  }
}
```

### Metrics: `/metrics`
Real-time metrics endpoint:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1642248600000_abc123def",
  "metrics": {
    "requests_total:{\"method\":\"POST\",\"path\":\"/recommendations\"}": {
      "count": 100,
      "tags": {"method": "POST", "path": "/recommendations"}
    },
    "request_duration:{\"method\":\"POST\",\"status\":\"200\"}": {
      "count": 95,
      "total": 12500,
      "min": 89,
      "max": 450,
      "avg": 131.58
    }
  },
  "summary": {
    "totalMetrics": 25,
    "uptime": 3600000
  }
}
```

## Configuration

### Wrangler Configuration

The observability features are configured in `wrangler.toml`:

```toml
# Enable observability features
[observability]
enabled = true

# Analytics Engine binding for metrics collection
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "recipe_recommendations_metrics"

# Environment-specific datasets
[[env.production.analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "recipe_recommendations_metrics_prod"
```

### Environment Variables

No additional environment variables are required. The worker uses Cloudflare's built-in bindings:
- `AI`: Cloudflare Workers AI binding
- `ANALYTICS`: Analytics Engine binding

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Request Success Rate**: `responses_total{status=200} / requests_total`
2. **Error Rate**: `errors_total / requests_total`
3. **AI Success Rate**: `ai_success / ai_requests`
4. **Response Time P95**: 95th percentile of `request_duration`
5. **AI Fallback Rate**: `ai_fallback_to_mock / recommendations_requested`

### Recommended Alerts

- **High Error Rate**: Error rate > 5%
- **Slow Responses**: P95 response time > 2000ms
- **AI Service Issues**: AI success rate < 90%
- **High Fallback Rate**: AI fallback rate > 20%

## Usage

### Development

```bash
# Start development server with logs
npm run dev

# Watch logs in real-time
npm run logs

# View analytics
npm run analytics
```

### Production Monitoring

```bash
# Tail production logs
npm run logs:production

# Check health status
curl https://your-worker.workers.dev/health

# View metrics
curl https://your-worker.workers.dev/metrics
```

### Log Analysis

Logs can be analyzed using standard JSON processing tools:

```bash
# Filter error logs
wrangler tail --env production | jq 'select(.level == "error")'

# Analyze response times
wrangler tail --env production | jq 'select(.duration) | .duration'

# Track AI model performance
wrangler tail --env production | jq 'select(.message | contains("AI")) | {requestId, duration, model}'
```

## Best Practices

1. **Request ID Propagation**: Always include request IDs in downstream calls
2. **Error Context**: Log sufficient context for debugging
3. **Metric Granularity**: Balance detail with storage costs
4. **Alert Thresholds**: Set appropriate thresholds based on SLA requirements
5. **Log Retention**: Configure appropriate retention policies

## Troubleshooting

### Common Issues

1. **Missing Analytics Data**
   - Check Analytics Engine binding configuration
   - Verify dataset names match across environments

2. **High AI Error Rates**
   - Monitor AI service status
   - Check prompt length and format
   - Verify model availability

3. **Slow Response Times**
   - Analyze AI request duration
   - Check for network issues
   - Review parsing performance

### Debug Mode

Enable debug logging by setting appropriate log levels in development:

```javascript
// Temporary debug logging
log('debug', 'Detailed diagnostic info', { 
  requestId, 
  detailedContext: {...} 
});
```

## Integration with External Tools

### Grafana Dashboards

Create dashboards using Cloudflare Analytics data:
- Request volume and error rates
- Response time distributions
- AI model performance
- Geographic usage patterns

### Alerting Systems

Configure alerts using:
- Cloudflare Analytics webhooks
- Custom monitoring scripts
- Third-party APM tools

## Security Considerations

- Logs may contain user location data (anonymized in analytics)
- Request IDs are safe for external correlation
- Error messages are sanitized for client responses
- Analytics data is aggregated and anonymized

## Performance Impact

The observability features have minimal performance impact:
- Logging: ~1-2ms per request
- Metrics collection: ~0.5ms per request
- Analytics: Asynchronous, no request impact
- Memory usage: ~50KB for metrics storage

## Future Enhancements

Planned observability improvements:
- Distributed tracing integration
- Custom dashboard templates
- Automated anomaly detection
- Performance regression alerts