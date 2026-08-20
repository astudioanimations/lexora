/**
 * Lexora — lightweight stats endpoint (retention insight).
 * File path:  functions/api/stats.ts   → GET /api/stats?key=YOUR_SECRET
 *
 * Reads ONLY your existing D1 `progress` table — no new tracking, no new data
 * collection, no privacy-policy impact. Answers the single most useful
 * question for a level-based game: "where are players in their journey / where
 * do they drop off?"
 *
 * PROTECTED: requires a secret key (query ?key= or header x-stats-key) so the
 * numbers aren't public. Set a Pages secret STATS_KEY (see SETUP below).
 *
 * SETUP:
 *   npx wrangler pages secret put STATS_KEY --project-name lexora
 *   (choose any long random string; you pass it as ?key=... when viewing)
 *
 * USAGE:
 *   https://lexora.wordhaus.app/api/stats?key=YOUR_SECRET
 */
import type { Env as BaseEnv } from "../_lib/env";

type Env = BaseEnv & { STATS_KEY?: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Chapter boundaries (mirror src/game/chapters.ts) for a per-chapter rollup.
const CHAPTERS = [
  { name: "Dawn", from: 1, to: 20 },   { name: "Meadow", from: 21, to: 40 },
  { name: "Dusk", from: 41, to: 60 },  { name: "Misty Morning", from: 61, to: 80 },
  { name: "Autumn", from: 81, to: 100 }, { name: "Coastal", from: 101, to: 120 },
  { name: "Forest", from: 121, to: 140 }, { name: "Desert", from: 141, to: 160 },
  { name: "Lakeside", from: 161, to: 180 }, { name: "Twilight", from: 181, to: 200 },
  { name: "Winter", from: 201, to: 220 }, { name: "Rainfall", from: 221, to: 240 },
  { name: "Starfield", from: 241, to: 260 }, { name: "Nebula", from: 261, to: 280 },
  { name: "Aurora", from: 281, to: 300 },
];

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // ---- auth ----
  const url = new URL(context.request.url);
  const provided = url.searchParams.get("key") || context.request.headers.get("x-stats-key") || "";
  const secret = context.env.STATS_KEY || "";
  if (!secret || provided !== secret) return json({ error: "unauthorized" }, 401);

  const db = context.env.DB;

  try {
    // Totals
    const totals = await db
      .prepare("SELECT COUNT(*) AS players, COALESCE(MAX(score),0) AS topScore, COALESCE(AVG(score),0) AS avgScore FROM progress")
      .first<{ players: number; topScore: number; avgScore: number }>();

    // Distribution of players by current_level (the drop-off funnel).
    const byLevelRows = await db
      .prepare("SELECT current_level AS level, COUNT(*) AS players FROM progress GROUP BY current_level ORDER BY current_level")
      .all<{ level: number; players: number }>();
    const byLevel = byLevelRows.results ?? [];

    // Roll levels up into chapters for a readable "where are players" view.
    const perChapter = CHAPTERS.map((ch) => {
      const players = byLevel
        .filter((r) => r.level >= ch.from && r.level <= ch.to)
        .reduce((s, r) => s + r.players, 0);
      return { chapter: ch.name, range: `${ch.from}-${ch.to}`, players };
    });

    // Simple activity: how many updated in the last 1 / 7 / 30 days.
    const now = Date.now();
    const since = (days: number) => now - days * 86_400_000;
    const active = await db
      .prepare(
        `SELECT
           SUM(CASE WHEN updated_at >= ?1 THEN 1 ELSE 0 END) AS d1,
           SUM(CASE WHEN updated_at >= ?2 THEN 1 ELSE 0 END) AS d7,
           SUM(CASE WHEN updated_at >= ?3 THEN 1 ELSE 0 END) AS d30
         FROM progress`
      )
      .bind(since(1), since(7), since(30))
      .first<{ d1: number; d7: number; d30: number }>();

    return json({
      generatedAt: new Date().toISOString(),
      totals: {
        players: totals?.players ?? 0,
        topScore: totals?.topScore ?? 0,
        avgScore: Math.round(totals?.avgScore ?? 0),
      },
      activePlayers: {
        last1day: active?.d1 ?? 0,
        last7days: active?.d7 ?? 0,
        last30days: active?.d30 ?? 0,
      },
      byChapter: perChapter,
      byLevel, // full granular distribution
    });
  } catch (e) {
    return json({ error: "query-failed", detail: String(e) }, 500);
  }
};
