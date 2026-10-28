import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signToken, type AuthClaims } from '@music/shared';
import type { PrismaClient } from './generated/client/index.js';
import { AppError } from './http.js';

export const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  displayName: z.string().trim().min(1).max(60)
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72)
});

export interface AccountView {
  id: string;
  email: string;
  displayName: string;
}

export interface Session {
  user: AccountView;
  token: string;
}

export interface AccountsOptions {
  jwtSecret: string;
  tokenTtlSeconds: number;
  bcryptRounds: number;
}

const view = (u: { id: string; email: string; displayName: string }): AccountView => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName
});

export function createAccountsService(prisma: PrismaClient, opts: AccountsOptions) {
  const open = (user: AccountView): Session => {
    const claims: AuthClaims = { userId: user.id, email: user.email, displayName: user.displayName };
    return { user, token: signToken(claims, opts.jwtSecret, opts.tokenTtlSeconds) };
  };

  // Compared against when an email is unknown, so a miss costs the same as a wrong password.
  const decoyHash = bcrypt.hashSync('decoy-password', opts.bcryptRounds);

  return {
    async signup(input: z.infer<typeof SignupSchema>): Promise<Session> {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

      const passwordHash = await bcrypt.hash(input.password, opts.bcryptRounds);
      try {
        const user = await prisma.user.create({
          data: { email: input.email, displayName: input.displayName, passwordHash }
        });
        return open(view(user));
      } catch (err) {
        // Lost a race with a concurrent signup for the same email (unique constraint).
        if ((err as { code?: string }).code === 'P2002') {
          throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
        }
        throw err;
      }
    },

    async login(input: z.infer<typeof LoginSchema>): Promise<Session> {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      const ok = await bcrypt.compare(input.password, user?.passwordHash ?? decoyHash);
      if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
      return open(view(user));
    },

    async find(userId: string): Promise<AccountView | null> {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return user ? view(user) : null;
    }
  };
}
