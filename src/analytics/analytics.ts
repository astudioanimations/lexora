/**
 * Lexora — Google Analytics 4 (gtag) wrapper.
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
 * PRIVACY: GA4 collects usage + a pseudonymous client ID. You must disclose this
 * in your privacy policy and the Play Data safety form (same as the ad SDK).
 * For EEA/UK traffic, gate this behind Google Consent Mode (see note at bottom).
 *
 * SETUP:
 *   1. index.html: add the gtag <script> in <head> (see repo change).
 *   2. main.ts: call initAnalytics() once at boot.
 *   3. Sprinkle the track* helpers at the meaningful moments.
 */

/** Your GA4 Measurement ID, e.g. "G-XXXXXXXXXX". Replace after creating a GA4 property. */
export const GA_MEASUREMENT_ID = "G-GXQVXQSML5";

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
    // The <script> in index.html already ran gtag('js', ...) + gtag('config', ...).
    // We just confirm SPA-friendly manual page_view control here if needed.
    if (GA_DEBUG) console.info("[ga] analytics ready:", GA_MEASUREMENT_ID);
  });
}

/**
 * Fire a custom GA4 event. Prefer the named helpers below, but this is exposed
 * for anything ad-hoc. Params must be flat (string | number | boolean).
 */
export function track(
  event: string,
  params: Record<string, string | number | boolean> = {}
): void {
  safe(() => {
    if (!gtagReady()) return;
    window.gtag("event", event, params);
    if (GA_DEBUG) console.info("[ga] event:", event, params);
  });
}

// ---- Named helpers for Lexora's key moments -------------------------------

/** Player entered a level (start of a round). */
export function trackLevelStart(levelNumber: number, chapter: string): void {
  // "level_start" is a GA4 recommended game event.
  track("level_start", { level: levelNumber, chapter });
}

/** Player completed a level. Include points + bonus for funnel analysis. */
export function trackLevelComplete(
  levelNumber: number,
  points: number,
  bonusFound: number
): void {
  // "level_end" is the GA4 recommended pair for level_start.
  track("level_end", {
    level: levelNumber,
    points,
    bonus_found: bonusFound,
    success: true,
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

// ---------------------------------------------------------------------------
// index.html — add this to <head> ONCE, BEFORE your module script.
// Replace G-XXXXXXXXXX with your real Measurement ID.
// ---------------------------------------------------------------------------
//
// <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
// <script>
//   window.dataLayer = window.dataLayer || [];
//   function gtag(){ dataLayer.push(arguments); }
//   gtag('js', new Date());
//   gtag('config', 'G-XXXXXXXXXX', { send_page_view: true });
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
