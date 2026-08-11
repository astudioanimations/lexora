/**
 * Lexora — account button + cloud score sync.
 * Save as:  src/ui/account.ts
 *
 *  - Signed OUT: header shows a "Sign in" text pill.
 *  - Signed IN:  header shows the avatar initial; tapping shows the email.
 *  - Sheet has a Privacy link (both states) + Delete my data (signed in)
 *    + a "Buy me a coffee" support link (both states).
 *  - Reactive refresh (focus / visibility / retry) so the avatar updates
 *    without a hard refresh after the OAuth or magic-link callback.
 *  - Local-first: all works signed-out via localStorage; cloud is additive.
 */
import { authClient } from "../auth/client";

const LS_SCORE = "lexora.score";
const LS_LEVEL = "lexora.current";
const LS_BONUS = "lexora.bonusWords";
const LS_GIFT  = "lexora.lastGiftDay";
const PRIVACY_URL = "/privacy.html";
const COFFEE_URL = "https://buymeacoffee.com/astudioanimations";

type LocalProgress = { score: number; currentLevel: number; bonusWords: string[] };

let signedIn = false;
let hydrated = false;
let onCloud: ((p: LocalProgress) => void) | undefined;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
export async function initAccountUI(onCloudProgress?: (p: LocalProgress) => void) {
  onCloud = onCloudProgress;
  ensureButton();
  await refreshAccount();

  window.addEventListener("focus", () => { void refreshAccount(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshAccount();
  });

  if (!signedIn) {
    for (const delay of [400, 1200, 2500]) {
      await wait(delay);
      await refreshAccount();
      if (signedIn) break;
    }
  }
}

let pushTimer = 0;
export function schedulePush(p: LocalProgress) {
  if (!signedIn) return;
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushProgress(p), 1200);
}

