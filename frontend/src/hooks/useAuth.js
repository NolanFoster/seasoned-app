import { useState, useEffect, useCallback } from 'react';

const TOKEN_KEY = 'seasoned_auth_token';
const USER_KEY = 'seasoned_auth_user';
const AUTH_WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL;

export function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);

        // Silently validate token in background; clear session if expired
        if (AUTH_WORKER_URL) {
          fetch(`${AUTH_WORKER_URL}/auth/validate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${storedToken}`,
            },
          })
            .then((res) => { if (!res.ok) clearSession(); })
            .catch(() => { /* network error — keep session optimistically */ });
        }
      } catch {
        clearSession();
      }
    }

    setIsLoading(false);
  }, [clearSession]);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
  };
}
