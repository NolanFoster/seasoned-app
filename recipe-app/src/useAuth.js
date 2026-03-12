import { useState, useEffect, useCallback } from 'react'

const AUTH_WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL
const TOKEN_KEY = 'seasoned_auth_token'
const USER_KEY = 'seasoned_auth_user'

function getStoredAuth() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const user = JSON.parse(localStorage.getItem(USER_KEY))
    if (token && user) return { token, user }
  } catch { /* corrupted storage */ }
  return null
}

function storeAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredAuth()
    if (stored) {
      validateToken(stored.token).then((valid) => {
        if (valid) {
          setToken(stored.token)
          setUser(stored.user)
        } else {
          clearAuth()
        }
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  }, [])

  async function validateToken(t) {
    if (!AUTH_WORKER_URL) return false
    try {
      const res = await fetch(`${AUTH_WORKER_URL}/auth/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      })
      if (!res.ok) return false
      const data = await res.json()
      return data.success && data.valid
    } catch {
      return false
    }
  }

  async function requestOTP(email) {
    const res = await fetch(`${AUTH_WORKER_URL}/otp/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to send verification code')
    }
    return data
  }

  async function verifyOTP(email, otp) {
    const res = await fetch(`${AUTH_WORKER_URL}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Verification failed')
    }
    if (data.token && data.user) {
      storeAuth(data.token, data.user)
      setToken(data.token)
      setUser(data.user)
    }
    return data
  }

  const signOut = useCallback(() => {
    clearAuth()
    setToken(null)
    setUser(null)
  }, [])

  return {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    requestOTP,
    verifyOTP,
    signOut,
  }
}
