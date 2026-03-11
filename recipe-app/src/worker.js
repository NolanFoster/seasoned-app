export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Proxy /api/eval/* to Flaggly via Service Binding — private, no public internet
    if (url.pathname.startsWith('/api/eval')) {
      console.log('[flaggly] incoming request', request.method, url.pathname)
      console.log('[flaggly] FLAGGLY binding present:', !!env.FLAGGLY)
      console.log('[flaggly] FLAGGLY_API_KEY present:', !!env.FLAGGLY_API_KEY)

      const headers = new Headers(request.headers)
      headers.set('Authorization', `Bearer ${env.FLAGGLY_API_KEY}`)

      try {
        const response = await env.FLAGGLY.fetch(new Request(request, { headers }))
        console.log('[flaggly] response status:', response.status)
        return response
      } catch (err) {
        console.error('[flaggly] fetch error:', err.message)
        throw err
      }
    }

    return env.ASSETS.fetch(request)
  },
}
