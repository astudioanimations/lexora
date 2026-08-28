/**
 * Lexora — Google Analytics 4 (gtag) wrapper.  [v2 — WordHaus telemetry]
 * Save as:  src/analytics/analytics.ts
 *
 * ARCHITECTURE (matches ads.ts): the game NEVER calls gtag directly. It calls
 * the small typed helpers here (trackLevelStart, trackLevelComplete, ...). This
 * keeps analytics out of the game loop and lets you swap/disable it in one place.
 *
 * DEFENSIVE: every call is wrapped so a blocked gtag (ad blocker, offline PWA,
 * or the script simply not loaded) can NEVER crash gameplay. If GA isn't present
 * the events are silently dropped.
 *
 * PORTFOLIO: every event automatically carries { game: "lexora" }. When Tessera
 * (and future games) send the same taxonomy with their own GAME_ID, you can
 * analyse the whole WordHaus ecosystem — cross-play, shared retention, etc. —
 * in ONE GA4 property. Register "game" as a custom dimension in GA4 Admin.
 *
 * PRIVACY: GA4 collects usage + a pseudonymous client ID. Disclose this in your
 * privacy policy and the Play Data-safety form. For EEA/UK traffic, gate this
 * behind Google Consent Mode (see note at bottom).
 *
 * SETUP:
 *   1. index.html: add the gtag <script> in <head> (already done).
 *   2. main.ts: call initAnalytics() once at boot.
 *   3. Sprinkle the track* helpers at the meaningful moments.
 */

/** Your GA4 Measurement ID, e.g. "G-XXXXXXXXXX". */
export const GA_MEASUREMENT_ID = "G-GXQVXQSML5";

/** Which game this build is. Tessera etc. would set their own value. */
export const GAME_ID = "lexora";

/** Flip to true while developing if you want console logs of every event. */
export const GA_DEBUG = false;

// --------------------------- gtag typings ---------------------------------

type GtagCommand = "js" | "config" | "event" | "set" | "consent";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (command: GtagCommand, ...args: unknown[]) => void;
  }
}

// --------------------------- internal state -------------------------------

let initialised = false;

/** Never let analytics throw into the game. */
function safe(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (GA_DEBUG) console.warn("[ga] suppressed:", err);
  }
}

/** True only when the gtag script has actually loaded. */
function gtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

// ------------------------------ public API --------------------------------

/**
 * Call ONCE at boot (e.g. in the DOMContentLoaded handler in main.ts).
 * Safe to call even if the gtag script hasn't loaded yet — the inline snippet
 * in index.html queues commands on window.dataLayer until it does.
 */
export function initAnalytics(): void {
  if (initialised) return;
  initialised = true;
  safe(() => {
    if (!gtagReady()) return;
    if (GA_DEBUG) console.info("[ga] analytics ready:", GA_MEASUREMENT_ID, "game:", GAME_ID);
  });
}

/**
 * Fire a custom GA4 event. Prefer the named helpers below, but this is exposed
 * for anything ad-hoc. Params must be flat (string | number | boolean).
 * Every event automatically carries { game: GAME_ID } for portfolio analysis.
 */
export function track(
  event: string,
  params: Record<string, string | number | boolean> = {}
): void {
  safe(() => {
    if (!gtagReady()) return;
    window.gtag("event", event, { game: GAME_ID, ...params });
    if (GA_DEBUG) console.info("[ga] event:", event, { game: GAME_ID, ...params });
  });
}

// ---- Named helpers for Lexora's key moments -------------------------------

/** Player entered a level (start of a round). */
export function trackLevelStart(levelNumber: number, chapter: string): void {
  // "level_start" is a GA4 recommended game event.
  track("level_start", { level: levelNumber, chapter });
}

/**
 * Player completed a level. Include points + bonus + duration for funnel and
 * difficulty analysis. durationSec is optional (backward compatible).
 */
export function trackLevelComplete(
  levelNumber: number,
  points: number,
  bonusFound: number,
  durationSec?: number
): void {
  const params: Record<string, string | number | boolean> = {
    level: levelNumber,
    points,
    bonus_found: bonusFound,
    success: true,
  };
  if (typeof durationSec === "number") params.duration_sec = durationSec;
  // "level_end" is the GA4 recommended pair for level_start.
  track("level_end", params);
}

