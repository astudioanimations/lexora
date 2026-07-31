/**
 * Cloudflare Pages Functions environment bindings for Lexora.
 * These are provided at runtime by Cloudflare (D1, KV) and by secrets.
 */
export interface Env {
  // Bindings (configured in wrangler.toml / Pages dashboard)
  DB: D1Database;          // D1 database binding
  AUTH_KV: KVNamespace;    // KV namespace for session caching

  // Secrets (set via `wrangler pages secret put` or the dashboard)
  BETTER_AUTH_SECRET: string;   // long random string
  BETTER_AUTH_URL: string;      // https://lexora.wordhaus.app
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;          // e.g. "Lexora <noreply@wordhaus.app>"
}
