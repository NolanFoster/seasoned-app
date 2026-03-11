export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Proxy /api/eval/* to Flaggly service — auth token never reaches the client
    if (url.pathname.startsWith('/api/eval')) {
      const flagglyUrl = new URL(url.pathname + url.search, env.FLAGGLY_URL)

      const headers = new Headers(request.headers)
      headers.set('Authorization', `Bearer ${env.FLAGGLY_API_KEY}`)

      return fetch(new Request(flagglyUrl, {
        method: request.method,
        headers,
        body: request.body,
      }))
    }

    return env.ASSETS.fetch(request)
  },
}
