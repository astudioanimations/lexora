import type { Level } from "../types";

/**
 * Crossword board renderer (DOM / CSS grid) with JS-driven fit sizing.
 *
 * The board sizes itself to fill the #board-wrap box while keeping every cell
 * square, using the SMALLER of (availWidth/cols) and (availHeight/rows) as the
 * cell size. This guarantees the whole puzzle is visible without scrolling and
 * without pushing the wheel/buttons off-screen — for any grid shape.
 */
export class Board {
  el: HTMLElement;
  private cells = new Map<string, HTMLElement>(); // "r,c" -> element
  private gap = 3;
  private ro?: ResizeObserver;

  constructor(private container: HTMLElement, private level: Level) {
    this.el = document.createElement("div");
    this.el.className = "board";
    this.el.style.gridTemplateColumns = `repeat(${level.cols}, 1fr)`;
    this.el.style.gridTemplateRows = `repeat(${level.rows}, 1fr)`;
    this.el.style.gap = `${this.gap}px`;
    container.innerHTML = "";
    container.appendChild(this.el);
    this.render();
    this.fit();

    // Refit whenever the available space changes (rotation, keyboard, chrome).
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.container);
    window.addEventListener("resize", this.fit);
  }

  private key(r: number, c: number) { return `${r},${c}`; }

  /** Size the board to fit its container with square cells. */
  private fit = () => {
    const availW = this.container.clientWidth;
    const availH = this.container.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    const { rows, cols } = this.level;
    const cellW = (availW - (cols - 1) * this.gap) / cols;
    const cellH = (availH - (rows - 1) * this.gap) / rows;
    const cell = Math.max(8, Math.floor(Math.min(cellW, cellH)));
    const w = cell * cols + (cols - 1) * this.gap;
    const h = cell * rows + (rows - 1) * this.gap;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
  };

  private render() {
    const { rows, cols, table } = this.level;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const div = document.createElement("div");
        const hasLetter = table[r][c] !== "-";
        div.className = hasLetter ? "cell slot" : "cell empty";
        if (hasLetter) {
          div.dataset.letter = table[r][c];
          const span = document.createElement("span");
          span.className = "glyph";
          span.textContent = "";
          div.appendChild(span);
          this.cells.set(this.key(r, c), div);
        }
        this.el.appendChild(div);
      }
    }
  }

  revealWord(word: string): boolean {
    const placed = this.level.words.find(
      (w) => w.answer.toLowerCase() === word.toLowerCase() && w.orientation !== "none"
    );
    if (!placed) return false;
    const x = placed.startx - 1, y = placed.starty - 1;
    let newly = false;
    for (let i = 0; i < placed.answer.length; i++) {
      const r = y + (placed.orientation === "down" ? i : 0);
      const c = x + (placed.orientation === "across" ? i : 0);
      const cell = this.cells.get(this.key(r, c));
      if (!cell) continue;
      const glyph = cell.querySelector<HTMLElement>(".glyph")!;
      if (!cell.classList.contains("filled")) newly = true;
      cell.classList.add("filled");
      glyph.textContent = (cell.dataset.letter ?? "").toUpperCase();
      glyph.style.animationDelay = `${i * 60}ms`;
      glyph.classList.remove("pop"); void glyph.offsetWidth; glyph.classList.add("pop");
    }
    return newly;
  }

  revealHintLetter(): boolean {
    for (const [, cell] of this.cells) {
      if (!cell.classList.contains("filled")) {
        cell.classList.add("filled", "hint");
        const glyph = cell.querySelector<HTMLElement>(".glyph")!;
        glyph.textContent = (cell.dataset.letter ?? "").toUpperCase();
        return true;
      }
    }
    return false;
  }

  /** Call when tearing down a level to avoid leaking observers. */
  destroy() {
    this.ro?.disconnect();
    window.removeEventListener("resize", this.fit);
  }
}
