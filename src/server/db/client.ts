import { MongoClient, type Db } from "mongodb";
import { env } from "../env";

// One MongoClient per process, cached on globalThis so dev hot reload does not open a new pool per edit.
const g = globalThis as typeof globalThis & { __nexusMongo?: Promise<MongoClient> };

function connect(): Promise<MongoClient> {
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, maxPoolSize: 10 });
  const p = client.connect();
  // A failed connect must not poison the cache; the next caller retries.
  p.catch(() => {
    if (g.__nexusMongo === p) delete g.__nexusMongo;
  });
  return p;
}

export async function getDb(): Promise<Db> {
  g.__nexusMongo ??= connect();
  return (await g.__nexusMongo).db(env.MONGODB_DB);
}

export async function pingDb(): Promise<boolean> {
  try {
    await (await getDb()).command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  const p = g.__nexusMongo;
  delete g.__nexusMongo;
  if (p) await (await p).close();
}
