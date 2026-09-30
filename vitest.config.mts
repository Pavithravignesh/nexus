import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Simulator tests tick a 10,000-device fleet many times; allow for slow or busy machines.
    testTimeout: 20_000,
    // `src/server/env.ts` validates process.env at import time. These values let
    // server modules load in tests without a real .env; no test connects to Mongo.
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:27017",
      MONGODB_DB: "nexus_test",
      TICK_MS: "1000",
      LOG_LEVEL: "error",
    },
  },
});
