import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// PWA-first, offline-capable, $0 hosting on Cloudflare Pages.
// Reuses the proven Tessera shape (Vite + vanilla TS + vite-plugin-pwa).
export default defineConfig({
  plugins: [
    VitePWA({
      // "prompt": don't silently swap the SW — surface an in-app "Update"
      // toast (src/ui/sw-update.ts) so fresh content lands on one tap instead
      // of the old "stale until hard refresh" behaviour of autoUpdate.
      registerType: "prompt",
      includeAssets: ["icons/*.png", "level-pack.json", "dictionary.txt"],
      manifest: false, // we ship our own public/manifest.webmanifest
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webp,json,txt,webmanifest}"],
        // Never let the SW serve the cached app-shell for auth/API routes —
        // OAuth callbacks and session/progress calls must reach the server.
        navigateFallbackDenylist: [/^\/api\//],
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
