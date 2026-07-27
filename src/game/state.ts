import type { Level } from "../types";

/**
 * Sequential level progression with local persistence.
 * No accounts, no backend, no daily/timezone logic (per PRD §4) — just a
 * current level number + best scores stored in localStorage.
 */

const KEY = "Lexora.progress.v1";

export interface Progress {
  current: number;                 // 1-indexed level the player is on
  cleared: number[];               // level numbers completed
  best: Record<number, number>;    // levelNumber -> best score
  bonusFound: Record<number, string[]>; // levelNumber -> bonus words discovered
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch { /* ignore */ }
  return { current: 1, cleared: [], best: {}, bonusFound: {} };
}

export function saveProgress(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function markCleared(p: Progress, level: Level, score: number, bonus: string[]): Progress {
  const n = level.levelNumber;
  if (!p.cleared.includes(n)) p.cleared.push(n);
  p.best[n] = Math.max(p.best[n] ?? 0, score);
  p.bonusFound[n] = Array.from(new Set([...(p.bonusFound[n] ?? []), ...bonus]));
  p.current = Math.max(p.current, n + 1);
  saveProgress(p);
  return p;
}

export async function loadLevelPack(url = "/level-pack.json"): Promise<Level[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`level pack ${res.status}`);
  return (await res.json()) as Level[];
}
