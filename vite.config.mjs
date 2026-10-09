import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // This workspace may live on a Windows mapped drive; native watchers are unreliable there.
  server: {
    watch: {
      usePolling: true,
      interval: 700,
      ignored: ["**/data/**", "**/.runtime/**", "**/test-results/**"],
    },
  },
  build: { outDir: "dist" },
});
