/**
 * Lexora — AdMob rewarded provider for the Android TWA.
 * Save as:  src/ads/admob-provider.ts
 *
 * Implements the same RewardedProvider interface as the mock, so swapping it in
 * requires ZERO changes to game code — just call setRewardedProvider(...) at boot.
 *
 * WHY A BRIDGE: a TWA is a Chrome shell around your PWA. The Google Mobile Ads
 * (AdMob) SDK is native Android, so JS can't call it directly. You expose a tiny
 * Android interface (via @JavascriptInterface) named `AndroidAds` that forwards
 * to AdMob's RewardedAd, and post the result back to `window`. If that bridge is
 * absent (e.g. plain browser, or the interface isn't injected), we fall back so
 * the game never breaks.
 *
 * NOTE (important): a PLAIN TWA does NOT inject this bridge — you'd have to build
 * a custom Kotlin wrapper for it. Until then, isAvailable() returns false and we
 * fall back to the H5 web provider (WebRewardedProvider), which DOES serve
 * rewarded ads inside a TWA. See installBestRewardedProvider() below.
 *
 * ---- ANDROID SIDE (put in your TWA wrapper, Kotlin, sketch) ----
 *   class AdsBridge(private val activity: Activity) {
 *     @JavascriptInterface fun showRewarded() {
 *       // load + show RewardedAd; on earned reward:
 *       activity.runOnUiThread {
 *         webView.evaluateJavascript("window.__onRewardResult(true)", null)
 *       }
 *       // on dismiss without reward: window.__onRewardResult(false)
 *       // on failed to load:         window.__onRewardResult('error')
 *     }
 *   }
 *   webView.addJavascriptInterface(AdsBridge(this), "AndroidAds")
 *   // AdMob unit id (test): ca-app-pub-3940256099942544/5224354917
 *   // Replace with your real rewarded unit id before release.
 * ----------------------------------------------------------------
 */
import type { RewardedProvider } from "./ads";

// The interface the Android TWA injects onto window.
interface AndroidAdsBridge {
  showRewarded(): void;
  preloadRewarded?(): void;
}
declare global {
  interface Window {
    AndroidAds?: AndroidAdsBridge;
    __onRewardResult?: (result: boolean | "error") => void;
  }
}

export class AdMobRewardedProvider implements RewardedProvider {
  /** True only inside the TWA where the native bridge was injected. */
  static isAvailable(): boolean {
    return typeof window !== "undefined" && !!window.AndroidAds;
  }

  preload(): void {
    try { window.AndroidAds?.preloadRewarded?.(); } catch { /* ignore */ }
  }

  show(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const bridge = window.AndroidAds;
      if (!bridge) { reject(new Error("AdMob bridge unavailable")); return; }

      // Safety timeout so a silent native failure can't hang the UI.
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Rewarded ad timed out"));
      }, 30_000);

      const cleanup = () => {
        clearTimeout(timeout);
        window.__onRewardResult = undefined;
      };

      // Android calls this back with the outcome.
      window.__onRewardResult = (result) => {
        cleanup();
        if (result === "error") reject(new Error("Rewarded ad failed to load"));
        else resolve(result === true);
      };

      try {
        bridge.showRewarded();
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error("showRewarded threw"));
      }
    });
  }
}

/**
 * Convenience: pick the BEST available rewarded provider at boot.
 *
 * Priority:
 *   1. AdMob native bridge  — only if you've built the Kotlin wrapper (highest eCPM).
 *   2. H5 web provider      — works inside a plain TWA and in-browser (your case now).
 *   3. Otherwise            — keep the existing provider (mock for local dev).
 *
 * Call once at boot (after initH5Ads):
 *   import { setRewardedProvider } from "./ads";
 *   import { installBestRewardedProvider } from "./ads/admob-provider";
 *   installBestRewardedProvider();
 */
import { setRewardedProvider } from "./ads";
import { WebRewardedProvider } from "./h5-provider";

export function installBestRewardedProvider(): void {
  if (AdMobRewardedProvider.isAvailable()) {
    setRewardedProvider(new AdMobRewardedProvider());
  } else if (WebRewardedProvider.isAvailable()) {
    setRewardedProvider(new WebRewardedProvider());
  }
  // else: keep the existing provider (mock during local dev without the script).
}
