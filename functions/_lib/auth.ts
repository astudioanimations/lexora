/**
 * Better Auth factory for Lexora, running on Cloudflare Pages Functions.
 *
 * - Database: Cloudflare D1 (SQLite) via Kysely D1 dialect.
 * - Session cache: Cloudflare KV (secondaryStorage) — big latency win.
 * - Providers: Google OAuth + email magic-link (delivered via Resend).
 *
 * A fresh instance is created per request (Pages Functions only expose env
 * bindings at request time). This is the recommended pattern — do NOT cache a
 * module-level singleton that also touches D1, which is known to cause hangs.
 */
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { D1Dialect } from "kysely-d1";
import { Resend } from "resend";
import type { Env } from "./env";

export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],

    // --- Primary DB: D1 ---
    database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },

    // --- Session cache: KV (get/set/delete) ---
    secondaryStorage: {
      get: (key) => env.AUTH_KV.get(key),
      set: (key, value, ttl) =>
        env.AUTH_KV.put(key, value, ttl ? { expirationTtl: ttl } : undefined),
      delete: (key) => env.AUTH_KV.delete(key),
    },

    // --- Google OAuth ---
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    // --- Email magic-link via Resend ---
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const resend = new Resend(env.RESEND_API_KEY);
          await resend.emails.send({
            from: env.RESEND_FROM,
            to: email,
            subject: "Your Lexora sign-in link",
            html: `
              <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
                          max-width:480px;margin:0 auto;padding:24px;color:#1B2A4A">
                <h1 style="color:#1B2A4A;margin:0 0 8px">Lexora</h1>
                <p style="color:#2C3F63;font-size:15px">Tap the button below to sign in.
                   This link expires shortly and can only be used once.</p>
                <p style="margin:24px 0">
                  <a href="${url}"
                     style="background:#E4A853;color:#0E1729;text-decoration:none;
                            font-weight:800;padding:12px 22px;border-radius:999px;
                            display:inline-block">Sign in to Lexora</a>
                </p>
                <p style="color:#8895ab;font-size:12px">
                   If you didn't request this, you can safely ignore this email.</p>
              </div>`,
          });
        },
      }),
    ],
  });
}
