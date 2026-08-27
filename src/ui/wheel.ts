/**
 * Lexora swipe letter-wheel (Canvas) — touch-tuned v3 "Helm" edition.
 *
 * WHAT'S NEW (tester feedback):
 *  - THEMED WHEEL that changes per JOURNEY (chapter): ship's helm → car
 *    steering wheel → aviator yoke → explorer's compass → cosmic dial → sunset
 *    regatta. Each theme sets its own disc gradient, rim, spokes, hub and a
 *    multi-colour LETTER PALETTE (Wordscapes-style colourful tiles).
 *  - Gone: the harsh single orange border + flat blue letters.
 *  - Kept: v2 touch feel (separate hit radius, backtracking, pointer capture,
 *    haptics) AND Option-A anti-crowding for 7-8 letters.
 *
 * The theme is chosen from the LEVEL NUMBER passed by main.ts:
 *     new Wheel(container, letters, level.levelNumber)
 * Assuming ~20 levels per chapter (15 chapters / 300 levels), the theme
 * advances one step per chapter and cycles through THEMES.
 *
 * All feel + sizing constants live in TUNING; all looks live in THEMES.
 */

// ---- TUNING: feel + sizing (adjust during playtesting) ---------------------
const TUNING = {
  nodeRadiusFactor: 0.092,     // visual dot radius (relative to canvas size) — BASE (<=6 letters)
  hitRadiusFactor: 0.130,      // touch target radius (>= nodeRadius) — BASE
  wheelRadiusFactor: 0.355,    // ring radius the dots sit on — BASE
  trailWidthFactor: 0.040,     // connector thickness
  selectedScale: 1.14,         // selected-dot pop
  hapticMs: 8,                 // vibration per new letter (0 = off)
  minWordLength: 3,
  maxCanvasPx: 420,            // hard ceiling
  viewportHeightFactor: 0.36,  // wheel never taller than 36% of viewport height
  widthFactor: 0.86,           // …nor wider than 86% of its parent's width

  // Anti-crowding (Option A). For each letter above 6:
  crowdNodeShrink: 0.14,       // node radius × (1 - shrink*over)
  crowdRingGrow:   0.015,      // ring radius + grow*over (capped)
  crowdHitShrink:  0.12,       // hit radius × (1 - shrink*over)
  wheelRadiusMax:  0.375,      // cap so disc + spokes never clip the canvas

  levelsPerChapter: 20,        // theme advances every N levels
};

// ---- THEMES: one per journey; cycles if there are more chapters ------------
interface WheelTheme {
  name: string;
  faceHi: string;   // disc centre (light)
  faceLo: string;   // disc edge
  rim: string;      // outer rim ring
  spoke: string;    // spoke lines (drawn faint)
  knob: string;     // handle knobs on the rim
  hub: string;      // centre cap
  spokes: number;   // how many spokes/handles (evokes the vehicle)
  letters: string[];// multi-colour tile palette (cycled per letter)
  trail: string;    // swipe connector
  glow: string;     // selected-node glow
}

