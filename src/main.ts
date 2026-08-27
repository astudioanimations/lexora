import type { Level } from "./types";
import { Board } from "./ui/board";
import { Wheel } from "./ui/wheel";
import { newRound, submitWord, isLevelComplete, computeScore, type RoundState } from "./game/scoring";
import { loadDictionary, isRealWord } from "./game/dictionary";
import { loadProgress, markCleared, loadLevelPack, type Progress } from "./game/state";
import "./style.css";
import "./theme.css"; // layers on top
import { celebrateLevel } from "./ui/celebration";
import { chapterFor, isChapterEnd, applyChapterBackground } from "./game/chapters";
import { initAccountUI, schedulePush } from "./ui/account";
import { offerRewardedTopUp } from "./ads/ads";
import { installBestRewardedProvider } from "./ads/admob-provider";
import { initSWUpdate } from "./ui/sw-update";
import { initAudio } from "./audio/audio";
import { initMusicButton } from "./ui/music-toggle";
import { initChapterMap } from "./ui/chapter-map";
import { showBonusWords } from "./ui/bonus-popup";
// Web-native H5 Games Ads — the ad path that actually works in the TWA.
import { initH5Ads, showInterstitial } from "./ads/h5";
// Google Analytics 4 — typed, defensive wrapper (never touches the game loop).
import {
  initAnalytics,
  trackLevelStart,
  trackLevelComplete,
  trackChapterComplete,
  trackHintUsed,
  trackReward,
} from "./analytics/analytics";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---- SCORING (tunable) -----------------------------------------------------
const SCORE = {
  perGridLetter: 4,    // was 10
  bonusWord:     10,   // was 25
  hintCost:      120,  // was 75
  chapterBonus:  200,  // awarded when a whole chapter is completed
  storeKey:      "lexora.score",
};

// ---- DAILY GIFT / NEW-PLAYER SEED (tunable) --------------------------------
const DAILY = {
  gift: 60,                    // points granted once per local day
  seed: 120,                   // one-time welcome grant for brand-new players
  key:  "lexora.lastGiftDay",  // stores YYYY-MM-DD of last claim
};

// ---- LEVEL PERSISTENCE -----------------------------------------------------
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
  ensureChapterStrip();   // move chapter/level/tier onto their own row
  renderScore(false);

  // Start at the FURTHEST of: state.ts progress vs. our persisted level marker.
  const startAt = Math.max(
    clamp(progress.current, 1, levels.length),
    clamp(loadSavedLevel(), 1, levels.length),
  );
  startLevel(startAt);

  // Chapter journey map (🗺️ button). Furthest = max of marker vs current level.
  initChapterMap({
    getFurthest: () => Math.max(loadSavedLevel(), level?.levelNumber ?? 1),
    onJump: (n) => startLevel(clamp(n, 1, levels.length)),
  });

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
function saveLevel(n: number) {
  const prev = loadSavedLevel();
  localStorage.setItem(LS_LEVEL, String(Math.max(prev, n)));
}

/** Move #level-num and #tier out of the crowded header into their own row so
 *  the brand + score never get truncated. Selectors still resolve afterwards. */
function ensureChapterStrip() {
  if (document.getElementById("chapter-strip")) return;
  const header = document.querySelector("header");
  if (!header) return;
  const strip = document.createElement("div");
  strip.id = "chapter-strip";
  strip.className = "chapter-strip";
  header.insertAdjacentElement("afterend", strip);
  const levelNum = document.getElementById("level-num");
  const tier = document.getElementById("tier");
  if (levelNum) strip.appendChild(levelNum);
  if (tier) strip.appendChild(tier);
}

