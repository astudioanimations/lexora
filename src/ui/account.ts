/**
 * Lexora — account button + cloud score sync.
 * Save as:  src/ui/account.ts
 *
 * Responsibilities
 *  - Injects a state-aware account button into the header (☰ / avatar).
 *  - Opens a small sheet: Google sign-in + email magic-link, or sign-out.
 *  - On sign-in, PULLS cloud progress and merges with local (higher wins).
 *  - Exposes pushProgress() for main.ts to call (debounced) when score changes.
 *
 * Local-first: everything keeps working signed-out via localStorage. Cloud is
 * an additive layer, so offline play (PWA on a plane) is unaffected.
 */
import { authClient } from "../auth/client";

const LS_SCORE = "lexora.score";
const LS_LEVEL = "lexora.current";      // adjust if your key differs
const LS_BONUS = "lexora.bonusWords";   // optional

type LocalProgress = { score: number; currentLevel: number; bonusWords: string[] };

let signedIn = false;

/* ------------------------------------------------------------------ */
/* Public API used by main.ts                                          */
/* ------------------------------------------------------------------ */

/** Call once at startup. Renders the button and hydrates from cloud if signed in. */
export async function initAccountUI(onCloudProgress?: (p: LocalProgress) => void) {
  ensureButton();
  const { data } = await authClient.getSession();
  signedIn = !!data?.user;
  renderButton(data?.user ?? null);

  if (signedIn) {
    const cloud = await pullProgress();
    if (cloud) {
      const merged = mergeProgress(readLocal(), cloud);
      writeLocal(merged);
      onCloudProgress?.(merged);          // let main.ts refresh the UI
      // push the merged result back so both sides converge
      void pushProgress(merged);
    } else {
      // first login on this account → seed cloud with local
      void pushProgress(readLocal());
    }
  }
}

/** Debounced push of current progress to the cloud (no-op when signed out). */
let pushTimer = 0;
export function schedulePush(p: LocalProgress) {
  if (!signedIn) return;
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushProgress(p), 1200);
}

/* ------------------------------------------------------------------ */
/* Cloud calls                                                         */
/* ------------------------------------------------------------------ */
async function pullProgress(): Promise<LocalProgress | null> {
  try {
    const res = await fetch("/api/progress", { credentials: "include" });
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

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */
function ensureButton() {
  if (document.getElementById("account-btn")) return;
  const btn = document.createElement("button");
  btn.id = "account-btn";
  btn.className = "account-btn";
  btn.type = "button";
  btn.textContent = "👤";
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
    btn.textContent = "👤";
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

  authClient.getSession().then(({ data }) => {
    const user = data?.user;
    sheet.innerHTML = user
      ? `
        <div class="acc-card">
          <p class="acc-title">Signed in</p>
          <p class="acc-email">${user.email ?? ""}</p>
          <p class="acc-note">Your score syncs across devices. ☁️</p>
          <button class="acc-btn acc-danger" id="acc-signout">Sign out</button>
          <button class="acc-btn acc-ghost" id="acc-delete">Delete my data</button>
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
        </div>`;

    wireSheet(sheet, !!user);
  });

  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.remove(); });
  document.body.appendChild(sheet);
}

function wireSheet(sheet: HTMLElement, isUser: boolean) {
  if (isUser) {
    sheet.querySelector("#acc-signout")?.addEventListener("click", async () => {
      await authClient.signOut();
      location.reload();
    });
    sheet.querySelector("#acc-delete")?.addEventListener("click", async () => {
      if (!confirm("Delete your account and cloud-saved progress? This cannot be undone.")) return;
      await fetch("/api/account/delete", { method: "POST", credentials: "include" }).catch(() => {});
      await authClient.signOut().catch(() => {});
      location.reload();
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
