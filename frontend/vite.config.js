import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { preparePdfAssets } from "./scripts/pdfAssets.mjs";
import { APP_VERSION } from "./src/utils/version.js";

await preparePdfAssets();

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local") },
  // The shared PDF utility lives in backend/src; use this app's pdf-lib copy.
  resolve: { dedupe: ["pdf-lib"] },
  plugins: [
    react(),
    {
      name: "utilityhub-release",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "release.json", source: JSON.stringify({ version: APP_VERSION, build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local", files: "client-only" }) });
      },
    },
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectRegister: false,
      registerType: "prompt",
      manifest: false,
      includeAssets: [
        "favicon.svg",
        "theme.js",
        "manifest.webmanifest",
        "icons/*.png",
        "icons/icon.svg",
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,ttf,webmanifest,pfb,bcmap,wasm,bin}"],
        globIgnores: ["notification-sw.js"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
});
