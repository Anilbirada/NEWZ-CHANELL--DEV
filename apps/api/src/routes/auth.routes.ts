import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query, audit } from '../db.js';
import { issueToken } from '../auth.js';
import type { AuthUser, UserRole } from '../types.js';

export const authRouter = Router();
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Enter a valid email address and password.' }); return; }
    const email = parsed.data.email.trim().toLowerCase();
    const result = await query<{ id: string; email: string; password_hash: string; display_name: string; role: UserRole; is_active: boolean }>(
      'SELECT id, email, password_hash, display_name, role, is_active FROM users WHERE lower(email) = $1', [email],
    );
    const user = result.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      res.status(401).json({ error: 'Email or password is incorrect.' }); return;
    }
    const publicUser: AuthUser = { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
    await audit(user.id, 'login', 'user', user.id, {}, req.ip);
    res.json({ token: issueToken(publicUser), user: publicUser });
  } catch (error) { next(error); }
});
