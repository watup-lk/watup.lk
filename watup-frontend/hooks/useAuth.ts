'use client';

import { useEffect, useState } from 'react';

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    setToken(t);
  }, []);

  function storeToken(t: string, persistent: boolean) {
    if (persistent) {
      localStorage.setItem('token', t);
    } else {
      sessionStorage.setItem('token', t);
    }
    setToken(t);
  }

  function clearToken() {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setToken(null);
  }

  return { token, storeToken, clearToken };
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') ?? sessionStorage.getItem('token');
}
