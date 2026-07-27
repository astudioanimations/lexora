/**
 * Lexora swipe letter-wheel (Canvas) — touch-tuned v2 + height-aware sizing.
 *
 * v2 feel improvements:
 *  - HIT radius separate from and larger than the VISUAL node radius.
 *  - BACKTRACKING: drag back onto the previous node to deselect the last letter.
 *  - Scroll/gesture lock while dragging.
 *  - Pointer capture so a drag leaving the canvas still tracks.
 *  - Selected-node pop + haptic tick.
 *  - v2 look: linen disc, indigo idle dots, amber selected dots, glowing trail.
 *
 * SIZING: the canvas is capped by the SMALLER of the parent width AND a share
 * of the viewport height (viewportHeightFactor), so it never pushes the
 * Shuffle/Hint buttons off-screen.
 *
 * All feel + sizing + colour constants live in TUNING (see PLAYTEST.md).
 */

// ---- TUNING: adjust during playtesting -------------------------------------
const TUNING = {
  nodeRadiusFactor: 0.090,     // visual dot radius (relative to canvas size)
  hitRadiusFactor: 0.130,      // touch target radius (>= nodeRadius)
  wheelRadiusFactor: 0.360,    // ring radius the dots sit on
  trailWidthFactor: 0.038,     // amber connector thickness
  selectedScale: 1.14,         // selected-dot pop
  hapticMs: 8,                 // vibration per new letter (0 = off)
  minWordLength: 3,
  maxCanvasPx: 420,            // hard ceiling
  viewportHeightFactor: 0.40,  // wheel never taller than 40% of viewport height
  widthFactor: 0.86,           // …nor wider than 86% of its parent's width
  // --- v2 look ---
  faceColor:      "#F4EDE4",   // wheel disc face (linen)
  nodeColor:      "#2C3F63",   // idle letter dot (indigo-soft)
  nodeSelected:   "#E4A853",   // selected dot (amber)
  nodeText:       "#F4EDE4",   // idle letter colour
  nodeTextSel:    "#0E1729",   // selected letter colour (ink, for contrast)
  trailColor:     "#E4A853",   // swipe connector (amber)
  glowColor:      "rgba(228,168,83,0.55)",
};
// ----------------------------------------------------------------------------

interface Node { ch: string; x: number; y: number; idx: number; }

export class Wheel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes: Node[] = [];
  private path: number[] = [];
  private dragging = false;
  private pointer = { x: 0, y: 0 };
  private letters: string[];

  onUpdate: (word: string) => void = () => {};
  onSubmit: (word: string) => void = () => {};

  constructor(container: HTMLElement, letters: string) {
    this.letters = letters.toUpperCase().split("");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "wheel";
    container.innerHTML = "";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", this.resize);

    this.canvas.addEventListener("pointerdown", (e) => this.start(e), { passive: false });
    this.canvas.addEventListener("pointermove", (e) => this.move(e), { passive: false });
    this.canvas.addEventListener("pointerup", () => this.end());
    this.canvas.addEventListener("pointercancel", () => this.end());
    this.canvas.addEventListener("touchmove", (e) => { if (this.dragging) e.preventDefault(); }, { passive: false });
  }

  shuffle() {
    for (let i = this.letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.letters[i], this.letters[j]] = [this.letters[j], this.letters[i]];
    }
    this.layout(); this.draw();
  }

  private cssSize() { return this.canvas.width / (window.devicePixelRatio || 1); }

  private resize = () => {
    const parentW = this.canvas.parentElement?.clientWidth ?? 360;
    // Fit by the smaller of: parent width, a share of viewport height, hard cap.
    const size = Math.floor(Math.min(
      parentW * TUNING.widthFactor,
      window.innerHeight * TUNING.viewportHeightFactor,
      TUNING.maxCanvasPx
    ));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout(); this.draw();
  };

  private layout() {
    const size = this.cssSize();
    const cx = size / 2, cy = size / 2, R = size * TUNING.wheelRadiusFactor;
    this.nodes = this.letters.map((ch, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / this.letters.length;
      return { ch, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), idx: i };
    });
  }

  private nodeAt(x: number, y: number): Node | null {
    const hit = this.cssSize() * TUNING.hitRadiusFactor;
    let best: Node | null = null, bestD = Infinity;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= hit && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  private localPos(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private start(e: PointerEvent) {
    e.preventDefault();
    this.dragging = true;
    this.path = [];
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ok */ }
    this.move(e);
  }

  private move(e: PointerEvent) {
    if (!this.dragging) return;
    e.preventDefault();
    const p = this.localPos(e);
    this.pointer = p;
    const n = this.nodeAt(p.x, p.y);
    if (n) {
      const pos = this.path.indexOf(n.idx);
      if (pos === -1) {
        this.path.push(n.idx);
        this.onUpdate(this.currentWord());
        this.buzz();
      } else if (pos === this.path.length - 2) {
        this.path.pop();                 // backtrack
        this.onUpdate(this.currentWord());
        this.buzz();
      }
    }
    this.draw();
  }

  private end() {
    if (!this.dragging) return;
    this.dragging = false;
    const word = this.currentWord();
    this.path = [];
    this.draw();
    if (word.length >= TUNING.minWordLength) this.onSubmit(word);
  }

  private currentWord(): string {
    return this.path.map((i) => this.nodes[i].ch).join("");
  }

  private buzz() {
    if (TUNING.hapticMs > 0 && "vibrate" in navigator) navigator.vibrate?.(TUNING.hapticMs);
  }

  private draw() {
    const ctx = this.ctx;
    const size = this.cssSize();
    ctx.clearRect(0, 0, size, size);

    // 1 · Wheel disc face
    const cx = size / 2, cy = size / 2;
    const disc = size * (TUNING.wheelRadiusFactor + TUNING.nodeRadiusFactor + 0.03);
    ctx.beginPath();
    ctx.arc(cx, cy, disc, 0, Math.PI * 2);
    ctx.fillStyle = TUNING.faceColor;
    ctx.fill();

    // 2 · Glowing swipe trail through selected nodes (+ toward pointer)
    if (this.path.length > 0) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = size * TUNING.trailWidthFactor;
      ctx.strokeStyle = TUNING.trailColor;
      ctx.shadowColor = TUNING.glowColor;
      ctx.shadowBlur = size * 0.05;
      ctx.beginPath();
      this.path.forEach((idx, i) => {
        const n = this.nodes[idx];
        if (i === 0) ctx.moveTo(n.x, n.y);
        else ctx.lineTo(n.x, n.y);
      });
      // live segment to the finger while dragging
      if (this.dragging) ctx.lineTo(this.pointer.x, this.pointer.y);
      ctx.stroke();
      ctx.restore();
    }

    // 3 · Letter nodes
    const rNode = size * TUNING.nodeRadiusFactor;
    for (const n of this.nodes) {
      const selected = this.path.includes(n.idx);
      const r = selected ? rNode * TUNING.selectedScale : rNode;

      ctx.save();
      if (selected) {
        ctx.shadowColor = TUNING.glowColor;
        ctx.shadowBlur = size * 0.06;
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = selected ? TUNING.nodeSelected : TUNING.nodeColor;
      ctx.fill();
      ctx.restore();

      // letter
      ctx.fillStyle = selected ? TUNING.nodeTextSel : TUNING.nodeText;
      ctx.font = `700 ${Math.floor(r * 1.05)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.ch, n.x, n.y);
    }
  }
}
