/**
 * Lexora — Themed Chapters.
 * Save as:  src/game/chapters.ts
 *
 * 300 levels are grouped into 15 chapters of 20 levels each. Each chapter has a
 * name, emoji, and a signature hero background (public/chapter-N.webp). The
 * background is now driven by the CURRENT CHAPTER (this replaces the old
 * date-based daily rotation in daily-bg.ts).
 */

export interface Chapter {
  index: number;   // 1..15
  name: string;
  emoji: string;
  from: number;    // first level (inclusive)
  to: number;      // last level (inclusive)
  bg: string;      // background image path
}

export const CHAPTERS: Chapter[] = [
  { index: 1,  name: "Dawn",          emoji: "🌅", from: 1,   to: 20,  bg: "/chapter-1.webp"  },
  { index: 2,  name: "Meadow",        emoji: "🌿", from: 21,  to: 40,  bg: "/chapter-2.webp"  },
  { index: 3,  name: "Dusk",          emoji: "🌆", from: 41,  to: 60,  bg: "/chapter-3.webp"  },
  { index: 4,  name: "Misty Morning", emoji: "🌫️", from: 61,  to: 80,  bg: "/chapter-4.webp"  },
  { index: 5,  name: "Autumn",        emoji: "🍂", from: 81,  to: 100, bg: "/chapter-5.webp"  },
  { index: 6,  name: "Coastal",       emoji: "🌊", from: 101, to: 120, bg: "/chapter-6.webp"  },
  { index: 7,  name: "Forest",        emoji: "🌲", from: 121, to: 140, bg: "/chapter-7.webp"  },
  { index: 8,  name: "Desert",        emoji: "🏜️", from: 141, to: 160, bg: "/chapter-8.webp"  },
  { index: 9,  name: "Lakeside",      emoji: "🏞️", from: 161, to: 180, bg: "/chapter-9.webp"  },
  { index: 10, name: "Twilight",      emoji: "🌇", from: 181, to: 200, bg: "/chapter-10.webp" },
  { index: 11, name: "Winter",        emoji: "❄️", from: 201, to: 220, bg: "/chapter-11.webp" },
  { index: 12, name: "Rainfall",      emoji: "🌧️", from: 221, to: 240, bg: "/chapter-12.webp" },
  { index: 13, name: "Starfield",     emoji: "✨", from: 241, to: 260, bg: "/chapter-13.webp" },
  { index: 14, name: "Nebula",        emoji: "🌌", from: 261, to: 280, bg: "/chapter-14.webp" },
  { index: 15, name: "Aurora",        emoji: "🌠", from: 281, to: 300, bg: "/chapter-15.webp" },
];

/** The chapter a given level number belongs to (clamped to valid range). */
export function chapterFor(level: number): Chapter {
  return CHAPTERS.find((c) => level >= c.from && level <= c.to) ?? CHAPTERS[CHAPTERS.length - 1];
}

/** True if this level is the LAST level of its chapter (e.g. 20, 40, 60...). */
export function isChapterEnd(level: number): boolean {
  return CHAPTERS.some((c) => c.to === level);
}

/** Apply the current chapter's hero background by setting the --lx-bg CSS var. */
export function applyChapterBackground(level: number): void {
  const ch = chapterFor(level);
  document.documentElement.style.setProperty("--lx-bg", `url("${ch.bg}")`);
}
