import type { Level } from "./types";
import { Board } from "./ui/board";
import { Wheel } from "./ui/wheel";
import { newRound, submitWord, isLevelComplete, computeScore, type RoundState } from "./game/scoring";
import { loadDictionary, isRealWord } from "./game/dictionary";
import { loadProgress, markCleared, loadLevelPack, type Progress } from "./game/state";
import "./style.css";
import "./theme.css"; // layers on top
import { celebrateLevel } from "./ui/celebration";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let levels: Level[] = [];
let progress: Progress;
let level: Level;
let round: RoundState;
let board: Board;
let wheel: Wheel;

async function boot() {
  progress = loadProgress();
  await loadDictionary().catch(() => {});
  levels = await loadLevelPack();
  startLevel(clamp(progress.current, 1, levels.length));
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function startLevel(n: number) {
  level = levels.find((l) => l.levelNumber === n) ?? levels[0];
  round = newRound();
  $("#level-num").textContent = `Level ${level.levelNumber}`;
  $("#tier").textContent = level.tier;
  $("#tier").className = `tier ${level.tier}`;
  board = new Board($("#board-wrap"), level);
  wheel = new Wheel($("#wheel-wrap"), level.wheelLetters);
  wheel.onUpdate = (w) => { $("#current").textContent = w.toUpperCase(); };
  wheel.onSubmit = onSubmit;
  updateProgressBar();
  $("#bonus-count").textContent = "0";
  toast(`${level.anchor.toUpperCase()} — find ${level.gridWords.length} words`);
}

function onSubmit(raw: string) {
  $("#current").textContent = "";
  const res = submitWord(raw, level, round, isRealWord);
  switch (res.kind) {
    case "grid":
      board.revealWord(res.word);
      if (!res.alreadyFound) pulseScore();
      updateProgressBar();
      if (isLevelComplete(level, round)) return onComplete();
      break;
    case "bonus":
      if (!res.alreadyFound) {
        $("#bonus-count").textContent = String(round.foundBonus.size);
        toast(`+bonus: ${res.word.toUpperCase()}`);
      }
      break;
    case "too-short": break;
    case "invalid-not-formable":
    case "invalid-not-a-word":
      shake();
      break;
  }
}

function onComplete() {
  const score = computeScore(round);
  progress = markCleared(progress, level, score, [...round.foundBonus]);

  const finishedNumber = level.levelNumber;
  const next = finishedNumber + 1;

  // Polished celebration: confetti + card, then advance on "Next Level".
  celebrateLevel({
    level: finishedNumber,
    score,
    bonus: round.foundBonus.size,
    onNext: () => {
      if (next <= levels.length) startLevel(next);
      else toast("You finished every level! 🎉", 4000);
    },
  });
}

function updateProgressBar() {
  const done = round.foundGrid.size;
  const total = level.gridWords.length;
  $("#progress").textContent = `${done}/${total}`;
  ($("#bar-fill") as HTMLElement).style.width = `${(done / total) * 100}%`;
}

function pulseScore() { const s = $("#current"); s.classList.remove("pulse"); void s.offsetWidth; s.classList.add("pulse"); }
function shake() { const w = $("#wheel-wrap"); w.classList.remove("shake"); void w.offsetWidth; w.classList.add("shake"); }

let toastTimer = 0;
function toast(msg: string, ms = 1200) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
}

// controls
document.addEventListener("DOMContentLoaded", () => {
  $("#shuffle").addEventListener("click", () => wheel.shuffle());
  $("#hint").addEventListener("click", () => { if (!board.revealHintLetter()) toast("No letters left to hint"); });
  boot();
});
