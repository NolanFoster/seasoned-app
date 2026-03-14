export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Proxy /api/eval/* to Flaggly via Service Binding — private, no public internet
    if (url.pathname.startsWith('/api/eval')) {
      const headers = new Headers(request.headers)
      headers.set('Authorization', `Bearer ${env.FLAGGLY_API_KEY}`)

      return env.FLAGGLY.fetch(new Request(request, { headers }))
    }

    return env.ASSETS.fetch(request)
  },
}