/* ------------------------------------------------------------------ */
/* Session refresh + cloud hydration                                   */
/* ------------------------------------------------------------------ */
async function refreshAccount() {
  const res = await authClient.getSession().catch(() => null);
  const user = res?.data?.user ?? null;
  signedIn = !!user;
  renderButton(user);

  if (signedIn && !hydrated) {
    hydrated = true;
    const cloud = await pullProgress();
    if (cloud) {
      const merged = mergeProgress(readLocal(), cloud);
      writeLocal(merged);
      onCloud?.(merged);
      void pushProgress(merged);
    } else {
      void pushProgress(readLocal());
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cloud calls                                                         */
/* ------------------------------------------------------------------ */
async function pullProgress(): Promise<LocalProgress | null> {
  try {
    const res = await fetch("/api/progress", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const { progress } = await res.json();
    if (!progress) return null;
    return {
      score: Number(progress.score) || 0,
      currentLevel: Number(progress.currentLevel) || 1,
      bonusWords: Array.isArray(progress.bonusWords) ? progress.bonusWords : [],
    };
  } catch { return null; }
}

async function pushProgress(p: LocalProgress) {
  try {
    await fetch("/api/progress", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
  } catch { /* offline — will resync next change */ }
}

/* ------------------------------------------------------------------ */
/* Local storage helpers                                               */
/* ------------------------------------------------------------------ */
function readLocal(): LocalProgress {
  return {
    score: Number(localStorage.getItem(LS_SCORE)) || 0,
    currentLevel: Number(localStorage.getItem(LS_LEVEL)) || 1,
    bonusWords: safeArr(localStorage.getItem(LS_BONUS)),
  };
}
function writeLocal(p: LocalProgress) {
  localStorage.setItem(LS_SCORE, String(p.score));
  localStorage.setItem(LS_LEVEL, String(p.currentLevel));
  localStorage.setItem(LS_BONUS, JSON.stringify(p.bonusWords));
}
function mergeProgress(a: LocalProgress, b: LocalProgress): LocalProgress {
  return {
    score: Math.max(a.score, b.score),
    currentLevel: Math.max(a.currentLevel, b.currentLevel),
    bonusWords: Array.from(new Set([...a.bonusWords, ...b.bonusWords])),
  };
}
function safeArr(s: string | null): string[] {
  try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */
function ensureButton() {
  if (document.getElementById("account-btn")) return;
  const btn = document.createElement("button");
  btn.id = "account-btn";
  btn.className = "account-btn";
  btn.type = "button";
  btn.textContent = "Sign in";
  btn.addEventListener("click", openSheet);
  const header = document.querySelector("header");
  header?.appendChild(btn);
}

function renderButton(user: { email?: string | null; name?: string | null; image?: string | null } | null) {
  const btn = document.getElementById("account-btn");
  if (!btn) return;
  if (user) {
    const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
    btn.textContent = initial;
    btn.classList.add("signed-in");
    btn.title = user.email || "Signed in";
  } else {
    btn.textContent = "Sign in";
    btn.classList.remove("signed-in");
    btn.title = "Sign in";
  }
}

function openSheet() {
  const existing = document.getElementById("account-sheet");
  if (existing) { existing.remove(); return; }

  const sheet = document.createElement("div");
  sheet.id = "account-sheet";
  sheet.className = "account-sheet";

  authClient.getSession().then((res) => {
    const user = res?.data?.user;
    sheet.innerHTML = user
      ? `
        <div class="acc-card">
          <div class="acc-icon">🔗</div>
          <p class="acc-title">Synced</p>
          <p class="acc-email">Signed in as <strong>${user.email ?? ""}</strong>.</p>
          <p class="acc-note">Your score syncs across your devices. ☁️</p>
          <button class="acc-btn acc-ghost" id="acc-signout">Sign out</button>
          <a class="acc-btn acc-coffee" href="${COFFEE_URL}" target="_blank" rel="noopener">☕ Buy me a coffee</a>
          <div class="acc-foot">
            <a class="acc-link" href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy</a>
            <button class="acc-link danger" id="acc-delete" type="button">Delete my data</button>
          </div>
        </div>`
      : `
        <div class="acc-card">
          <p class="acc-title">Save your progress</p>
          <p class="acc-note">Sign in to sync your score across devices.</p>
          <button class="acc-btn acc-google" id="acc-google">Continue with Google</button>
          <div class="acc-or">or</div>
          <input class="acc-input" id="acc-email" type="email" inputmode="email"
                 placeholder="you@example.com" autocomplete="email" />
          <button class="acc-btn acc-primary" id="acc-magic">Email me a sign-in link</button>
          <p class="acc-msg" id="acc-msg"></p>
          <a class="acc-btn acc-coffee" href="${COFFEE_URL}" target="_blank" rel="noopener">☕ Buy me a coffee</a>
          <div class="acc-foot center">
            <a class="acc-link" href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy</a>
          </div>
        </div>`;

    wireSheet(sheet, !!user);
  });

  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.remove(); });
  document.body.appendChild(sheet);
}

function wireSheet(sheet: HTMLElement, isUser: boolean) {
  if (isUser) {
    sheet.querySelector("#acc-signout")?.addEventListener("click", async () => {
      await authClient.signOut().catch(() => {});
      location.reload();
    });

    sheet.querySelector("#acc-delete")?.addEventListener("click", async () => {
      // NOTE: native confirm() is unreliable in installed PWAs (standalone mode)
      // — it can return false instantly, so the request never fires. Use an
      // in-app dialog instead.
      const ok = await confirmDialog(
        "Delete your account and cloud-saved progress? This cannot be undone."
      );
      if (!ok) return;

      try {
        const res = await fetch("/api/account/delete", { method: "POST", credentials: "include" });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data.ok) {
          notify("Couldn't delete: " + (data.error || res.status));
          return;
        }
        // Wipe local progress too so nothing lingers on this device.
        [LS_SCORE, LS_LEVEL, LS_BONUS, LS_GIFT].forEach((k) => localStorage.removeItem(k));
        await authClient.signOut().catch(() => {});
        location.reload();
      } catch {
        notify("Couldn't reach the server. Please try again.");
      }
    });
    return;
  }

  sheet.querySelector("#acc-google")?.addEventListener("click", async () => {
    await authClient.signIn.social({ provider: "google", callbackURL: "/" });
  });

  sheet.querySelector("#acc-magic")?.addEventListener("click", async () => {
    const email = (sheet.querySelector("#acc-email") as HTMLInputElement)?.value.trim();
    const msg = sheet.querySelector("#acc-msg") as HTMLElement;
    if (!email || !email.includes("@")) { if (msg) msg.textContent = "Enter a valid email."; return; }
    if (msg) msg.textContent = "Sending…";
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    if (msg) msg.textContent = error ? "Something went wrong — try again." : "Check your inbox ✉️";
  });
}

/* ------------------------------------------------------------------ */
/* In-app confirm + notify (native confirm/alert are unreliable in PWA)*/
/* ------------------------------------------------------------------ */
function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "account-sheet";        // reuse the dim backdrop styling
    wrap.style.zIndex = "70";
    wrap.innerHTML = `
      <div class="acc-card">
        <p class="acc-note" style="font-size:15px;margin-bottom:16px">${message}</p>
        <button class="acc-btn acc-danger" id="cf-yes" type="button">Delete</button>
        <button class="acc-btn acc-ghost"  id="cf-no"  type="button">Cancel</button>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v: boolean) => { wrap.remove(); resolve(v); };
    wrap.querySelector("#cf-yes")?.addEventListener("click", () => done(true));
    wrap.querySelector("#cf-no")?.addEventListener("click", () => done(false));
    wrap.addEventListener("click", (e) => { if (e.target === wrap) done(false); });
  });
}

function notify(text: string) {
  const t = document.createElement("div");
  t.className = "sw-toast info show";        // reuse toast styling if present
  t.style.zIndex = "90";
  t.innerHTML = `<span class="sw-toast-msg">${text}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