const THEMES: WheelTheme[] = [
  { // 1 · Ship's Helm — brass + teal
    name: "Helm",
    faceHi: "#FBF6EC", faceLo: "#E7D6B6",
    rim: "#B07D34", spoke: "#8A5A22", knob: "#C79A4B", hub: "#5A3E1B", spokes: 8,
    letters: ["#0C7B93", "#1F6F8B", "#145DA0", "#2E8BC0", "#0A9396", "#3C6E71"],
    trail: "#E4A853", glow: "rgba(228,168,83,0.6)",
  },
  { // 2 · Cruiser — car steering wheel, charcoal + red
    name: "Cruiser",
    faceHi: "#F3F4F6", faceLo: "#C9CDD4",
    rim: "#2B2F36", spoke: "#3A3F48", knob: "#C1362F", hub: "#1B1E24", spokes: 3,
    letters: ["#C1362F", "#E4572E", "#A4243B", "#D64550", "#B5651D", "#8A2E3B"],
    trail: "#E4572E", glow: "rgba(228,87,46,0.55)",
  },
  { // 3 · Aviator — plane yoke, sky + steel
    name: "Aviator",
    faceHi: "#EEF5FF", faceLo: "#C3D6EF",
    rim: "#2E5EAA", spoke: "#4A6FA5", knob: "#8FB3E0", hub: "#1B3A66", spokes: 4,
    letters: ["#2E5EAA", "#3A86FF", "#4361EE", "#4895EF", "#277DA1", "#5A7FBF"],
    trail: "#3A86FF", glow: "rgba(58,134,255,0.5)",
  },
  { // 4 · Compass — explorer, green + gold
    name: "Compass",
    faceHi: "#F4F1E4", faceLo: "#D8D2B4",
    rim: "#4A7043", spoke: "#5E7C4E", knob: "#C9A227", hub: "#2F4A2A", spokes: 8,
    letters: ["#2A9D8F", "#457B45", "#6A994E", "#386641", "#52796F", "#7C9A3E"],
    trail: "#E9C46A", glow: "rgba(233,196,106,0.55)",
  },
  { // 5 · Cosmic dial — purple + magenta
    name: "Cosmic",
    faceHi: "#F3ECFB", faceLo: "#D2BEEC",
    rim: "#6A2C91", spoke: "#7E3FA6", knob: "#C77DFF", hub: "#3C1361", spokes: 6,
    letters: ["#7B2CBF", "#9D4EDD", "#5A189A", "#B5179E", "#6A4C93", "#8E3B9E"],
    trail: "#C77DFF", glow: "rgba(199,125,255,0.55)",
  },
  { // 6 · Sunset Regatta — orange + pink
    name: "Sunset",
    faceHi: "#FFF3E9", faceLo: "#F6CBB0",
    rim: "#D7263D", spoke: "#E85D75", knob: "#F4A259", hub: "#8A1C2B", spokes: 6,
    letters: ["#EF6C00", "#E85D75", "#D7263D", "#F4739E", "#C1352F", "#E07A5F"],
    trail: "#F4A259", glow: "rgba(244,162,89,0.55)",
  },
];

