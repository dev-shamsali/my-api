import { getDb } from "../../config/database.js";

const tokens = () => getDb().collection("refresh_tokens");

const toRecord = (d) => ({
  id: d._id,
  userId: d.userId,
  familyId: d.familyId,
  tokenHash: d.tokenHash,
  createdAt: d.createdAt,
  expiresAt: d.expiresAt,
  familyExpiresAt: d.familyExpiresAt,
  usedAt: d.usedAt ?? null,
  revokedAt: d.revokedAt ?? null,
});

/** Indexes for refresh tokens. MongoDB deletes a record one day after its session limit, when nothing can use it any more. */
async function ensureRefreshStore() {
  await tokens().createIndex({ tokenHash: 1 }, { unique: true });
  await tokens().createIndex({ familyId: 1 });
  await tokens().createIndex({ userId: 1 });
  await tokens().createIndex({ familyExpiresAt: 1 }, { expireAfterSeconds: 86_400 });
}

/** Only a hash of each token is stored, never the token. */
const refreshStore = {
  async create(r) {
    await tokens().insertOne({
      _id: r.id,
      userId: r.userId,
      familyId: r.familyId,
      tokenHash: r.tokenHash,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      familyExpiresAt: r.familyExpiresAt,
      usedAt: null,
      revokedAt: null,
    });
  },
  async findByHash(tokenHash) {
    const d = await tokens().findOne({ tokenHash });
    return d ? toRecord(d) : null;
  },
  // The filter makes the claim atomic: of two simultaneous requests, only one modifies the document.
  async markUsed(id, at) {
    const r = await tokens().updateOne({ _id: id, usedAt: null }, { $set: { usedAt: at } });
    return r.modifiedCount === 1;
  },
  async revokeFamily(familyId, at) {
    await tokens().updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: at } });
  },
  async revokeUser(userId, at) {
    await tokens().updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at } });
  },
};

export { refreshStore, ensureRefreshStore };
