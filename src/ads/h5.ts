/**
 * src/ads/h5.ts
 * ------------------------------------------------------------------
 * Google H5 Games Ads (Ad Placement API) for Lexora — the web-native ad path
 * that ACTUALLY works inside your PWA and your TWA.
 *
 * Why this exists alongside ads/ads.ts + ads/admob-provider.ts:
 *   - admob-provider.ts targets AdMob, which cannot render inside a TWA
 *     (fullscreen Chrome, no native view layer). It silently no-ops there.
 *   - This module serves real interstitial + rewarded ads via AdSense H5,
 *     which runs in-browser AND in the TWA WebView from one code path.
 *
 * TEST MODE:
 *   The AdSense LOADER SCRIPT does NOT accept data-ad-test (it logs a warning
 *   and ignores it). For the Ad Placement API, test mode is set on the
 *   adConfig() call via adBreakTest:"on". Set H5_TEST_MODE = true to enable it.
 *   Note: even in test mode, ads generally won't render on localhost — deploy to
 *   the approved live domain to see real fills.
 *
 * Integration points:
 *   - index.html: add the AdSense H5 <script> in <head> (no data-ad-test).
 *   - main.ts: call initH5Ads() once, use showInterstitial() between levels.
 *   - rewarded: showRewarded() is wrapped by ads/h5-provider.ts as the provider.
 * ------------------------------------------------------------------
 */

/** Set true during development to request Google TEST ads (no real revenue). */
export const H5_TEST_MODE = true;

// ----------------------------- types --------------------------------------

type AdBreakType = "start" | "pause" | "next" | "browse" | "reward";

interface AdBreakPlacement {
  type: AdBreakType;
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
}

interface AdConfigCall {
  preloadAdBreaks?: "on" | "off";
  sound?: "on" | "off";
  /** "on" requests Google test ads for the Ad Placement API. */
  adBreakTest?: "on" | "off";
  onReady?: () => void;
}

declare global {
  interface Window {
    adsbygoogle: Array<AdBreakPlacement | AdConfigCall>;
  }
}

// --------------------------- internal state -------------------------------

window.adsbygoogle = window.adsbygoogle || [];

let ready = false;
let initialised = false;

const push = (o: AdBreakPlacement | AdConfigCall) => window.adsbygoogle.push(o);

/** Never let a missing/blocked AdSense script crash gameplay (offline PWA). */
function safe(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (H5_TEST_MODE) console.warn("[h5] suppressed:", err);
  }
}

// ------------------------------ public API --------------------------------

/**
 * Call ONCE at startup. Safe to call before the AdSense script has loaded.
 * @param hasSound pass your current music-toggle state (Lexora defaults off).
 */
export function initH5Ads(hasSound = false): void {
  if (initialised) return;
  initialised = true;
  safe(() => {
    const cfg: AdConfigCall = {
      preloadAdBreaks: "on",
      sound: hasSound ? "on" : "off",
      onReady: () => {
        ready = true;
        if (H5_TEST_MODE) console.info("[h5] Ad Placement API ready");
      },
    };
    // Request Google test ads while developing (correct place — NOT the tag).
    if (H5_TEST_MODE) cfg.adBreakTest = "on";
    push(cfg);
  });
}

export const h5Ready = (): boolean => ready;

/**
 * INTERSTITIAL at a natural break (between levels). `onDone` ALWAYS runs —
 * after the ad closes, or immediately if the frequency cap skipped the ad —
 * so it's safe to advance the game inside it.
 *
 * @param name    reporting label, e.g. "level_complete".
 * @param onDone  run AFTER the ad (or immediately if none shown). Advance here.
 * @param onPause optional: mute music / pause before the ad shows.
 * @param onResume optional: unmute / resume after the ad (runs before onDone).
 */
export function showInterstitial(
  name: string,
  onDone: () => void,
  onPause?: () => void,
  onResume?: () => void
): void {
  let advanced = false;
  const finish = () => {
    if (advanced) return;
    advanced = true;
    onResume?.();
    onDone();
  };

  // Fallback: if the script never loaded, still advance so the game isn't stuck.
  if (typeof window.adsbygoogle === "undefined") {
    finish();
    return;
  }

  safe(() =>
    push({
      type: "next",
      name,
      beforeAd: () => onPause?.(),
      afterAd: finish,
    })
  );

  // Extra safety net: if afterAd never fires (blocked SDK), advance shortly.
  window.setTimeout(finish, 4000);
}

/**
 * REWARDED ad. Resolves true if the reward was earned, false otherwise.
 * Wrapped by ads/h5-provider.ts (WebRewardedProvider) so your existing
 * offerRewardedTopUp() keeps its confirm-sheet/toast UI and just calls this.
 *
 * The caller (ads.ts) shows the "Watch for points?" sheet BEFORE this runs, so
 * here we show the ad immediately when one is available.
 */
export function showRewarded(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let earned = false;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(earned);
    };

    if (typeof window.adsbygoogle === "undefined") {
      done();
      return;
    }

    safe(() =>
      push({
        type: "reward",
        name: "rewarded",
        beforeReward: (showAdFn: () => void) => showAdFn(), // ad available → show now
        adViewed: () => { earned = true; },   // reward granted
        adDismissed: () => { earned = false; }, // skipped / unavailable
        afterAd: done,
      })
    );

    // Safety net if the SDK is blocked and never calls afterAd.
    window.setTimeout(done, 8000);
  });
}
