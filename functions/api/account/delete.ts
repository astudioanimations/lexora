/**
 * Delete the signed-in user's account + cloud progress.
 * File path MUST be:  functions/api/account/delete.ts   → POST /api/account/delete
 *
 * Returns explicit JSON so the client can show real success/failure feedback
 * instead of failing silently. Also revokes the Better Auth session (clears the
 * KV-cached session) so the user is genuinely signed out afterwards — deleting
 * only the D1 rows leaves the KV session cache alive and makes it look like
 * "nothing happened" on reload.
 */
import { createAuth } from "../../_lib/auth";
import type { Env } from "../../_lib/env";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = createAuth(context.env);

  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: context.request.headers });
    userId = session?.user?.id ?? null;
  } catch (e) {
    return json({ error: "session-lookup-failed", detail: String(e) }, 500);
  }

  if (!userId) return json({ error: "unauthorized" }, 401);

  // 1) Revoke the session first (clears KV cache + session cookie handling),
  //    so the user is really signed out even though we're about to delete rows.
  try {
    await auth.api.signOut({ headers: context.request.headers });
  } catch {
    /* non-fatal — continue with deletion */
  }

  // 2) Delete game progress (our table), then the Better Auth rows.
  try {
    await context.env.DB.prepare("DELETE FROM progress WHERE user_id = ?").bind(userId).run();
    await context.env.DB.batch([
      context.env.DB.prepare('DELETE FROM session      WHERE userId = ?').bind(userId),
      context.env.DB.prepare('DELETE FROM account      WHERE userId = ?').bind(userId),
      context.env.DB.prepare('DELETE FROM verification WHERE identifier IN (SELECT email FROM "user" WHERE id = ?)').bind(userId),
      context.env.DB.prepare('DELETE FROM "user"       WHERE id = ?').bind(userId),
    ]);
  } catch (e) {
    return json({ error: "delete-failed", detail: String(e) }, 500);
  }

  return json({ ok: true, deleted: userId });
};
