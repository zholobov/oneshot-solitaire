import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
