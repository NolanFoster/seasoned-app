export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Proxy /api/eval/* to Flaggly via Service Binding — private, no public internet.
    // FLAGGLY_API_KEY must be the **user** eval JWT from Flaggly POST /__generate (field `user`),
    // signed with your Flaggly JWT_SECRET and iss "flaggly.user". Do NOT use JWT_SECRET itself,
    // the `admin` token, or an API key from another product — Flaggly returns 401 and flags never sync.
    if (url.pathname.startsWith('/api/eval')) {
      const headers = new Headers(request.headers)
      headers.set('Authorization', `Bearer ${env.FLAGGLY_API_KEY}`)

      return env.FLAGGLY.fetch(new Request(request, { headers }))
    }

    return env.ASSETS.fetch(request)
  },
}
