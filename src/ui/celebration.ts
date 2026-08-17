/**
 * Lexora — Level-complete + Chapter-complete celebration (confetti + card)
 * Self-contained, zero-dependency. Cosmetic only.
 *
 * Save as:  src/ui/celebration.ts
 *
 * Level complete:
 *   celebrateLevel({ level, score, bonus, onNext });
 *
 * Chapter complete (last level of a chapter): pass chapterName/emoji/bonus to
 * render the bigger "Chapter Complete" card with extra confetti:
 *   celebrateLevel({ level, score, bonus, chapterName: "Dawn",
 *                    chapterEmoji: "🌅", chapterBonus: 200, onNext });
 *
 * Styling lives in theme.css. Respects prefers-reduced-motion (skips confetti).
 */

interface CelebrateOpts {
  level?: number;
  score?: number;
  bonus?: number;
  onNext?: () => void;
  // Chapter-complete extras (optional):
  chapterName?: string;
  chapterEmoji?: string;
  chapterBonus?: number;
}

const COLORS = ["#E4A853", "#F2C078", "#5B8A72", "#F4EDE4", "#2C3F63"];

export function celebrateLevel(opts: CelebrateOpts = {}): void {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const isChapter = !!opts.chapterName;

  // ---- Overlay + card -------------------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "lx-celebrate";

  const cardInner = isChapter
    ? `
      <div class="lx-cel-card lx-cel-chapter" role="dialog" aria-live="polite">
        <div class="lx-cel-badge lx-cel-badge-lg">${opts.chapterEmoji ?? "✦"}</div>
        <p class="lx-cel-kicker">Chapter Complete</p>
        <h2 class="lx-cel-title">${opts.chapterName}</h2>
        <div class="lx-cel-stats">
          ${opts.score != null ? `<span class="lx-cel-chip">Level +${opts.score}</span>` : ""}
          ${opts.chapterBonus != null ? `<span class="lx-cel-chip lx-cel-chip-gold">Chapter +${opts.chapterBonus} ⭐</span>` : ""}
        </div>
        <button class="lx-cel-next" type="button">Continue →</button>
      </div>`
    : `
      <div class="lx-cel-card" role="dialog" aria-live="polite">
        <div class="lx-cel-badge">✦</div>
        <h2 class="lx-cel-title">Level Complete!</h2>
        ${opts.level != null ? `<p class="lx-cel-sub">Level ${opts.level} cleared</p>` : ""}
        <div class="lx-cel-stats">
          ${opts.score != null ? `<span class="lx-cel-chip">Score ${opts.score}</span>` : ""}
          ${opts.bonus != null ? `<span class="lx-cel-chip">Bonus ${opts.bonus}</span>` : ""}
        </div>
        <button class="lx-cel-next" type="button">Next Level →</button>
      </div>`;

  overlay.innerHTML = cardInner;
  document.body.appendChild(overlay);
  // force reflow so the CSS entrance transition fires
  void overlay.offsetWidth;
  overlay.classList.add("show");

  const cleanup = () => {
    overlay.classList.remove("show");
    stop();
    setTimeout(() => overlay.remove(), 260);
  };

  const nextBtn = overlay.querySelector<HTMLButtonElement>(".lx-cel-next")!;
  nextBtn.addEventListener("click", () => {
    cleanup();
    opts.onNext?.();
  });
  // tap outside the card also dismisses
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { cleanup(); opts.onNext?.(); }
  });

  // haptic celebration tick (a little stronger for a chapter finale)
  if ("vibrate" in navigator) navigator.vibrate?.(isChapter ? [15, 50, 15, 50, 15] : [12, 40, 12]);

  if (reduced) return; // no confetti for reduced-motion users

  // ---- Confetti (canvas) ---------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.className = "lx-confetti";
  overlay.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;

  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  interface Bit {
    x: number; y: number; vx: number; vy: number;
    rot: number; vr: number; size: number; color: string; life: number;
  }
  const bits: Bit[] = [];
  const spawn = (n: number) => {
    for (let i = 0; i < n; i++) {
      bits.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 120,
        y: innerHeight * 0.34,
        vx: (Math.random() - 0.5) * 9,
        vy: -(6 + Math.random() * 8),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 6 + Math.random() * 7,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1,
      });
    }
  };
  // Bigger burst for a chapter finale.
  spawn(isChapter ? 200 : 120);
  setTimeout(() => spawn(isChapter ? 140 : 80), 220); // second burst
  if (isChapter) setTimeout(() => spawn(120), 500);   // third burst for chapters

  let raf = 0;
  let running = true;
  const gravity = 0.28;
  const t0 = performance.now();

  const frame = () => {
    if (!running) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += gravity;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      b.life -= 0.006;
      ctx.save();
      ctx.globalAlpha = Math.max(0, b.life);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.6);
      ctx.restore();
    }
    // drop dead confetti
    for (let i = bits.length - 1; i >= 0; i--) {
      if (bits[i].life <= 0 || bits[i].y > innerHeight + 40) bits.splice(i, 1);
    }
    // auto-stop after 3.5s or when all gone
    if (performance.now() - t0 > 3500 && bits.length === 0) { stop(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  }
}
