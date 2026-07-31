/**
 * Catch-all handler for Better Auth.
 * Mounts every /api/auth/* route (sign-in, callbacks, session, sign-out, etc.)
 *
 * File path MUST be:  functions/api/auth/[[route]].ts
 * (the [[route]] double-bracket = Cloudflare Pages catch-all segment)
 */
import { createAuth } from "../../_lib/auth";
import type { Env } from "../../_lib/env";

export const onRequest: PagesFunction<Env> = async (context) => {
  const auth = createAuth(context.env);
  return auth.handler(context.request);
};
