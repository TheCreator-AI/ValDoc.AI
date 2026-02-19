import { validateStartupConfig } from "../src/server/config/env";

try {
  validateStartupConfig(process.env, (line) => console.info(`[config] ${line}`));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown configuration error.";
  console.error(`[config] Startup configuration validation failed: ${message}`);
  process.exit(1);
}
