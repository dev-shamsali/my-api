import { MongoClient } from "mongodb";

import { env } from "./env.js";

let client;

/** Connects before the server starts listening. Fails fast with a clear message if MongoDB is unreachable. */
async function connectDatabase(logger) {
  const c = new MongoClient(env.DATABASE_URL, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000, appName: "rhea-app" });
  try {
    await c.connect();
    await c.db().command({ ping: 1 });
  } catch (err) {
    await c.close().catch(() => undefined);
    throw new Error("Could not connect to MongoDB. Check DATABASE_URL and that the server is running.", { cause: err });
  }
  client = c;
  logger.info({ database: c.db().databaseName }, "MongoDB connected");
}

/** The connected database. Use it in your repositories. */
function getDb() {
  if (!client) throw new Error("Database is not connected");
  return client.db();
}

async function pingDatabase() {
  try {
    await getDb().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

async function disconnectDatabase() {
  const c = client;
  client = undefined;
  if (c) await c.close();
}

export { connectDatabase, getDb, pingDatabase, disconnectDatabase };
