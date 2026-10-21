import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Local dev serves at / (localhost:8080); production builds target /pixobooks/.
export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/pixobooks/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Prevent duplicate React copies (root cause of
    // `Cannot read properties of null (reading 'useState')`).
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
          vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          pdf: ["jspdf"],
        },
      },
    },
  },
}));
