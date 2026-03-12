import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'

const AUTH_TOKEN_STORAGE_KEY = 'seasoned_auth_token'
const AUTH_USER_STORAGE_KEY = 'seasoned_auth_user'

describe('App authentication flow', () => {
  beforeEach(() => {
    process.env.VITE_AUTH_WORKER_URL = 'https://test-auth.example.com'
    localStorage.clear()
    global.fetch.mockClear()
  })

  afterEach(() => {
    delete process.env.VITE_AUTH_WORKER_URL
    localStorage.clear()
  })

  test('shows auth UI when auth worker is configured', () => {
    render(<App />)
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send sign in code/i })).toBeInTheDocument()
  })

  test('completes sign in using OTP and stores session token', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, message: 'Code sent' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          token: 'jwt-token-1',
          user: { id: 'u-1', email: 'chef@example.com' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          valid: true,
          user: { id: 'u-1', email: 'chef@example.com' },
        }),
      })

    render(<App />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'chef@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Send sign in code/i }))

    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Verify and continue/i }))

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Search recipes, paste a URL, or describe a dish/i)).toBeInTheDocument()
    )

    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('jwt-token-1')
    expect(JSON.parse(localStorage.getItem(AUTH_USER_STORAGE_KEY))).toMatchObject({
      id: 'u-1',
      email: 'chef@example.com',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-auth.example.com/otp/generate',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-auth.example.com/otp/verify',
      expect.objectContaining({ method: 'POST' })
    )
  })

  test('validates stored session and allows sign out', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'existing-token')
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({ id: 'u-2', email: 'baker@example.com' }))

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        valid: true,
        user: { id: 'u-2', email: 'baker@example.com' },
      }),
    })

    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Sign out/i }))

    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
  })
})