const SELECTED_FILL = "#E4A853"; // amber for selected tiles (consistent w/ trail)
const SELECTED_TEXT = "#0E1729"; // ink text on amber
const TILE_TEXT     = "#FFFFFF"; // white text on coloured tiles
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
  private theme: WheelTheme;

  // Geometry factors, recomputed per layout from letter count (Option A).
  private geom = {
    nodeR: TUNING.nodeRadiusFactor,
    wheelR: TUNING.wheelRadiusFactor,
    hitR: TUNING.hitRadiusFactor,
  };

  onUpdate: (word: string) => void = () => {};
  onSubmit: (word: string) => void = () => {};

  constructor(container: HTMLElement, letters: string, levelNumber = 1) {
    this.letters = letters.toUpperCase().split("");
    // Pick the journey theme from the level (one step per chapter, then cycle).
    const chapterIdx = Math.floor((Math.max(1, levelNumber) - 1) / TUNING.levelsPerChapter);
    this.theme = THEMES[chapterIdx % THEMES.length];

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

  /** Option A: scale node/ring/hit factors so 7-8 letters don't crowd. */
  private computeGeom() {
    const n = this.letters.length;
    let nodeR = TUNING.nodeRadiusFactor;
    let wheelR = TUNING.wheelRadiusFactor;
    let hitR = TUNING.hitRadiusFactor;
    if (n > 6) {
      const over = n - 6;
      nodeR = TUNING.nodeRadiusFactor * (1 - TUNING.crowdNodeShrink * over);
      wheelR = Math.min(TUNING.wheelRadiusMax, TUNING.wheelRadiusFactor + TUNING.crowdRingGrow * over);
      hitR = TUNING.hitRadiusFactor * (1 - TUNING.crowdHitShrink * over);
    }
    hitR = Math.max(hitR, nodeR * 1.05); // never smaller than the visible dot
    this.geom = { nodeR, wheelR, hitR };
  }

  private layout() {
    this.computeGeom();
    const size = this.cssSize();
    const cx = size / 2, cy = size / 2, R = size * this.geom.wheelR;
    this.nodes = this.letters.map((ch, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / this.letters.length;
      return { ch, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), idx: i };
    });
  }

  private nodeAt(x: number, y: number): Node | null {
    const hit = this.cssSize() * this.geom.hitR;
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
    const t = this.theme;
    const size = this.cssSize();
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2;
    const disc = size * (this.geom.wheelR + this.geom.nodeR + 0.03);

    // 1 · Disc face — soft light radial gradient (Wordscapes-style)
    const face = ctx.createRadialGradient(cx, cy - disc * 0.28, disc * 0.10, cx, cy, disc);
    face.addColorStop(0, t.faceHi);
    face.addColorStop(1, t.faceLo);
    ctx.beginPath();
    ctx.arc(cx, cy, disc, 0, Math.PI * 2);
    ctx.fillStyle = face;
    ctx.fill();

    // 2 · Themed rim (two soft strokes, not a harsh single border)
    ctx.lineWidth = size * 0.022;
    ctx.strokeStyle = t.rim;
    ctx.beginPath();
    ctx.arc(cx, cy, disc - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = size * 0.006;
    ctx.strokeStyle = t.knob;
    ctx.beginPath();
    ctx.arc(cx, cy, disc - size * 0.03, 0, Math.PI * 2);
    ctx.stroke();

    // 3 · Wheel motif — faint spokes from hub + handle knobs on the rim.
    //     Spoke count evokes the vehicle (3=steering, 4=yoke, 8=helm…).
    const knobR = disc - size * 0.03;
    ctx.save();
    ctx.strokeStyle = t.spoke;
    ctx.globalAlpha = 0.28;                 // subtle so it never fights letters
    ctx.lineWidth = size * 0.014;
    ctx.lineCap = "round";
    for (let i = 0; i < t.spokes; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / t.spokes;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + knobR * Math.cos(a), cy + knobR * Math.sin(a));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < t.spokes; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / t.spokes;
      const kx = cx + knobR * Math.cos(a), ky = cy + knobR * Math.sin(a);
      ctx.beginPath();
      ctx.arc(kx, ky, size * 0.020, 0, Math.PI * 2);
      ctx.fillStyle = t.knob;
      ctx.fill();
    }
    ctx.restore();

    // 4 · Centre hub cap (with a soft highlight)
    const hub = size * 0.052;
    const hubGrad = ctx.createRadialGradient(cx, cy - hub * 0.4, hub * 0.2, cx, cy, hub);
    hubGrad.addColorStop(0, t.knob);
    hubGrad.addColorStop(1, t.hub);
    ctx.beginPath();
    ctx.arc(cx, cy, hub, 0, Math.PI * 2);
    ctx.fillStyle = hubGrad;
    ctx.fill();

    // 5 · Glowing swipe trail through selected nodes (+ toward pointer)
    if (this.path.length > 0) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = size * TUNING.trailWidthFactor;
      ctx.strokeStyle = t.trail;
      ctx.shadowColor = t.glow;
      ctx.shadowBlur = size * 0.05;
      ctx.beginPath();
      this.path.forEach((idx, i) => {
        const n = this.nodes[idx];
        if (i === 0) ctx.moveTo(n.x, n.y);
        else ctx.lineTo(n.x, n.y);
      });
      if (this.dragging) ctx.lineTo(this.pointer.x, this.pointer.y);
      ctx.stroke();
      ctx.restore();
    }

    // 6 · Letter tiles — multi-colour palette, glossy, with pop on select
    const rNode = size * this.geom.nodeR;
    for (const n of this.nodes) {
      const selected = this.path.includes(n.idx);
      const r = selected ? rNode * TUNING.selectedScale : rNode;
      const base = selected ? SELECTED_FILL : t.letters[n.idx % t.letters.length];

      ctx.save();
      // drop shadow for depth
      ctx.shadowColor = selected ? t.glow : "rgba(0,0,0,0.28)";
      ctx.shadowBlur = size * (selected ? 0.06 : 0.03);
      ctx.shadowOffsetY = selected ? 0 : size * 0.006;

      // glossy radial fill
      const g = ctx.createRadialGradient(n.x, n.y - r * 0.4, r * 0.15, n.x, n.y, r);
      g.addColorStop(0, this.lighten(base, 0.28));
      g.addColorStop(1, base);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();

      // subtle top highlight ring
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(1, size * 0.004);
      ctx.strokeStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(n.x, n.y - r * 0.06, r * 0.9, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.restore();

      // letter
      ctx.fillStyle = selected ? SELECTED_TEXT : TILE_TEXT;
      ctx.font = `800 ${Math.floor(r * 1.05)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.ch, n.x, n.y);
    }
  }

  /** Mix a hex colour toward white by amount [0..1] for the glossy top. */
  private lighten(hex: string, amt: number): string {
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const mix = (v: number) => Math.round(v + (255 - v) * amt);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }
}
