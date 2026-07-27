import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// PWA-first, offline-capable, $0 hosting on Cloudflare Pages.
// Reuses the proven Tessera shape (Vite + vanilla TS + vite-plugin-pwa).
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "level-pack.json", "dictionary.txt"],
      manifest: false, // we ship our own public/manifest.webmanifest
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,json,txt,webmanifest}"],
        // Level pack + dictionary are static; cache-first once fetched.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".json") || url.pathname.endsWith(".txt"),
            handler: "CacheFirst",
            options: { cacheName: "Lexora-content", expiration: { maxEntries: 8 } },
          },
        ],
      },
    }),
  ],
  build: { target: "es2020" },
});
