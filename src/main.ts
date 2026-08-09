import type { Level } from "./types";
import { Board } from "./ui/board";
import { Wheel } from "./ui/wheel";
import { newRound, submitWord, isLevelComplete, computeScore, type RoundState } from "./game/scoring";
import { loadDictionary, isRealWord } from "./game/dictionary";
import { loadProgress, markCleared, loadLevelPack, type Progress } from "./game/state";
import "./style.css";
import "./theme.css"; // layers on top
import { celebrateLevel } from "./ui/celebration";
import { applyDailyBackground } from "./ui/daily-bg";
import { initAccountUI, schedulePush } from "./ui/account";
import { offerRewardedTopUp } from "./ads/ads";
import { installBestRewardedProvider } from "./ads/admob-provider";
import { initSWUpdate } from "./ui/sw-update";

applyDailyBackground();   // top-level; sets --lx-bg before first paint

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---- SCORING (tunable) -----------------------------------------------------
const SCORE = {
  perGridLetter: 4,    // was 10
  bonusWord:     10,   // was 25
  hintCost:      120,  // was 75
  storeKey:      "lexora.score",
};

// ---- DAILY GIFT / NEW-PLAYER SEED (tunable) --------------------------------
const DAILY = {
  gift: 60,                    // points granted once per local day
  seed: 120,                   // one-time welcome grant for brand-new players
  key:  "lexora.lastGiftDay",  // stores YYYY-MM-DD of last claim
};

// ---- LEVEL PERSISTENCE -----------------------------------------------------
// Authoritative, MONOTONIC ("furthest reached") level marker. Same key that
// account.ts uses for cloud sync, so local + cloud always agree. Written on
// EVERY startLevel() so a device that jumps to the cloud level and closes
// before completing a level still remembers it on next (even offline) launch.
const LS_LEVEL = "lexora.current";
// ----------------------------------------------------------------------------

let levels: Level[] = [];
let progress: Progress;
let level: Level;
let round: RoundState;
let board: Board;
let wheel: Wheel;

// Cumulative, persisted score + this-level delta for the celebration card.
let score = loadScore();
let levelPoints = 0;

