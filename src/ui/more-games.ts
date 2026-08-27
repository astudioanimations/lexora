/**
 * Lexora — "More Games" cross-play menu.
 * Save as:  src/ui/more-games.ts
 *
 * A header 🎮 button opens a themed modal listing Lexora's sibling games.
 * Tapping a game navigates the TWA full-page to that game's URL (Option A —
 * simplest + most robust). The user's Android back button returns to Lexora.
 *
 * DATA-DRIVEN: add a new game by appending one entry to the GAMES array below.
 * (Note: WordLoom is NOT listed — Lexora *is* the renamed WordLoom.)
 *
 * ICON ASSETS: place square PN/SVG icons in  public/game-icons/  and reference
 * them by path in the GAMES array. The Tessera icon ships as
 * public/game-icons/tessera.png.
 *
 * USAGE (main.ts, inside the DOMContentLoaded handler):
 *   import { initMoreGames } from "./ui/more-games";
 *   initMoreGames();
 */

interface GameEntry {
  id: string;          // stable key (used for analytics + dedupe)
  name: string;        // display name
  tagline: string;     // one-line description under the name
  url: string;         // where tapping navigates (full-page)
  icon: string;        // path to a square icon in public/game-icons/
  accent?: string;     // optional accent colour for the row's icon ring
}

/* ------------------------------------------------------------------ */
/* The catalogue. Add future games here — one entry each.              */
/* ------------------------------------------------------------------ */
const GAMES: GameEntry[] = [
  {
    id: "tessera",
    name: "Tessera",
    tagline: "A daily word-guess challenge",
    url: "https://tessera.wordhaus.app/?from=lexora",
    icon: "/game-icons/tessera.png",
    accent: "#2A9D8F",
  },
  // Example for later — just uncomment & edit, or copy this shape:
  // {
  //   id: "somegame",
  //   name: "Some Game",
  //   tagline: "Short description",
  //   url: "https://somegame.wordhaus.app/?from=lexora",
  //   icon: "/game-icons/somegame.png",
  //   accent: "#E4A853",
  // },
];

// Optional analytics hook — fires if GA4's gtag is present, else no-op.
function track(event: string, params: Record<string, unknown> = {}) {
  const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  try { g?.("event", event, params); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
export function initMoreGames() {
  ensureButton();
}

/** Add the 🎮 header button (once). */
function ensureButton() {
  if (document.getElementById("more-games-btn")) return;
  const btn = document.createElement("button");
  btn.id = "more-games-btn";
  btn.className = "mg-btn";
  btn.type = "button";
  btn.textContent = "🎮";
  btn.title = "More games";
  btn.setAttribute("aria-label", "More games");
  btn.addEventListener("click", openSheet);

  // Sit next to the map button if present, else append to the header.
  const header = document.querySelector("header");
  const mapBtn = document.querySelector(".map-btn");
  if (mapBtn && mapBtn.parentElement) mapBtn.insertAdjacentElement("afterend", btn);
  else header?.appendChild(btn);
}

function openSheet() {
  const existing = document.getElementById("more-games-sheet");
  if (existing) { existing.remove(); return; }

  track("more_games_open");

  const sheet = document.createElement("div");
  sheet.id = "more-games-sheet";
  sheet.className = "mg-sheet";

  const rows = GAMES.map((g) => `
    <button class="mg-row" data-id="${g.id}" data-url="${g.url}" type="button">
      <span class="mg-icon" style="--mg-accent:${g.accent ?? "#E4A853"}">
        <img src="${g.icon}" alt="" width="48" height="48" loading="lazy" />
      </span>
      <span class="mg-meta">
        <span class="mg-name">${g.name}</span>
        <span class="mg-tag">${g.tagline}</span>
      </span>
      <span class="mg-chevron">›</span>
    </button>
  `).join("");

  sheet.innerHTML = `
    <div class="mg-card">
      <div class="mg-head">
        <h2 class="mg-title">More Games</h2>
        <button class="mg-close" id="mg-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="mg-list">
        ${rows}
      </div>
      <p class="mg-foot">More games coming soon ✨</p>
    </div>`;

  // Row taps → full-page navigate (Option A).
  sheet.querySelectorAll<HTMLButtonElement>(".mg-row").forEach((row) => {
    row.addEventListener("click", () => {
      const url = row.dataset.url!;
      const id = row.dataset.id!;
      track("more_games_select", { game_id: id });
      // Full-page navigation — the TWA loads the sibling game; back returns here.
      window.location.href = url;
    });
  });

  sheet.querySelector("#mg-close")?.addEventListener("click", () => sheet.remove());
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.remove(); });
  document.body.appendChild(sheet);
}
