import { spawnSync } from "node:child_process";

// Publish the landing page and sample-data demo. Explicit overrides prevent
// Vite from pulling the local beta's Clerk key/API URL from .env.local.
const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_CLERK_PUBLISHABLE_KEY: "",
    VITE_API_URL: "",
    VITE_DEMO_MODE: "1",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
