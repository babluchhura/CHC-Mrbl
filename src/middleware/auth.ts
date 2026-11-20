import { Request, Response, NextFunction } from 'express';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { getSupabaseServerClient } from '../lib/supabase-admin.ts';
import { db } from '../db/index.ts';
import { admins, users } from '../db/schema.ts';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    phone: string;
    name: string;
    supabaseUser: SupabaseUser;
  };
  isAdmin?: boolean;
  dbUser?: typeof users.$inferSelect;
}

const DEFAULT_OWNER_EMAIL = 'yogeshchhura@gmail.com';

function getConfiguredAdminEmails(): Set<string> {
  const envList = (process.env.HOSPITAL_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set<string>([DEFAULT_OWNER_EMAIL, ...envList]);
}

export async function isAuthorizedAdminEmail(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (getConfiguredAdminEmails().has(normalized)) {
    return true;
  }
  try {
    const existing = await db
      .select()
      .from(admins)
      .where(eq(admins.email, normalized))
      .limit(1);
    return existing.length > 0 && existing[0].isActive;
  } catch (error) {
    console.error('Admin lookup failed:', error);
    return false;
  }
}

export async function syncSupabaseUserRecord(supaUser: SupabaseUser) {
  const email = (supaUser.email || '').trim().toLowerCase();
  const phone = (supaUser.phone || '').trim();
  const metaName =
    (supaUser.user_metadata?.full_name as string | undefined) ||
    (supaUser.user_metadata?.name as string | undefined) ||
    '';
  const adminAuthorized = await isAuthorizedAdminEmail(email);
  const resolvedRole = adminAuthorized ? 'admin' : 'patient';

  try {
    const result = await db
      .insert(users)
      .values({
        uid: supaUser.id,
        email: email || phone || supaUser.id,
        displayName: metaName || null,
        role: resolvedRole,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email || phone || supaUser.id,
          displayName: metaName || null,
          role: resolvedRole,
        },
      })
      .returning();

    if (adminAuthorized && email) {
      await db
        .insert(admins)
        .values({
          email,
          fullName: metaName || 'Hospital Administrator',
          designation: 'Authorized Hospital Administrator',
          isActive: true,
        })
        .onConflictDoNothing({ target: admins.email });
    }

    return {
      dbUser: result[0],
      isAdmin: adminAuthorized,
      normalizedUser: {
        uid: supaUser.id,
        email,
        phone,
        name: metaName,
        supabaseUser: supaUser,
      },
    };
  } catch (error) {
    console.error('Failed to sync Supabase user:', error);
    throw new Error('Unable to verify user session.', { cause: error });
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired Supabase authentication token.' });
    }

    const { dbUser, isAdmin, normalizedUser } = await syncSupabaseUserRecord(data.user);
    req.user = normalizedUser;
    req.dbUser = dbUser;
    req.isAdmin = isAdmin;
    next();
  } catch (error: any) {
    console.error('Error verifying Supabase access token:', error);
    return res.status(401).json({
      error: error?.message || 'Unable to verify Supabase authentication session.',
    });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await requireAuth(req, res, () => {
    if (!req.isAdmin) {
      return res.status(403).json({
        error: 'Access denied. Only authorized hospital administrators can access this resource.',
      });
    }
    next();
  });
};
