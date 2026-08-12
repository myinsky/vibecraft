export type RuntimeEnv = Record<string, string | undefined>;

let workerEnv: RuntimeEnv | undefined;

/** Inject Cloudflare Env bindings at the Worker request boundary. */
export function configureRuntimeEnv(env: RuntimeEnv): void {
  workerEnv = env;
}

/** Read Worker bindings first and fall back to the existing Node process.env. */
export function getRuntimeEnv(name: string): string | undefined {
  const boundValue = workerEnv?.[name];
  if (boundValue !== undefined) return boundValue;
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export function isRuntimeEnv(name: string, value: string): boolean {
  return getRuntimeEnv(name) === value;
}
