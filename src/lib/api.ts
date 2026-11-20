import { loadSupabaseClient } from './supabase';

export async function getAuthToken(): Promise<string | null> {
  const { client } = await loadSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token || null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { requireAuth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.requireAuth) {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Please sign in with Supabase to continue.');
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errData = await response.json();
      if (errData?.error) message = errData.error;
    } catch {
      // Fallback to HTTP status message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function uploadAuthenticatedFormData<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Please sign in with Supabase to upload files.');
  }

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const errData = await response.json();
      if (errData?.error) message = errData.error;
    } catch {
      // Fallback
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function downloadAuthenticatedCsv(path: string, filename: string): Promise<void> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Administrator authentication is required.');
  }
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error('Unable to export CSV report.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
