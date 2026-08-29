import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Proxies /api to the local Worker during `vite dev`, mirroring how Pages
// routes /api to the Worker in production (see docs/architecture.md).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
})
