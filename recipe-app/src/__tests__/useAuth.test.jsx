import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';

const AUTH_URL = 'https://test-auth.example.com';

function TestHarness() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="email">{auth.user?.email || ''}</span>
      <button data-testid="request" onClick={() => auth.requestOTP('u@e.com')}>req</button>
      <button data-testid="verify" onClick={() => auth.verifyOTP('u@e.com', '123456')}>ver</button>
      <button data-testid="signout" onClick={auth.signOut}>out</button>
    </div>
  );
}

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch.mockClear();
  });

  test('starts unauthenticated when no stored token', async () => {
    render(<TestHarness />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  test('validates stored token on mount', async () => {
    localStorage.setItem('seasoned_auth_token', 'old-token');
    localStorage.setItem('seasoned_auth_user', JSON.stringify({ id: '1', email: 'u@e.com' }));
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, valid: true }),
    });

    render(<TestHarness />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('email').textContent).toBe('u@e.com');
  });

  test('clears auth when stored token is invalid', async () => {
    localStorage.setItem('seasoned_auth_token', 'bad-token');
    localStorage.setItem('seasoned_auth_user', JSON.stringify({ id: '1', email: 'u@e.com' }));
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: false, valid: false }),
    });

    render(<TestHarness />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(localStorage.getItem('seasoned_auth_token')).toBeNull();
  });

  test('requestOTP calls auth worker generate endpoint', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, message: 'sent' }),
    });

    render(<TestHarness />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('request').click();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${AUTH_URL}/otp/generate`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('verifyOTP stores token and user on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        token: 'new-jwt',
        expiresIn: 86400,
        user: { id: '2', email: 'u@e.com' },
      }),
    });

    render(<TestHarness />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('verify').click();
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(localStorage.getItem('seasoned_auth_token')).toBe('new-jwt');
  });

  test('signOut clears token and user', async () => {
    localStorage.setItem('seasoned_auth_token', 'tok');
    localStorage.setItem('seasoned_auth_user', JSON.stringify({ id: '1', email: 'u@e.com' }));
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, valid: true }),
    });

    render(<TestHarness />);
    await waitFor(() => expect(screen.getByTestId('authenticated').textContent).toBe('true'));

    act(() => {
      screen.getByTestId('signout').click();
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(localStorage.getItem('seasoned_auth_token')).toBeNull();
  });

  test('requestOTP throws on server error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ success: false, message: 'Server error' }),
    });

    let caughtError = null;
    function TestWithCatch() {
      const auth = useAuth();
      return (
        <div>
          <span data-testid="loading">{String(auth.loading)}</span>
          <button data-testid="request" onClick={async () => {
            try { await auth.requestOTP('u@e.com'); } catch (e) { caughtError = e; }
          }}>req</button>
        </div>
      );
    }

    render(<TestWithCatch />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      screen.getByTestId('request').click();
    });

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toMatch(/Server error|Failed/i);
  });
});
