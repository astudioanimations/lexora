//
// Lexora — Daily rotating background.
//
// Picks one of several scenic backgrounds based on the LOCAL calendar day,
// so the image is a stable "surprise of the day" (same all day, changes at
// local midnight — for you that's midnight AEST). Purely client-side; no
// backend required.
//
// HOW TO USE
//   1. Save as:  src/ui/daily-bg.ts
//   2. Put images in public/ named:  bg-0.webp, bg-1.webp, ... up to bg-(N-1).webp
//   3. Set BG_COUNT below to how many you have.
//   4. In src/main.ts, import + call it as early as possible:
//        import { applyDailyBackground } from "./ui/daily-bg";
//        applyDailyBackground();        // top level, before boot()
//   5. theme.css references the CSS variable with a fallback:
//        background-image: linear-gradient(...wash...), var(--lx-bg, url("/bg-0.webp"));
//   6. vite.config.ts workbox globPatterns must include the webp extension so
//      the images are precached for offline use.
//
// OPTIONAL: pass a seed (e.g. a user id / signup-day) once accounts exist so
// different players get different rotations:  applyDailyBackground(seed)
//

const BG_COUNT = 13; // number of bg-N.webp files in public/
const BG_EXT = "webp"; // change to "png" if you keep PNGs

/** Whole-day number based on the user's LOCAL date (not UTC). */
function localDayIndex(d = new Date()): number {
  const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(localMidnight.getTime() / 86_400_000);
}

/** Deterministically choose today's background index. */
export function todaysBackgroundIndex(seed = 0, count = BG_COUNT): number {
  const raw = localDayIndex() + seed;
  return ((raw % count) + count) % count; // safe positive modulo
}

/** Apply today's background by setting the --lx-bg CSS variable. */
export function applyDailyBackground(seed = 0, count = BG_COUNT): number {
  const idx = todaysBackgroundIndex(seed, count);
  document.documentElement.style.setProperty("--lx-bg", `url("/bg-${idx}.${BG_EXT}")`);
  return idx;
}
