import path from "node:path"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 5173,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the heavy, rarely-changing libraries in their own chunks.
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "charts"
          if (id.includes("node_modules/jspdf")) return "pdf"
          return undefined
        },
      },
    },
  },
})
