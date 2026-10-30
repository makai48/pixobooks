
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Local dev and production use the root path.
const buildId = new Date()
  .toISOString()
  .slice(0, 16)
  .replace(/[-:T]/g, (m) => (m === "T" ? "-" : ""));

export default defineConfig({
  base: "/",

  // Build stamp shown in the sidebar footer so any screen can be matched
  // to the exact bundle it runs (stale-PWA diagnosis).
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },

  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Prevent duplicate React copies.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },

  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react-router-dom",
      "@tanstack/react-query",
    ],
  },

  server: {
    host: "::",
    port: 8080,
  },

  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: [
            "react",
            "react-dom",
            "react-router-dom",
            "@tanstack/react-query",
          ],
          pdf: ["jspdf"],
        },
      },
    },
  },
});
