/**
 * Lexora — Chapter select / journey map.
 * Save as:  src/ui/chapter-map.ts
 *
 * A full-screen overlay showing all 15 chapters as hero-art cards with state:
 *   ✓ completed   ▶ current (you are here)   🔒 locked
 * Tapping an UNLOCKED chapter jumps into it (current → your furthest level;
 * completed → replay from the chapter's first level). Locked chapters can't be
 * opened. Injects a 🗺️ button into the header.
 *
 * USAGE (main.ts):
 *   import { initChapterMap } from "./ui/chapter-map";
 *   initChapterMap({
 *     getFurthest: () => furthestLevelReached,   // highest level unlocked
 *     onJump: (levelNumber) => startLevel(levelNumber),
 *   });
 *   // Call refreshChapterMapButton() after advancing if you want the button
 *   // state kept fresh (optional).
 */
import { CHAPTERS, chapterFor } from "../game/chapters";

interface MapOpts {
  getFurthest: () => number;      // furthest level the player has reached
  onJump: (level: number) => void; // start a specific level
}

let opts: MapOpts | null = null;

export function initChapterMap(o: MapOpts) {
  opts = o;
  ensureButton();
}

function ensureButton() {
  if (document.getElementById("map-btn")) return;
  const btn = document.createElement("button");
  btn.id = "map-btn";
  btn.className = "map-btn";
  btn.type = "button";
  btn.textContent = "🗺️";
  btn.title = "Chapters";
  btn.setAttribute("aria-label", "View chapters");
  btn.addEventListener("click", openMap);
  // Put it at the LEFT of the header (before the brand's siblings).
  const header = document.querySelector("header");
  if (header) header.insertBefore(btn, header.firstChild);
}

function stateFor(furthest: number, chIndex: number): "done" | "current" | "locked" {
  const current = chapterFor(furthest).index;
  if (chIndex < current) return "done";
  if (chIndex === current) return "current";
  return "locked";
}

function openMap() {
  if (!opts) return;
  if (document.getElementById("chapter-map")) return;
  const furthest = opts.getFurthest();

  const overlay = document.createElement("div");
  overlay.id = "chapter-map";
  overlay.className = "chapter-map";

  const cards = CHAPTERS.map((ch) => {
    const st = stateFor(furthest, ch.index);
    const badge = st === "done" ? "✓" : st === "current" ? "▶" : "🔒";
    const sub =
      st === "done" ? "Completed"
      : st === "current" ? `Level ${furthest}`
      : `Levels ${ch.from}–${ch.to}`;
    return `
      <button class="cm-card cm-${st}" data-index="${ch.index}" type="button" ${st === "locked" ? "disabled" : ""}>
        <span class="cm-thumb" style="background-image:url('${ch.bg}')"></span>
        <span class="cm-meta">
          <span class="cm-name">${ch.emoji} ${ch.name}</span>
          <span class="cm-sub">${sub}</span>
        </span>
        <span class="cm-badge">${badge}</span>
      </button>`;
  }).join("");

  overlay.innerHTML = `
    <div class="cm-sheet">
      <div class="cm-head">
        <h2 class="cm-title">Your Journey</h2>
        <button class="cm-close" id="cm-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="cm-grid">${cards}</div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const close = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 220);
  };
  overlay.querySelector("#cm-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelectorAll<HTMLButtonElement>(".cm-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.index);
      const ch = CHAPTERS.find((c) => c.index === idx);
      if (!ch) return;
      const st = stateFor(furthest, idx);
      if (st === "locked") return;
      // current chapter → resume furthest level; completed → replay from start.
      const target = st === "current" ? furthest : ch.from;
      close();
      opts?.onJump(target);
    });
  });
}
