import { z } from "zod";

// The only reader of process.env. Parsed once at import; boot fails naming every bad variable.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017"),
  MONGODB_DB: z.string().min(1).default("nexus"),
  TICK_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  CHANGE_RATIO: z.coerce.number().gt(0).max(1).default(0.1),
  FLUSH_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
  STALE_AFTER_MS: z.coerce.number().int().positive().default(10_000),
  OFFLINE_AFTER_MS: z.coerce.number().int().positive().default(30_000),
  SIM_SEED: z.coerce.number().int().default(42),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  if (parsed.data.STALE_AFTER_MS >= parsed.data.OFFLINE_AFTER_MS) {
    throw new Error("Invalid environment:\n  STALE_AFTER_MS must be smaller than OFFLINE_AFTER_MS");
  }
  return parsed.data;
}

export const env: Env = loadEnv(process.env);
