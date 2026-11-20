import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseAuthProviders {
  email: boolean;
  phone: boolean;
  google: boolean;
}

export interface SupabaseRuntimeConfig {
  projectId: string;
  url: string;
  anonKey: string;
  configured: boolean;
  storageConfigured: boolean;
  doctorBucket: string;
  documentsBucket: string;
  providers: SupabaseAuthProviders;
}

const DEFAULT_PROJECT_ID = 'wlxkanjneaxpnnlkpnqc';
const DEFAULT_SUPABASE_URL = `https://${DEFAULT_PROJECT_ID}.supabase.co`;

let cachedClient: SupabaseClient | null = null;
let cachedConfig: SupabaseRuntimeConfig | null = null;
let initPromise: Promise<{ client: SupabaseClient | null; config: SupabaseRuntimeConfig }> | null =
  null;

export async function loadSupabaseClient(): Promise<{
  client: SupabaseClient | null;
  config: SupabaseRuntimeConfig;
}> {
  if (cachedConfig) {
    return { client: cachedClient, config: cachedConfig };
  }

  if (!initPromise) {
    initPromise = (async () => {
      const envUrl =
        (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || DEFAULT_SUPABASE_URL;
      const envAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

      let config: SupabaseRuntimeConfig = {
        projectId: DEFAULT_PROJECT_ID,
        url: envUrl,
        anonKey: envAnon,
        configured: Boolean(envUrl && envAnon),
        storageConfigured: Boolean(envUrl && envAnon),
        doctorBucket: 'doctor-photos',
        documentsBucket: 'patient-documents',
        providers: {
          email: true,
          phone: false,
          google: false,
        },
      };

      try {
        const resp = await fetch('/api/config/supabase');
        if (resp.ok) {
          const serverCfg: Partial<SupabaseRuntimeConfig> = await resp.json();
          config = {
            ...config,
            ...serverCfg,
            url: serverCfg.url || config.url,
            anonKey: serverCfg.anonKey || config.anonKey,
            configured: Boolean(
              (serverCfg.url || config.url) && (serverCfg.anonKey || config.anonKey)
            ),
            providers: serverCfg.providers || config.providers,
          };
        }
      } catch {
        // Fallback to Vite env vars if available
      }

      cachedConfig = config;
      if (config.configured && config.url && config.anonKey) {
        cachedClient = createClient(config.url, config.anonKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
          },
        });
      }
      return { client: cachedClient, config };
    })();
  }

  return initPromise;
}

export function getSupabaseClientSync(): SupabaseClient | null {
  return cachedClient;
}
