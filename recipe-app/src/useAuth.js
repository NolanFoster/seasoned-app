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

function base64urlToArrayBuffer(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function arrayBufferToBase64url(value) {
  const bytes = new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function isPasskeyAvailable() {
  return typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials
}

function decodeCreationOptions(options) {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    user: { ...options.user, id: base64urlToArrayBuffer(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(credential.id),
    })),
  }
}

function decodeRequestOptions(options) {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(credential.id),
    })),
  }
}

function serializeCredential(credential) {
  if (!credential) throw new Error('No passkey credential was returned')
  const response = credential.response
  const serialized = {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {},
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
  }

  for (const name of ['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle']) {
    if (response[name] !== undefined && response[name] !== null) {
      serialized.response[name] = typeof response[name] === 'string'
        ? response[name]
        : arrayBufferToBase64url(response[name])
    }
  }
  if (typeof response.getTransports === 'function') serialized.response.transports = response.getTransports()
  return serialized
}

function passkeyError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
    return new Error('Passkey sign-in was cancelled')
  }
  return error instanceof Error ? error : new Error('Passkey sign-in failed')
}

export function canUsePasskeys() {
  return isPasskeyAvailable()
}

export function __testOnlyPasskeyHelpers() {
  return { base64urlToArrayBuffer, arrayBufferToBase64url, decodeCreationOptions, decodeRequestOptions, serializeCredential }
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredAuth()
    if (stored) {
      validateToken(stored.token).then(async (valid) => {
        if (valid) {
          // Sliding expiration: renew the token on every app load
          const refreshed = await refreshToken(stored.token)
          const activeToken = refreshed ? refreshed.token : stored.token
          const activeUser = refreshed ? refreshed.user : stored.user
          storeAuth(activeToken, activeUser)
          setToken(activeToken)
          setUser(activeUser)
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

  async function refreshToken(t) {
    if (!AUTH_WORKER_URL) return null
    try {
      const res = await fetch(`${AUTH_WORKER_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.success && data.token ? data : null
    } catch {
      return null
    }
  }

  async function requestOTP(email) {
    const res = await fetch(`${AUTH_WORKER_URL}/otp/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to send verification code')
    return data
  }

  async function verifyOTP(email, otp) {
    const res = await fetch(`${AUTH_WORKER_URL}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.message || 'Verification failed')
    if (data.token && data.user) {
      storeAuth(data.token, data.user)
      setToken(data.token)
      setUser(data.user)
    }
    return data
  }

  async function signInWithPasskey(email) {
    if (!isPasskeyAvailable()) throw new Error('Passkeys are not supported in this browser')
    const normalizedEmail = email.trim().toLowerCase()
    const beginResponse = await fetch(`${AUTH_WORKER_URL}/passkeys/authenticate/begin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    })
    const beginData = await beginResponse.json()
    if (!beginResponse.ok || !beginData.success) throw new Error(beginData.message || 'No passkey is registered for this email')

    let assertion
    try {
      assertion = await navigator.credentials.get({ publicKey: decodeRequestOptions(beginData.options) })
    } catch (error) {
      throw passkeyError(error)
    }

    const completeResponse = await fetch(`${AUTH_WORKER_URL}/passkeys/authenticate/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        state: beginData.state,
        response: serializeCredential(assertion),
      }),
    })
    const completeData = await completeResponse.json()
    if (!completeResponse.ok || !completeData.success || !completeData.token || !completeData.user) {
      throw new Error(completeData.message || 'Passkey authentication failed')
    }
    storeAuth(completeData.token, completeData.user)
    setToken(completeData.token)
    setUser(completeData.user)
    return completeData
  }

  async function registerPasskey() {
    if (!isPasskeyAvailable()) throw new Error('Passkeys are not supported in this browser')
    if (!token) throw new Error('Authentication required')

    const beginResponse = await fetch(`${AUTH_WORKER_URL}/passkeys/register/begin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const beginData = await beginResponse.json()
    if (!beginResponse.ok || !beginData.success) throw new Error(beginData.message || 'Unable to start passkey registration')

    let credential
    try {
      credential = await navigator.credentials.create({ publicKey: decodeCreationOptions(beginData.options) })
    } catch (error) {
      throw passkeyError(error)
    }

    const completeResponse = await fetch(`${AUTH_WORKER_URL}/passkeys/register/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state: beginData.state, response: serializeCredential(credential) }),
    })
    const completeData = await completeResponse.json()
    if (!completeResponse.ok || !completeData.success) throw new Error(completeData.message || 'Passkey registration failed')
    return completeData
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
    signInWithPasskey,
    registerPasskey,
    signOut,
  }
}
