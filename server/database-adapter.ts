import { drizzle } from "drizzle-orm/mysql2";
import { createConnection, createPool, type Connection, type Pool } from "mysql2/promise";
import { getRuntimeEnv } from "./runtime-env";

export type DatabaseProviderName = "node" | "hyperdrive";

export interface HyperdriveBinding {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionString: string;
}

export interface DatabaseBindings {
  HYPERDRIVE?: HyperdriveBinding;
}

export interface RequestDatabaseContext {
  db: ReturnType<typeof drizzle>;
  close(): Promise<void>;
}

let bindings: DatabaseBindings = {};
let providerOverride: DatabaseProviderName | undefined;
let nodePool: Pool | undefined;
let nodeDb: ReturnType<typeof drizzle> | undefined;

export function configureDatabaseBindings(nextBindings: DatabaseBindings, provider?: DatabaseProviderName): void {
  bindings = nextBindings;
  providerOverride = provider;
}

export function getDatabaseProviderName(): DatabaseProviderName {
  const provider = (providerOverride ?? getRuntimeEnv("DATABASE_PROVIDER") ?? "node").toLowerCase();
  if (provider !== "node" && provider !== "hyperdrive") throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
  return provider;
}

/** Existing long-lived Node pool. Settings intentionally match the Manus runtime. */
export function getNodeDatabase(): ReturnType<typeof drizzle> | null {
  const databaseUrl = getRuntimeEnv("DATABASE_URL");
  if (!databaseUrl) return null;
  if (!nodeDb) {
    nodePool = createPool({
      uri: databaseUrl,
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 10_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30_000,
    });
    nodeDb = drizzle(nodePool);
  }
  return nodeDb;
}

async function createHyperdriveConnection(binding: HyperdriveBinding): Promise<Connection> {
  return createConnection({
    host: binding.host,
    port: binding.port,
    user: binding.user,
    password: binding.password,
    database: binding.database,
    disableEval: true,
  });
}

/** Request-scoped Worker DB. Call close() in a finally block. */
export async function createRequestDatabase(): Promise<RequestDatabaseContext> {
  if (getDatabaseProviderName() === "node") {
    const db = getNodeDatabase();
    if (!db) throw new Error("DATABASE_URL is not configured");
    return { db, close: async () => undefined };
  }
  if (!bindings.HYPERDRIVE) throw new Error("HYPERDRIVE binding is not configured");
  const connection = await createHyperdriveConnection(bindings.HYPERDRIVE);
  return { db: drizzle(connection), close: async () => connection.end() };
}

export async function checkDatabaseConnection(): Promise<boolean> {
  if (getDatabaseProviderName() === "node") {
    if (!nodePool) getNodeDatabase();
    if (!nodePool) return false;
    await nodePool.query("SELECT 1");
    return true;
  }
  if (!bindings.HYPERDRIVE) return false;
  const connection = await createHyperdriveConnection(bindings.HYPERDRIVE);
  try {
    await connection.query("SELECT 1");
    return true;
  } finally {
    await connection.end();
  }
}
