import { AppError, ConflictError, NotFoundError, UnauthorizedError } from "@rheajs/core";
import { hashPassword, needsRehash, verifyPassword } from "@rheajs/auth";

/** Thrown while an account is locked. The route turns `retryAfterSec` into a Retry-After header. */
class AccountLockedError extends AppError {
  constructor(retryAfterSec) {
    super(429, "ACCOUNT_LOCKED", "Too many failed sign-in attempts. Try again later.", { expose: true });
    this.retryAfterSec = retryAfterSec;
  }
}

/** The user as clients see it. The password hash and lockout counters never leave the service. */
const publicUser = (u) => ({ id: u.id, email: u.email, roles: u.roles, createdAt: u.createdAt });

function createAuthService(repo, { jwt, refresh, lockout, password }) {
  /** An access token (short-lived) and a refresh token (long-lived, rotated on every use). */
  async function session(u, refreshToken) {
    return {
      user: publicUser(u),
      accessToken: await jwt.sign({ sub: u.id, roles: u.roles }),
      tokenType: "Bearer",
      refreshToken: refreshToken.token,
      refreshExpiresAt: refreshToken.expiresAt,
    };
  }

  return {
    async register({ email, password: plain }) {
      // Cheap duplicate check first, so a repeated email does not cost a full password hash. The unique index still decides races.
      if (await repo.findByEmail(email)) throw new ConflictError("Email already registered", { code: "EMAIL_TAKEN" });
      const user = await repo.create({ email, passwordHash: await hashPassword(plain, password), roles: ["user"] });
      return session(user, await refresh.issue(user.id));
    },

    async login({ email, password: plain }) {
      const user = await repo.findByEmail(email);
      if (user) {
        // A locked account is refused before any password work, and the refusal does not extend the lock.
        const state = lockout.status(user);
        if (state.locked) throw new AccountLockedError(state.retryAfterSec);
      }
      // Verifies against a dummy hash when the user does not exist, so timing does not reveal registered emails.
      const ok = await verifyPassword(plain, user?.passwordHash ?? null);
      if (!user || !ok) {
        if (user) await repo.saveLockout(user.id, lockout.afterFailure(user));
        throw new UnauthorizedError("Invalid email or password", { code: "INVALID_CREDENTIALS" });
      }
      if (user.failedLogins > 0 || user.lockedUntil) await repo.saveLockout(user.id, lockout.afterSuccess());
      if (needsRehash(user.passwordHash, password)) await repo.updatePasswordHash(user.id, await hashPassword(plain, password));
      return session(user, await refresh.issue(user.id));
    },

    /** Trades a refresh token for a new access token and a new refresh token. The presented token stops working. */
    async refresh(token) {
      const next = await refresh.rotate(token);
      const user = await repo.findById(next.userId);
      if (!user) {
        await refresh.revokeAll(next.userId);
        throw new UnauthorizedError("Invalid refresh token", { code: "REFRESH_INVALID" });
      }
      return session(user, next);
    },

    /** Ends the session the refresh token belongs to. Safe to repeat. */
    async logout(token) {
      await refresh.revoke(token);
    },

    /** Ends every session of the user. */
    async logoutAll(userId) {
      await refresh.revokeAll(userId);
    },

    async me(id) {
      const user = await repo.findById(id);
      if (!user) throw new NotFoundError("User not found");
      return publicUser(user);
    },
  };
}

export { createAuthService, AccountLockedError };
