/**
 * Delete the signed-in user's account + cloud progress.
 * Needed for Google Play "data safety" / account-deletion compliance.
 *
 * File path MUST be:  functions/api/account/delete.ts
 *   POST /api/account/delete
 */
import { createAuth } from "../../_lib/auth";
import type { Env } from "../../_lib/env";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = createAuth(context.env);
  const session = await auth.api.getSession({ headers: context.request.headers });
  const user = session?.user;
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  // Remove game progress first (our table), then auth records.
  await context.env.DB.prepare("DELETE FROM progress WHERE user_id = ?").bind(user.id).run();
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM session WHERE userId = ?").bind(user.id),
    context.env.DB.prepare("DELETE FROM account WHERE userId = ?").bind(user.id),
    context.env.DB.prepare("DELETE FROM \"user\"  WHERE id = ?").bind(user.id),
  ]);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
