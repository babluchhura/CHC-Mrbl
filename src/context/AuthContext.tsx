import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session as SupabaseSession, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import {
  loadSupabaseClient,
  SupabaseAuthProviders,
  SupabaseRuntimeConfig,
} from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { SessionInfo } from '../types';

interface AuthContextValue {
  supabaseClient: SupabaseClient | null;
  supabaseConfig: SupabaseRuntimeConfig | null;
  supabaseConfigured: boolean;
  enabledProviders: SupabaseAuthProviders;
  supabaseUser: SupabaseUser | null;
  session: SessionInfo | null;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ ok: boolean; needsEmailConfirmation: boolean }>;
  sendPhoneOtp: (mobile10Digits: string) => Promise<boolean>;
  verifyPhoneOtp: (mobile10Digits: string, token: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeIndianPhone(mobile10Digits: string): string {
  const digits = mobile10Digits.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseRuntimeConfig | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadBackendSession = useCallback(async (supaSession: SupabaseSession | null) => {
    if (!supaSession?.access_token) {
      setSupabaseUser(null);
      setSession(null);
      setAuthLoading(false);
      return;
    }

    setSupabaseUser(supaSession.user);
    try {
      setAuthError(null);
      const resp = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${supaSession.access_token}`,
        },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Unable to verify Supabase session.');
      }
      const data: SessionInfo = await resp.json();
      setSession(data);
    } catch (error: any) {
      console.error('Backend session load failed:', error);
      setAuthError(error?.message || 'Unable to verify account session.');
      setSession(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    loadSupabaseClient()
      .then(async ({ client, config }) => {
        if (!active) return;
        setSupabaseClient(client);
        setSupabaseConfig(config);

        if (!client) {
          setAuthLoading(false);
          return;
        }

        const { data } = await client.auth.getSession();
        if (active) {
          await loadBackendSession(data.session);
        }

        const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;
          void loadBackendSession(nextSession);
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      })
      .catch((err) => {
        console.error('Supabase initialization error:', err);
        if (active) {
          setAuthError('Unable to initialize Supabase Authentication.');
          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [loadBackendSession]);

  const ensureClient = useCallback((): SupabaseClient => {
    if (!supabaseClient) {
      throw new Error(
        'Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in AI Studio Secrets.'
      );
    }
    return supabaseClient;
  }, [supabaseClient]);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setAuthError(null);
      try {
        const client = ensureClient();
        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setAuthError(error.message);
          return false;
        }
        await loadBackendSession(data.session);
        return true;
      } catch (err: any) {
        setAuthError(err?.message || 'Sign-in failed.');
        return false;
      }
    },
    [ensureClient, loadBackendSession]
  );

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      fullName: string
    ): Promise<{ ok: boolean; needsEmailConfirmation: boolean }> => {
      setAuthError(null);
      try {
        const client = ensureClient();
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) {
          setAuthError(error.message);
          return { ok: false, needsEmailConfirmation: false };
        }
        if (data.session) {
          await loadBackendSession(data.session);
          return { ok: true, needsEmailConfirmation: false };
        }
        return { ok: true, needsEmailConfirmation: true };
      } catch (err: any) {
        setAuthError(err?.message || 'Account creation failed.');
        return { ok: false, needsEmailConfirmation: false };
      }
    },
    [ensureClient, loadBackendSession]
  );

  const sendPhoneOtp = useCallback(
    async (mobile10Digits: string): Promise<boolean> => {
      setAuthError(null);
      try {
        const client = ensureClient();
        if (supabaseConfig && !supabaseConfig.providers.phone) {
          setAuthError(
            'Phone SMS OTP is not enabled in Supabase yet. Enable Phone provider in Supabase Dashboard (Authentication → Providers → Phone) or sign in using Email & Password right now.'
          );
          return false;
        }
        const phone = normalizeIndianPhone(mobile10Digits);
        const { error } = await client.auth.signInWithOtp({ phone });
        if (error) {
          if (error.message.toLowerCase().includes('provider is not enabled')) {
            setAuthError(
              'Phone SMS OTP provider is currently disabled in Supabase. Use Email & Password Login, or enable Phone under Supabase Authentication → Providers.'
            );
          } else {
            setAuthError(error.message);
          }
          return false;
        }
        return true;
      } catch (err: any) {
        setAuthError(err?.message || 'Failed to send SMS OTP via Supabase.');
        return false;
      }
    },
    [ensureClient, supabaseConfig]
  );

  const verifyPhoneOtp = useCallback(
    async (mobile10Digits: string, token: string): Promise<boolean> => {
      setAuthError(null);
      try {
        const client = ensureClient();
        const phone = normalizeIndianPhone(mobile10Digits);
        const { data, error } = await client.auth.verifyOtp({
          phone,
          token: token.trim(),
          type: 'sms',
        });
        if (error) {
          setAuthError(error.message);
          return false;
        }
        await loadBackendSession(data.session);
        return true;
      } catch (err: any) {
        setAuthError(err?.message || 'OTP verification failed.');
        return false;
      }
    },
    [ensureClient, loadBackendSession]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const client = ensureClient();
      // Re-check live provider status before browser redirect to prevent raw 400 JSON error page
      let googleEnabled = Boolean(supabaseConfig?.providers?.google);
      if (!googleEnabled) {
        try {
          const resp = await fetch('/api/config/supabase');
          if (resp.ok) {
            const latest: SupabaseRuntimeConfig = await resp.json();
            setSupabaseConfig(latest);
            googleEnabled = Boolean(latest.providers?.google);
          }
        } catch {
          // Keep cached value
        }
      }
      if (!googleEnabled) {
        setAuthError(
          'Google Sign-In is not enabled in your Supabase project yet. Use Email & Password Login right now, or enable Google under Supabase Dashboard → Authentication → Providers → Google.'
        );
        return;
      }

      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.href,
        },
      });
      if (error) {
        setAuthError(error.message);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Google sign-in via Supabase failed.');
    }
  }, [ensureClient, supabaseConfig]);

  const sendPasswordReset = useCallback(
    async (email: string): Promise<boolean> => {
      setAuthError(null);
      try {
        const client = ensureClient();
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + '/patient',
        });
        if (error) {
          setAuthError(error.message);
          return false;
        }
        return true;
      } catch (err: any) {
        setAuthError(err?.message || 'Unable to send password recovery email.');
        return false;
      }
    },
    [ensureClient]
  );

  const signOutUser = useCallback(async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    setSupabaseUser(null);
    setSession(null);
    setAuthError(null);
  }, [supabaseClient]);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiFetch<SessionInfo>('/api/auth/me', { requireAuth: true });
      setSession(data);
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        supabaseClient,
        supabaseConfig,
        supabaseConfigured: Boolean(supabaseConfig?.configured),
        enabledProviders: supabaseConfig?.providers || {
          email: true,
          phone: false,
          google: false,
        },
        supabaseUser,
        session,
        authLoading,
        authError,
        clearAuthError: () => setAuthError(null),
        signInWithEmail,
        signUpWithEmail,
        sendPhoneOtp,
        verifyPhoneOtp,
        signInWithGoogle,
        sendPasswordReset,
        signOutUser,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
