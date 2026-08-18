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
        // NOTE: mp3 is intentionally NOT in globPatterns — the music file is
        // large (~4MB) and music defaults OFF, so we don't want every user to
        // download it on install. It's runtime-cached on first play instead.
        globPatterns: ["**/*.{js,css,html,png,webp,json,txt,webmanifest}"],
        // Never let the SW serve the cached app-shell for auth/API routes —
        // OAuth callbacks and session/progress calls must reach the server.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Level pack + dictionary are static; cache-first once fetched.
            urlPattern: ({ url }) => url.pathname.endsWith(".json") || url.pathname.endsWith(".txt"),
            handler: "CacheFirst",
            options: { cacheName: "Lexora-content", expiration: { maxEntries: 8 } },
          },
          {
            // Music: cache-first once the user actually plays it (not on install).
            urlPattern: ({ url }) => url.pathname.endsWith(".mp3"),
            handler: "CacheFirst",
            options: {
              cacheName: "Lexora-audio",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 60 },
              rangeRequests: true, // let the browser seek/stream the audio
            },
          },
        ],
      },
    }),
  ],
  build: { target: "es2020" },
});
