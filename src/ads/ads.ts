/**
 * Lexora — decoupled rewarded-ad layer.
 * Save as:  src/ads/ads.ts
 *
 * ARCHITECTURE (deliberate): the game NEVER calls an ad SDK directly. Game code
 * calls `offerRewardedTopUp(...)` with an intent; this layer decides whether to
 * show an ad, plays it, and only then delivers the reward via a callback. This
 * keeps ad logic OUT of the core game loop, so retention is unaffected and you
 * can swap the ad provider without touching gameplay.
 *
 * SWAPPING PROVIDERS LATER:
 *   - Web / PWA:      implement WebRewardedProvider around AppLixir (or similar).
 *   - Android / TWA:  bridge to AdMob rewarded via a small JS interface.
 *   Only `RewardedProvider.show()` changes — the game code stays identical.
 */

/* ------------------------------------------------------------------ */
/* Provider interface — the single seam to a real SDK                  */
/* ------------------------------------------------------------------ */
export interface RewardedProvider {
  /** Preload if the SDK supports it (optional). */
  preload?(): void;
  /**
   * Show a rewarded ad. Resolve TRUE only if the user watched to completion
   * (reward earned). Resolve FALSE if skipped/closed early, and reject/throw
   * if no ad was available or an error occurred.
   */
  show(): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/* MOCK provider — lets everything work today, before any SDK          */
/* ------------------------------------------------------------------ */
class MockRewardedProvider implements RewardedProvider {
  show(): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "ad-mock";
      overlay.innerHTML = `
        <div class="ad-mock-card">
          <div class="ad-mock-tag">Ad</div>
          <p class="ad-mock-title">Rewarded video (demo)</p>
          <p class="ad-mock-count">Reward in <span id="ad-mock-n">3</span>s…</p>
          <button class="ad-mock-skip" id="ad-mock-skip" type="button">Skip</button>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));

      let n = 3;
      const label = overlay.querySelector("#ad-mock-n") as HTMLElement;
      const tick = window.setInterval(() => {
        n -= 1;
        if (label) label.textContent = String(n);
        if (n <= 0) { clearInterval(tick); done(true); }
      }, 1000);

      overlay.querySelector("#ad-mock-skip")?.addEventListener("click", () => {
        clearInterval(tick); done(false);
      });

      function done(watched: boolean) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
        resolve(watched);
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Ad manager — the only thing the game talks to                       */
/* ------------------------------------------------------------------ */
const LS_REMOVE_ADS = "lexora.removeAds";

let provider: RewardedProvider = new MockRewardedProvider();

/** Swap in a real provider at boot (AdMob/AppLixir) when you have one. */
export function setRewardedProvider(p: RewardedProvider) {
  provider = p;
  provider.preload?.();
}

/** True if the player bought "Remove Ads" (rewarded ads still allowed). */
export function hasRemoveAds(): boolean {
  return localStorage.getItem(LS_REMOVE_ADS) === "1";
}
export function setRemoveAds(on: boolean) {
  localStorage.setItem(LS_REMOVE_ADS, on ? "1" : "0");
}

export interface TopUpOptions {
  reward: number;                       // points to grant on completion
  onReward: (points: number) => void;   // deliver the reward (calls award())
  onDismiss?: () => void;               // user declined or ad unavailable
  reason?: string;                      // e.g. "not enough points for a hint"
  toast?: (msg: string, ms?: number) => void; // reuse the game's toast
}

/**
 * Offer the player a rewarded ad in exchange for points. Shows a confirm sheet
 * first (opt-in is what makes rewarded ads player-friendly and high-eCPM), then
 * plays the ad and delivers the reward only on completion.
 */
export async function offerRewardedTopUp(opts: TopUpOptions): Promise<void> {
  const confirmed = await confirmSheet(opts.reward, opts.reason);
  if (!confirmed) { opts.onDismiss?.(); return; }

  try {
    const watched = await provider.show();
    if (watched) {
      opts.onReward(opts.reward);
      opts.toast?.(`+${opts.reward} points!`);
    } else {
      opts.toast?.("No reward — video not finished");
      opts.onDismiss?.();
    }
  } catch {
    opts.toast?.("No ad available right now");
    opts.onDismiss?.();
  }
}

/* ------------------------------------------------------------------ */
/* Opt-in confirm sheet                                                */
/* ------------------------------------------------------------------ */
function confirmSheet(reward: number, reason?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sheet = document.createElement("div");
    sheet.className = "ad-offer";
    sheet.innerHTML = `
      <div class="ad-offer-card">
        <div class="ad-offer-icon">▶</div>
        <p class="ad-offer-title">Watch a short video?</p>
        <p class="ad-offer-note">${reason ? reason + " — " : ""}earn <strong>+${reward} points</strong>.</p>
        <button class="ad-offer-btn ad-offer-go" id="ad-go" type="button">Watch &amp; earn +${reward}</button>
        <button class="ad-offer-btn ad-offer-no" id="ad-no" type="button">No thanks</button>
      </div>`;
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("show"));

    const close = (v: boolean) => {
      sheet.classList.remove("show");
      setTimeout(() => sheet.remove(), 200);
      resolve(v);
    };
    sheet.querySelector("#ad-go")?.addEventListener("click", () => close(true));
    sheet.querySelector("#ad-no")?.addEventListener("click", () => close(false));
    sheet.addEventListener("click", (e) => { if (e.target === sheet) close(false); });
  });
}
