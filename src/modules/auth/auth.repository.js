import { randomUUID } from "node:crypto";
import { ConflictError } from "@rheajs/core";
import { getDb } from "../../config/database.js";
import { ensureRefreshStore } from "./auth.refresh-store.js";

const users = () => getDb().collection("users");

const toUser = (d) => ({
  id: d._id,
  email: d.email,
  passwordHash: d.passwordHash,
  roles: d.roles,
  createdAt: d.createdAt,
  failedLogins: d.failedLogins ?? 0,
  lockedUntil: d.lockedUntil ?? null,
});

/** Creates the indexes the auth module needs. Safe to run on every start. */
async function ensureUserStore() {
  await users().createIndex({ email: 1 }, { unique: true });
  await ensureRefreshStore();
}

const userRepository = {
  async findByEmail(email) {
    const d = await users().findOne({ email });
    return d ? toUser(d) : null;
  },
  async findById(id) {
    const d = await users().findOne({ _id: id });
    return d ? toUser(d) : null;
  },
  async create({ email, passwordHash, roles }) {
    const doc = { _id: randomUUID(), email, passwordHash, roles, createdAt: new Date(), failedLogins: 0, lockedUntil: null };
    try {
      await users().insertOne(doc);
    } catch (err) {
      if ((err).code === 11000) throw new ConflictError("Email already registered", { code: "EMAIL_TAKEN" });
      throw err;
    }
    return toUser(doc);
  },
  async updatePasswordHash(id, passwordHash) {
    await users().updateOne({ _id: id }, { $set: { passwordHash } });
  },
  async saveLockout(id, { failedLogins, lockedUntil }) {
    await users().updateOne({ _id: id }, { $set: { failedLogins, lockedUntil } });
  },
};

export { userRepository, ensureUserStore };
