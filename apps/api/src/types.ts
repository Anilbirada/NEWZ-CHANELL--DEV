import type { Request } from 'express';

export type UserRole = 'admin' | 'editor';
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}
export type AuthedRequest = Request & { user?: AuthUser };
