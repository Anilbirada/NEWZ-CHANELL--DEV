import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AuthedRequest, AuthUser, UserRole } from './types.js';

const tokenPayloadSchema = z.object({ sub: z.string().uuid(), email: z.string().email(), displayName: z.string(), role: z.enum(['admin', 'editor']) });
function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  return secret;
}

export function issueToken(user: AuthUser) {
  return jwt.sign({ email: user.email, displayName: user.displayName, role: user.role }, jwtSecret(), {
    subject: user.id,
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'],
    issuer: 'vachana-kranti-api',
    audience: 'vachana-kranti-web',
  });
}

export function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sign in to access the editorial workspace.' });
    return;
  }
  try {
    const decoded = jwt.verify(header.slice(7), jwtSecret(), { issuer: 'vachana-kranti-api', audience: 'vachana-kranti-web' });
    const parsed = tokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      res.status(401).json({ error: 'Invalid authentication token.' });
      return;
    }
    req.user = { id: parsed.data.sub, email: parsed.data.email, displayName: parsed.data.displayName, role: parsed.data.role as UserRole };
    next();
  } catch {
    res.status(401).json({ error: 'Your session is invalid or has expired. Sign in again.' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

export function optionalAuthenticate(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) { next(); return; }
  try {
    const decoded = jwt.verify(header.slice(7), jwtSecret(), { issuer: 'vachana-kranti-api', audience: 'vachana-kranti-web' });
    const parsed = tokenPayloadSchema.safeParse(decoded);
    if (parsed.success) req.user = { id: parsed.data.sub, email: parsed.data.email, displayName: parsed.data.displayName, role: parsed.data.role as UserRole };
  } catch { /* Public media requests may omit or carry an expired optional token. */ }
  next();
}
