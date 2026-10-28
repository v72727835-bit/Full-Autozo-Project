"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getErrorMessage, setSessionExpiredHandler, tokens } from '../api/client';
import { fetchMe } from '../api/admin';
import { AdminUser } from '../types';

interface AuthApi {
  user: AdminUser | null;
  loading: boolean;
  login: (identifier: string, password: string, kind?: 'admin' | 'seller' | 'provider') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    // The admin's profile came back with login and is cached alongside the
    // tokens, so a page refresh doesn't force a fresh sign-in.
    if (tokens.access && tokens.user) {
      const cached = tokens.user as AdminUser;
      setUser(cached);
      // Refresh an admin's role & permissions in the background, so a change a
      // super admin made to this account takes effect without a re-login.
      if (cached.role === 'admin') {
        fetchMe()
          .then((fresh) => {
            setUser(fresh);
            tokens.save(tokens.access!, tokens.refresh!, fresh);
          })
          .catch(() => undefined);
      }
    }
    setLoading(false);
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = async (identifier: string, password: string, kind: 'admin' | 'seller' | 'provider' = 'admin') => {
    const endpoint = kind === 'seller' ? '/seller/auth/login' : kind === 'provider' ? '/provider/auth/login' : '/admin/auth/login';
    try {
      const { data } = await api.post(endpoint, { identifier, password });
      tokens.save(data.data.accessToken, data.data.refreshToken, data.data.user);
      setUser(data.data.user);
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  };

  const logout = () => {
    tokens.clear();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
