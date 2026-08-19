/**
 * Lexora — bonus words popup.
 * Save as:  src/ui/bonus-popup.ts
 *
 * Shows the bonus words the player has discovered this level in a small card.
 * Bonus words are the extra valid words (not part of the crossword grid) that
 * the player found by swiping — a nice "look what I discovered" moment.
 *
 * USAGE (main.ts): wire the bonus chip to open it, e.g.
 *   $("#bonus-count").closest(".chip")?.addEventListener("click", () => {
 *     showBonusWords([...round.foundBonus]);
 *   });
 */

export function showBonusWords(words: string[]): void {
  // Toggle: if already open, close it.
  const existing = document.getElementById("bonus-pop");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "bonus-pop";
  overlay.className = "bonus-pop";

  const sorted = [...words].map((w) => w.toUpperCase()).sort();
  const chips = sorted.length
    ? sorted.map((w) => `<span class="bp-word">${w}</span>`).join("")
    : `<p class="bp-empty">No bonus words yet.<br>Find extra words beyond the grid to collect them! ✨</p>`;

  overlay.innerHTML = `
    <div class="bp-card" role="dialog" aria-label="Bonus words">
      <div class="bp-head">
        <span class="bp-title">✨ Bonus words</span>
        <span class="bp-count">${sorted.length}</span>
      </div>
      <div class="bp-list">${chips}</div>
      <button class="bp-close" id="bp-close" type="button">Close</button>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const close = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector("#bp-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}