function startLevel(n: number) {
  level = levels.find((l) => l.levelNumber === n) ?? levels[0];
  round = newRound();
  levelPoints = 0;

  // Chapter drives the background + header label (replaces daily rotation).
  const ch = chapterFor(level.levelNumber);
  applyChapterBackground(level.levelNumber);

  // Chapter strip: "🌆 Dusk · Level 51 / 300"
  $("#level-num").textContent = `${ch.emoji} ${ch.name} · Level ${level.levelNumber} / ${levels.length}`;
  $("#tier").textContent = level.tier;
  $("#tier").className = `tier ${level.tier}`;
  board = new Board($("#board-wrap"), level);
  // Pass levelNumber so the wheel picks its per-journey theme (helm, yoke, …).
  wheel = new Wheel($("#wheel-wrap"), level.wheelLetters, level.levelNumber);
  wheel.onUpdate = (w) => { $("#current").textContent = w.toUpperCase(); };
  wheel.onSubmit = onSubmit;
  updateProgressBar();
  $("#bonus-count").textContent = "0";
  toast(`${level.anchor.toUpperCase()} — find ${level.gridWords.length} words`);

  // Analytics: level entered (GA4 recommended "level_start").
  trackLevelStart(level.levelNumber, ch.name);

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

  // Analytics: level finished (GA4 recommended "level_end").
  trackLevelComplete(finishedNumber, levelPoints, round.foundBonus.size);

  // Advance to the next level. An INTERSTITIAL is shown at this natural break;
  // the frequency hint in index.html (90s) throttles it so Lexora stays calm,
  // and onDone always fires (immediately if the cap skipped the ad) so the
  // game never gets stuck behind an ad that didn't show.
  const advance = () => {
    if (next <= levels.length) {
      showInterstitial("level_complete", () => startLevel(next));
    } else {
      toast("You finished every level! 🎉", 4000);
    }
  };

  // Chapter finale? Give a special celebration + a chapter bonus.
  if (isChapterEnd(finishedNumber)) {
    const ch = chapterFor(finishedNumber);
    trackChapterComplete(ch.name, finishedNumber);   // analytics
    grantPoints(SCORE.chapterBonus, ""); // add bonus silently (card shows it)
    celebrateLevel({
      level: finishedNumber,
      score: levelPoints,
      bonus: round.foundBonus.size,
      chapterName: ch.name,
      chapterEmoji: ch.emoji,
      chapterBonus: SCORE.chapterBonus,
      onNext: advance,
    });
    return;
  }

  // Normal level-complete celebration.
  celebrateLevel({
    level: finishedNumber,
    score: levelPoints,            // points earned THIS level (consistent w/ counter)
    bonus: round.foundBonus.size,
    onNext: advance,
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

/** Grant points to the bank WITHOUT counting toward this-level points.
 *  Pass an empty msg to skip the toast (e.g. when a card already shows it). */
function grantPoints(pts: number, msg: string) {
  score += pts;
  saveScore();
  renderScore(true);
  schedulePush({ score, currentLevel: level?.levelNumber ?? 1, bonusWords: [] });
  if (msg) toast(msg, 2400);
}

/** One welcome gift for brand-new players, then a gift once per local day. */
function maybeDailyGift() {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const last = localStorage.getItem(DAILY.key);
  if (last === null && score === 0) {
    localStorage.setItem(DAILY.key, today);
    grantPoints(DAILY.seed, `Welcome gift: +${DAILY.seed} ⭐`);
    trackReward("welcome", DAILY.seed);   // analytics
  } else if (last !== today) {
    localStorage.setItem(DAILY.key, today);
    grantPoints(DAILY.gift, `Daily gift: +${DAILY.gift} ⭐`);
    trackReward("daily", DAILY.gift);     // analytics
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
      trackHintUsed(level?.levelNumber ?? 1, SCORE.hintCost);   // analytics
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

  // Tap the "Bonus N" chip to see the bonus words discovered this level.
  document.getElementById("bonus-count")?.closest(".chip")?.addEventListener("click", () => {
    showBonusWords([...round.foundBonus]);
  });

  initAnalytics();                 // Google Analytics 4 (safe no-op if blocked)
  initH5Ads(false);                // web-native H5 ads (the `false` is the AD sound flag, not music)
  installBestRewardedProvider();   // AdMob bridge if built → else H5 web provider → else mock
  initSWUpdate();
  initAudio();                     // background music (default ON, autoplay-safe: starts on first tap)
  initMusicButton();               // 🔊 main-screen music toggle (syncs with the account-sheet toggle)
  boot();
});
