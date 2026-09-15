import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { env: { VITE_CLERK_PUBLISHABLE_KEY: "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk" }, environment: "jsdom", include: ["tests/**/*.test.tsx"] },
});
