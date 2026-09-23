// Tests use their own config: the Cloudflare plugin in vite.config.ts can't start under Vitest.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
});
