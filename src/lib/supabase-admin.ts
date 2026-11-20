import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_PROJECT_ID = 'wlxkanjneaxpnnlkpnqc';
export const DEFAULT_SUPABASE_URL = `https://${DEFAULT_SUPABASE_PROJECT_ID}.supabase.co`;

export const DOCTOR_PHOTOS_BUCKET =
  process.env.SUPABASE_STORAGE_DOCTOR_BUCKET || 'doctor-photos';
export const PATIENT_DOCUMENTS_BUCKET =
  process.env.SUPABASE_STORAGE_DOCUMENTS_BUCKET || 'patient-documents';

export interface SupabaseAuthProviders {
  email: boolean;
  phone: boolean;
  google: boolean;
}

let cachedProviders: { value: SupabaseAuthProviders; fetchedAt: number } | null = null;

export async function getSupabaseEnabledProviders(): Promise<SupabaseAuthProviders> {
  const { url, anonKey } = getSupabasePublicConfig();
  if (!url || !anonKey) {
    return { email: true, phone: false, google: false };
  }
  const now = Date.now();
  if (cachedProviders && now - cachedProviders.fetchedAt < 30_000) {
    return cachedProviders.value;
  }
  try {
    const resp = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    if (resp.ok) {
      const data = (await resp.json()) as { external?: Record<string, boolean> };
      const ext = data.external || {};
      const value: SupabaseAuthProviders = {
        email: ext.email !== false,
        phone: Boolean(ext.phone),
        google: Boolean(ext.google),
      };
      cachedProviders = { value, fetchedAt: now };
      return value;
    }
  } catch (err) {
    console.warn('Could not fetch Supabase auth provider settings:', err);
  }
  return cachedProviders?.value || { email: true, phone: false, google: false };
}

export function getSupabasePublicConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();

  return {
    projectId: DEFAULT_SUPABASE_PROJECT_ID,
    url,
    anonKey,
    configured: Boolean(url && anonKey),
    storageConfigured: Boolean(url && (serviceRoleKey || anonKey)),
    doctorBucket: DOCTOR_PHOTOS_BUCKET,
    documentsBucket: PATIENT_DOCUMENTS_BUCKET,
  };
}

let cachedAdminClient: SupabaseClient | null = null;
let cachedAuthClient: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client initialized with SUPABASE_SERVICE_ROLE_KEY
 * (preferred for Storage bucket management, private uploads, and signed URLs)
 * or falls back to SUPABASE_ANON_KEY for token verification when service role is absent.
 */
export function getSupabaseServerClient(): SupabaseClient {
  const { url, anonKey } = getSupabasePublicConfig();
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  const key = serviceRoleKey || anonKey;

  if (!url || !key) {
    throw new Error(
      `Supabase project (${DEFAULT_SUPABASE_PROJECT_ID}) is linked, but API keys are missing. Add SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in AI Studio Secrets.`
    );
  }

  if (serviceRoleKey) {
    if (!cachedAdminClient) {
      cachedAdminClient = createClient(url, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
    return cachedAdminClient;
  }

  if (!cachedAuthClient) {
    cachedAuthClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cachedAuthClient;
}

export function hasServiceRoleKey(): boolean {
  return Boolean(
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
  );
}

/**
 * Ensures a Supabase Storage bucket exists when SUPABASE_SERVICE_ROLE_KEY is configured.
 * Silently skips creation if bucket already exists.
 */
export async function ensureStorageBucket(bucketName: string, isPublic: boolean): Promise<void> {
  if (!hasServiceRoleKey()) return;
  const supabase = getSupabaseServerClient();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.warn(`Could not list Supabase storage buckets: ${error.message}`);
    return;
  }
  const exists = buckets?.some((b) => b.name === bucketName || b.id === bucketName);
  if (!exists) {
    const { error: createErr } = await supabase.storage.createBucket(bucketName, {
      public: isPublic,
      fileSizeLimit: isPublic ? 5 * 1024 * 1024 : 10 * 1024 * 1024,
    });
    if (createErr && !createErr.message.toLowerCase().includes('already exists')) {
      console.warn(`Could not create Supabase bucket "${bucketName}": ${createErr.message}`);
    }
  }
}

export async function uploadToSupabaseStorage(params: {
  bucket: string;
  path: string;
  buffer: Buffer;
  contentType: string;
  isPublic: boolean;
}): Promise<{ path: string; publicUrl: string | null }> {
  const supabase = getSupabaseServerClient();
  await ensureStorageBucket(params.bucket, params.isPublic);

  const { error: uploadError } = await supabase.storage
    .from(params.bucket)
    .upload(params.path, params.buffer, {
      contentType: params.contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  if (params.isPublic) {
    const { data } = supabase.storage.from(params.bucket).getPublicUrl(params.path);
    return { path: params.path, publicUrl: data.publicUrl };
  }

  return { path: params.path, publicUrl: null };
}

export async function createSignedDocumentUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 120
): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Unable to generate secure signed download URL.');
  }
  return data.signedUrl;
}

export async function removeFromSupabaseStorage(
  bucket: string,
  storagePath: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) {
    console.warn(`Supabase Storage delete warning (${bucket}/${storagePath}):`, error.message);
  }
}
