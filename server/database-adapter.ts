import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { createConnection, createPool, type Connection, type Pool } from "mysql2/promise";
import { getRuntimeEnv } from "./runtime-env";

export type DatabaseProviderName = "node" | "hyperdrive" | "direct-mysql";

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
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
}

export interface RequestDatabaseContext {
  db: ReturnType<typeof drizzle>;
  close(): Promise<void>;
}

export interface RequestDatabaseOptions {
  bindings?: DatabaseBindings;
  provider?: DatabaseProviderName;
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
  if (provider !== "node" && provider !== "hyperdrive" && provider !== "direct-mysql") {
    throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
  }
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

async function createDirectMySqlConnection(databaseBindings: DatabaseBindings): Promise<Connection> {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = databaseBindings;
  if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error("Direct MySQL bindings are not fully configured");
  }
  const port = Number(DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DB_PORT must be a valid TCP port");
  }
  return createConnection({
    host: DB_HOST,
    port,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    disableEval: true,
  });
}

/** Request-scoped Worker DB. Call close() in a finally block. */
export async function createRequestDatabase(options: RequestDatabaseOptions = {}): Promise<RequestDatabaseContext> {
  const provider = options.provider ?? getDatabaseProviderName();
  const requestBindings = options.bindings ?? bindings;
  if (provider === "node") {
    const db = getNodeDatabase();
    if (!db) throw new Error("DATABASE_URL is not configured");
    return { db, close: async () => undefined };
  }
  const connection = provider === "direct-mysql"
    ? await createDirectMySqlConnection(requestBindings)
    : requestBindings.HYPERDRIVE
      ? await createHyperdriveConnection(requestBindings.HYPERDRIVE)
      : (() => { throw new Error("HYPERDRIVE binding is not configured"); })();
  return { db: drizzle(connection), close: async () => connection.end() };
}

export async function checkDatabaseConnection(options: RequestDatabaseOptions = {}): Promise<boolean> {
  const context = await createRequestDatabase(options);
  try {
    await context.db.execute(sql`SELECT 1`);
    return true;
  } finally {
    await context.close();
  }
}
