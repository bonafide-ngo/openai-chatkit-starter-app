import * as path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const backendTarget = process.env.CHATKIT_API_BASE ?? "http://127.0.0.1:8000";
const authTarget = process.env.AUTH_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  // Allow env files to live one level above the frontend directory
  envDir: path.resolve(__dirname, ".."),
  plugins: [react()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/chatkit": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/health": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/api/auth": {
        target: authTarget,
        changeOrigin: true,
      },
    },
  },
});
