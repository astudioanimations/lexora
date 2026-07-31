/**
 * Cloud score / progress sync for Lexora.
 *
 *   GET  /api/progress   -> returns the signed-in user's saved progress (or null)
 *   POST /api/progress   -> upserts progress; keeps the HIGHER score to avoid
 *                           clobbering a device that was ahead (offline play).
 *
 * Requires a valid Better Auth session; otherwise 401.
 * File path MUST be:  functions/api/progress.ts
 */
import { createAuth } from "../_lib/auth";
import type { Env } from "../_lib/env";

interface ProgressBody {
  score?: number;
  currentLevel?: number;
  bonusWords?: string[];
}

async function requireUser(context: EventContext<Env, string, unknown>) {
  const auth = createAuth(context.env);
  const session = await auth.api.getSession({ headers: context.request.headers });
  return session?.user ?? null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await requireUser(context);
  if (!user) return json({ error: "unauthorized" }, 401);

  const row = await context.env.DB
    .prepare("SELECT score, current_level, bonus_words, updated_at FROM progress WHERE user_id = ?")
    .bind(user.id)
    .first<{ score: number; current_level: number; bonus_words: string; updated_at: number }>();

  if (!row) return json({ progress: null });

  return json({
    progress: {
      score: row.score,
      currentLevel: row.current_level,
      bonusWords: safeParse(row.bonus_words),
      updatedAt: row.updated_at,
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = await requireUser(context);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: ProgressBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "bad-json" }, 400);
  }

  const incomingScore = Math.max(0, Math.floor(Number(body.score ?? 0)));
  const incomingLevel = Math.max(1, Math.floor(Number(body.currentLevel ?? 1)));
  const bonus = JSON.stringify(Array.isArray(body.bonusWords) ? body.bonusWords : []);
  const now = Date.now();

  // Upsert, keeping the higher score + higher level (merge-safe across devices).
  await context.env.DB
    .prepare(
      `INSERT INTO progress (user_id, score, current_level, bonus_words, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET
         score         = MAX(progress.score, excluded.score),
         current_level = MAX(progress.current_level, excluded.current_level),
         bonus_words   = excluded.bonus_words,
         updated_at    = excluded.updated_at`
    )
    .bind(user.id, incomingScore, incomingLevel, bonus, now)
    .run();

  const row = await context.env.DB
    .prepare("SELECT score, current_level FROM progress WHERE user_id = ?")
    .bind(user.id)
    .first<{ score: number; current_level: number }>();

  return json({ ok: true, score: row?.score ?? incomingScore, currentLevel: row?.current_level ?? incomingLevel });
};

// ---- helpers ----
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function safeParse(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