/**
 * Player LEFT a level without completing it. This is the single most valuable
 * signal for finding difficulty walls: compare abandons vs starts per level.
 *
 * `reason` distinguishes how they left:
 *   - "switch"      : navigated to another level in-app (map/chapter jump)
 *   - "app_hidden"  : backgrounded/closed the app mid-level (likely session end)
 *
 * NOTE: because we can't see the future, a player who backgrounds mid-level and
 * later returns to finish can produce BOTH a level_abandon (app_hidden) AND a
 * level_end. Analyse "abandon RATE" (abandons / starts) directionally — a spike
 * at a specific level still clearly reveals the difficulty wall.
 */
export function trackLevelAbandon(
  levelNumber: number,
  chapter: string,
  progressPercent: number,
  durationSec: number,
  reason: "switch" | "app_hidden" | string = "switch"
): void {
  track("level_abandon", {
    level: levelNumber,
    chapter,
    progress_percent: progressPercent,
    duration_sec: durationSec,
    reason,
  });
}

/** A whole chapter was finished (your chapter-bonus moment). */
export function trackChapterComplete(chapter: string, levelNumber: number): void {
  track("chapter_complete", { chapter, level: levelNumber });
}

/** Player spent points on a hint. */
export function trackHintUsed(levelNumber: number, cost: number): void {
  track("hint_used", { level: levelNumber, cost });
}

/** Player shuffled the wheel (engagement / possible "stuck" signal). */
export function trackShuffle(levelNumber: number): void {
  track("shuffle_used", { level: levelNumber });
}

/** Player found a bonus (non-grid) word — deep-engagement signal. */
export function trackBonusWord(levelNumber: number, word: string, totalFound: number): void {
  track("bonus_word_found", {
    level: levelNumber,
    word_length: word.length,
    total_found: totalFound,
  });
}

/**
 * Ad lifecycle — pair with your ads layer.
 * `format`: "interstitial" | "rewarded". `outcome`: "shown" | "rewarded" | "skipped".
 */
export function trackAd(
  format: "interstitial" | "rewarded",
  outcome: "shown" | "rewarded" | "skipped",
  placement: string
): void {
  track("ad_event", { ad_format: format, outcome, placement });
}

/** Daily gift / welcome seed granted. */
export function trackReward(kind: "daily" | "welcome", amount: number): void {
  track("reward_granted", { kind, amount });
}

// ---- Portfolio / cross-play (WordHaus ecosystem) --------------------------

/** The "More Games" sheet was opened. */
export function trackMoreGamesOpen(): void {
  track("more_games_open", {});
}

/** A game was chosen from the "More Games" sheet (Lexora → target). */
export function trackMoreGamesSelect(targetGame: string): void {
  track("more_games_select", { source_game: GAME_ID, target_game: targetGame });
}

/**
 * Call ONCE at boot if this build was opened via a cross-promo link
 * (e.g. Tessera would call this when arriving with ?from=lexora). Left here so
 * every WordHaus game shares the same taxonomy.
 */
export function trackCrossPromoArrival(sourceGame: string): void {
  track("cross_promo_arrival", { source_game: sourceGame, target_game: GAME_ID });
}

// ---------------------------------------------------------------------------
// index.html — add this to <head> ONCE, BEFORE your module script.
// (Already present in Lexora — shown here for reference.)
// ---------------------------------------------------------------------------
//
// <script async src="https://www.googletagmanager.com/gtag/js?id=G-GXQVXQSML5"></script>
// <script>
//   window.dataLayer = window.dataLayer || [];
//   function gtag(){ dataLayer.push(arguments); }
//   gtag('js', new Date());
//   gtag('config', 'G-GXQVXQSML5', { send_page_view: true });
// </script>
//
// ---------------------------------------------------------------------------
// EEA/UK CONSENT MODE (optional but recommended if you serve European users):
// add BEFORE the config line above so analytics/ads storage default to denied
// until the user consents via a CMP:
//
//   gtag('consent', 'default', {
//     ad_storage: 'denied',
//     analytics_storage: 'denied',
//     wait_for_update: 500
//   });
//
// then call gtag('consent','update',{...}) when the user accepts.
// ---------------------------------------------------------------------------
