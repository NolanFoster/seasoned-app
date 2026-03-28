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

## Grocery Prompt Optimization Workflow

You can now run a Python-based Opik prompt evaluation flow for grocery list generation.

### Prerequisites

- Python 3.10+
- `opik` Python SDK installed in your environment
- `OPIK_API_KEY` set in your shell
- Optional: `OPIK_WORKSPACE` (defaults to `recipe-generation`)
- Use `python3` in commands (macOS environments often do not provide `python`)

### Dataset and Script Locations

- Root runner script: `../optimize.py`
- Grocery helpers and starter samples: `scripts/grocery_opik_helpers.py`
- Candidate prompt template: `scripts/grocery_candidate_prompt.txt`

### Dataset Schema

The dataset rows used by the script include:

- `input`: dataset field used by default for prompt variable interpolation
- `expected_output`: reference grocery JSON string used by scoring
- `ingredient_lines`: multi-line ingredient input string
- `expected_json`: expected grocery JSON string
- `tags`: optional labels for filtering/grouping

### Commands

From `recipe-generation-worker`:

```bash
npm run opik:grocery:seed
```

Seeds curated starter examples into the Opik dataset (`OPIK_GROCERY_DATASET`, default `Grocery List`).

```bash
npm run opik:grocery:eval
```

Runs a baseline prompt experiment with grocery-specific scoring metrics:

- JSON format validity
- Grocery schema adherence
- Reference similarity

```bash
npm run opik:grocery:compare
```

Runs baseline and candidate prompt experiments and prints aggregate metric deltas (`candidate - baseline`).

Note: compare runs **two** full evaluations (baseline, then candidate). The progress bar restarts for the second phase; ~20–30s per row is normal for OpenRouter.

```bash
npm run opik:grocery:compare:fast
```

Uses `--fast` (`trial_count=1`) for quicker iteration.

### MetaPromptOptimizer (automated prompt variants)

Requires: `pip install opik-optimizer` (imports as `opik_optimizer`).

```bash
npm run opik:grocery:meta
```

Uses your Opik dataset (default `Grocery List`) and baseline prompt (`Grocery List`) to search for improved wording. Tuning:

- `OPIK_META_N_SAMPLES` (default 20 rows per scoring pass)
- `OPIK_META_ROUNDS`, `OPIK_META_PROMPTS_PER_ROUND`, `OPIK_META_N_THREADS`
- `OPIK_META_REASONING_MODEL` — optional stronger model for rewrite step (LiteLLM id). Small models (e.g. Llama 3.2 3B) often return invalid JSON for meta-prompting; use e.g. `openrouter/openai/gpt-4o-mini` here while keeping eval on 3B.
- Placeholder in the **seed** prompt must end up as `{input_text}` (single braces). Opik templates like `{{input.ingredients}}` are normalized automatically; fix in Opik if optimization shows 0 rounds.
- `OPIK_META_OUTPUT_PATH` — where to save the best user prompt (default: `scripts/grocery_meta_optimized_prompt.txt`)

The saved file uses `{input_text}` placeholders (optimizer format). If your Opik playground expects `{{input_text}}`, adjust before pasting.

### Useful Environment Variables

- `OPIK_GROCERY_DATASET`: dataset name override
- `OPIK_GROCERY_MODEL`: model string override (defaults to `openrouter/meta-llama/llama-3.2-3b-instruct`)
- `OPIK_GROCERY_CANDIDATE`: candidate prompt text override (alternative to file)
- `OPIK_GROCERY_INPUT_KEY`: prompt variable field name override (defaults to `input`)
- `OPENROUTER_API_KEY`: required when using an `openrouter/` model
- `OPIK_LITELLM_TIMEOUT`: per-request timeout in seconds for OpenRouter (default `180`; avoids 10-minute stalls)
- `OPIK_LITELLM_NUM_RETRIES`: LiteLLM retries for OpenRouter (default `4`)
- Lower `--task-threads` (default `3`) if OpenRouter rate-limits or times out