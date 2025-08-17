# Migration Guide: OpenAI to Cloudflare Workers AI

This guide explains the changes made to migrate from OpenAI API to Cloudflare Workers AI.

## Key Changes

### 1. No More API Keys
- **Before**: Required `OPENAI_API_KEY` environment variable
- **After**: Uses Cloudflare's built-in AI binding - no API keys needed!

### 2. Model Change
- **Before**: OpenAI GPT-3.5-turbo
- **After**: Cloudflare GPT-OSS-20B (Open Source model)

### 3. Configuration Changes

#### wrangler.toml
Added AI binding:
```toml
[ai]
binding = "AI"
```

Removed OpenAI-related comments and configuration.

#### package.json
- Removed `openai` dependency
- Updated description and keywords

### 4. Code Changes

The main change in `src/index.js`:

```javascript
// Before
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  // OpenAI API call configuration
});

// After
const response = await env.AI.run('@cf/openai/gpt-oss-20b', {
  instructions: 'You are a helpful culinary assistant...',
  input: prompt
});
```

### 5. Response Handling

The AI response structure is different:
- OpenAI returns: `data.choices[0].message.content`
- Cloudflare AI returns: `response.response` or `response.result` or `response.text`

### 6. Benefits of Migration

1. **No API costs** - Cloudflare Workers AI is included in your Workers plan
2. **No API key management** - More secure, no secrets to manage
3. **Better latency** - Runs on Cloudflare's edge network
4. **Simpler deployment** - No environment variables needed

### 7. Testing

All existing tests continue to work. The mock data fallback remains the same.

### 8. Deployment

Simply deploy with:
```bash
npm run deploy
```

No need to set up API keys or secrets!

## Notes

- The GPT-OSS-20B model provides similar quality recommendations
- The fallback to mock data still works when AI is unavailable
- The API interface remains unchanged - clients don't need to update