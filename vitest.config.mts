import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "supabase/tests/**/*.test.ts"],
    // Database tests share one connection and roll back; keep files in order.
    fileParallelism: false,
    passWithNoTests: true,
  },
});
