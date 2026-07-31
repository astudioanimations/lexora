/**
 * Better Auth browser client for Lexora.
 * Save as:  src/auth/client.ts
 */
import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // Same-origin: the Pages Functions live under /api/auth on this domain.
  baseURL: window.location.origin,
  plugins: [magicLinkClient()],
});

export type Session = typeof authClient.$Infer.Session;
