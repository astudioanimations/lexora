/**
 * Lexora — H5 Games Ads rewarded provider (web-native).
 * Save as:  src/ads/h5-provider.ts
 *
 * Implements the SAME RewardedProvider interface as the mock and AdMob provider,
 * so it slots into ads.ts with zero game-code changes. This is the provider that
 * actually serves rewarded ads inside the TWA (and in-browser), because AdMob's
 * native SDK cannot render in a Trusted Web Activity.
 *
 * It wraps showRewarded() from ./h5 (Google's Ad Placement API). The opt-in
 * confirm sheet is already handled by ads.ts BEFORE show() is called, so here we
 * just play the ad and report whether the reward was earned.
 */
import type { RewardedProvider } from "./ads";
import { showRewarded, h5Ready } from "./h5";

export class WebRewardedProvider implements RewardedProvider {
  /** Available whenever the AdSense H5 script is present on the page. */
  static isAvailable(): boolean {
    return typeof window !== "undefined" && Array.isArray(window.adsbygoogle);
  }

  preload(): void {
    // The H5 API preloads via preloadAdBreaks:"on" (set in initH5Ads); no-op here.
  }

  async show(): Promise<boolean> {
    // Resolves true if the reward was earned, false if skipped/unavailable.
    // (h5.showRewarded has its own safety timeout so this can never hang.)
    return showRewarded();
  }

  /** Optional helper if you ever want to gate UI on readiness. */
  static ready(): boolean {
    return h5Ready();
  }
}