async function boot() {
  progress = loadProgress();
  await loadDictionary().catch(() => {});
  levels = await loadLevelPack();
  ensureScoreEl();
  renderScore(false);

  // Start at the FURTHEST of: state.ts progress vs. our persisted level marker.
  // (These can differ if a previous session jumped to a cloud level without
  //  completing one — the marker keeps us on the furthest point regardless.)
  const startAt = Math.max(
    clamp(progress.current, 1, levels.length),
    clamp(loadSavedLevel(), 1, levels.length),
  );
  startLevel(startAt);

  // Accounts + cloud score. Pulls saved progress if signed in and merges
  // (higher score/level wins — "furthest wins"). No-op when signed out.
  await initAccountUI((cloud) => {
    score = cloud.score;
    renderScore(false);

    // FURTHEST-WINS level sync: if the cloud is further along than this device,
    // jump to that level so both devices converge on the highest reached.
    const target = clamp(cloud.currentLevel, 1, levels.length);
    if (target > (level?.levelNumber ?? 1)) {
      progress.current = target;   // keep local progress in step
      startLevel(target);          // startLevel persists LS_LEVEL + pushes cloud
    } else if (target < (level?.levelNumber ?? 1)) {
      // This device is ahead → push our level up to the cloud.
      schedulePush({ score, currentLevel: level.levelNumber, bonusWords: [] });
    }
  });

  // Daily gift runs AFTER cloud hydration so the day-key/score are up to date.
  maybeDailyGift();
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

// ---- Level marker helpers (monotonic) --------------------------------------
function loadSavedLevel(): number {
  const v = Number(localStorage.getItem(LS_LEVEL));
  return Number.isFinite(v) && v > 0 ? v : 1;
}
/** Persist the furthest level reached. Monotonic: never regresses. */
function saveLevel(n: number) {
  const prev = loadSavedLevel();
  localStorage.setItem(LS_LEVEL, String(Math.max(prev, n)));
}

function startLevel(n: number) {
  level = levels.find((l) => l.levelNumber === n) ?? levels[0];
  round = newRound();
  levelPoints = 0;
  // Level X / Total
  $("#level-num").textContent = `Level ${level.levelNumber} / ${levels.length}`;
  $("#tier").textContent = level.tier;
  $("#tier").className = `tier ${level.tier}`;
  board = new Board($("#board-wrap"), level);
  wheel = new Wheel($("#wheel-wrap"), level.wheelLetters);
  wheel.onUpdate = (w) => { $("#current").textContent = w.toUpperCase(); };
  wheel.onSubmit = onSubmit;
  updateProgressBar();
  $("#bonus-count").textContent = "0";
  toast(`${level.anchor.toUpperCase()} — find ${level.gridWords.length} words`);

  // Persist locally (bulletproof against close-before-complete) AND keep the
  // cloud's currentLevel in sync as the player advances.
  saveLevel(level.levelNumber);
  schedulePush({ score, currentLevel: level.levelNumber, bonusWords: [] });
}

function onSubmit(raw: string) {
  $("#current").textContent = "";
  const res = submitWord(raw, level, round, isRealWord);
  switch (res.kind) {
    case "grid":
      board.revealWord(res.word);
      if (!res.alreadyFound) {
        award(res.word.length * SCORE.perGridLetter);
        pulseScore();
      }
      updateProgressBar();
      if (isLevelComplete(level, round)) return onComplete();
      break;
    case "bonus":
      if (!res.alreadyFound) {
        $("#bonus-count").textContent = String(round.foundBonus.size);
        award(SCORE.bonusWord);
        toast(`+bonus: ${res.word.toUpperCase()} (+${SCORE.bonusWord})`);
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
  const finalScore = computeScore(round); // kept for save/leaderboard logic
  progress = markCleared(progress, level, finalScore, [...round.foundBonus]);

  const finishedNumber = level.levelNumber;
  const next = finishedNumber + 1;

  celebrateLevel({
    level: finishedNumber,
    score: levelPoints,            // points earned THIS level (consistent w/ counter)
    bonus: round.foundBonus.size,
    onNext: () => {
      if (next <= levels.length) startLevel(next);   // startLevel persists + pushes cloud
      else toast("You finished every level! 🎉", 4000);
    },
  });
}

// ---- Score helpers ---------------------------------------------------------
function loadScore(): number {
  const v = Number(localStorage.getItem(SCORE.storeKey));
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function saveScore() { localStorage.setItem(SCORE.storeKey, String(score)); }

function award(pts: number) {
  score += pts;
  levelPoints += pts;
  saveScore();
  renderScore(true);
  schedulePush({ score, currentLevel: level?.levelNumber ?? 1, bonusWords: [] });
}

/** Grant points to the bank WITHOUT counting toward this-level points. */
function grantPoints(pts: number, msg: string) {
  score += pts;
  saveScore();
  renderScore(true);
  schedulePush({ score, currentLevel: level?.levelNumber ?? 1, bonusWords: [] });
  toast(msg, 2400);
}

/** One welcome gift for brand-new players, then a gift once per local day. */
function maybeDailyGift() {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const last = localStorage.getItem(DAILY.key);
  if (last === null && score === 0) {
    // Brand-new player, empty bank → welcome seed so they're not stuck at zero.
    localStorage.setItem(DAILY.key, today);
    grantPoints(DAILY.seed, `Welcome gift: +${DAILY.seed} ⭐`);
  } else if (last !== today) {
    // Once per local day.
    localStorage.setItem(DAILY.key, today);
    grantPoints(DAILY.gift, `Daily gift: +${DAILY.gift} ⭐`);
  }
}

/** Try to spend points. Returns false (and warns) if unaffordable. */
function spend(pts: number): boolean {
  if (score < pts) {
    toast(`Need ${pts - score} more points for a hint`);
    return false;
  }
  score -= pts;
  saveScore();
  renderScore(true);
  schedulePush({ score, currentLevel: level?.levelNumber ?? 1, bonusWords: [] });
  return true;
}

/** Create the score chip in the header if it doesn't already exist. */
function ensureScoreEl() {
  if (document.getElementById("score")) return;
  const chip = document.createElement("span");
  chip.id = "score";
  chip.className = "chip score-chip";
  chip.setAttribute("aria-live", "polite");
  // Insert into the header, before the level number if present.
  const header = document.querySelector("header");
  const levelNum = document.getElementById("level-num");
  if (header && levelNum) header.insertBefore(chip, levelNum);
  else if (header) header.appendChild(chip);
  else document.body.appendChild(chip);
}

function renderScore(animate: boolean) {
  const el = document.getElementById("score");
  if (!el) return;
  el.textContent = `⭐ ${score.toLocaleString()}`;
  if (animate) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
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
  $("#hint").addEventListener("click", () => {
    if (score >= SCORE.hintCost) {
      if (!spend(SCORE.hintCost)) return;
      if (!board.revealHintLetter()) { award(SCORE.hintCost); toast("No letters left to hint"); return; }
      if (board.isComplete()) onComplete();   // hint filled the last cell → celebrate + advance
      return;
    }
    // Not enough points → offer a rewarded ad instead of a dead end.
    offerRewardedTopUp({
      reward: SCORE.hintCost,
      reason: "Not enough points for a hint",
      toast,
      onReward: (pts) => award(pts),
    });
  });
  installBestRewardedProvider();   // AdMob inside TWA; no-op (keeps mock) elsewhere
  initSWUpdate();
  boot();
});
