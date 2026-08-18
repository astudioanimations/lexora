/**
 * Lexora — background music manager.
 * Save as:  src/audio/audio.ts
 *
 * - One looping ambient track, gentle fade in/out.
 * - Autoplay-safe: browsers block audio until the user interacts, so playback
 *   only actually starts after the first tap/click/keydown.
 * - Default OFF (calm game; respects quiet/public settings). Preference is
 *   stored under "lexora.setting.music" so it survives a sign-out (account.ts
 *   deliberately keeps "lexora.setting*" keys).
 * - Injects a 🔊/🔇 toggle button into the header.
 *
 * USAGE (main.ts):
 *   import { initAudio } from "./audio/audio";
 *   initAudio();   // call once, e.g. in the DOMContentLoaded handler
 */

const TRACK_URL = "/music/leberch-calm-ambient-354930.mp3";
const SETTING_KEY = "lexora.setting.music"; // "on" | "off"
const TARGET_VOLUME = 0.35;                  // gentle background level
const FADE_MS = 900;

let audio: HTMLAudioElement | null = null;
let wantOn = false;          // user's desired state
let started = false;         // has playback ever been unlocked by a gesture
let fadeTimer = 0;

function prefOn(): boolean {
  return localStorage.getItem(SETTING_KEY) === "on"; // default OFF
}
function savePref(on: boolean) {
  localStorage.setItem(SETTING_KEY, on ? "on" : "off");
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio(TRACK_URL);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  return audio;
}

function fadeTo(target: number, done?: () => void) {
  const el = ensureAudio();
  clearInterval(fadeTimer);
  const start = el.volume;
  const steps = Math.max(1, Math.round(FADE_MS / 40));
  let i = 0;
  fadeTimer = window.setInterval(() => {
    i++;
    el.volume = Math.min(1, Math.max(0, start + (target - start) * (i / steps)));
    if (i >= steps) { clearInterval(fadeTimer); done?.(); }
  }, 40);
}

async function play() {
  const el = ensureAudio();
  try {
    await el.play();          // may reject if no gesture yet
    fadeTo(TARGET_VOLUME);
  } catch {
    /* Autoplay blocked — will retry on the next user gesture (see unlock). */
  }
}

function pause() {
  const el = ensureAudio();
  fadeTo(0, () => el.pause());
}

/** First user gesture unlocks audio; if the user wants music on, start it. */
function unlockOnce() {
  if (started) return;
  started = true;
  if (wantOn) void play();
}

function renderToggle() {
  const btn = document.getElementById("music-btn");
  if (!btn) return;
  btn.textContent = wantOn ? "🔊" : "🔇";
  btn.setAttribute("title", wantOn ? "Music on" : "Music off");
  btn.setAttribute("aria-label", wantOn ? "Turn music off" : "Turn music on");
}

function toggle() {
  wantOn = !wantOn;
  savePref(wantOn);
  renderToggle();
  if (wantOn) {
    if (started) void play(); else void play(); // play() is safe; unlock handles blocked case
  } else {
    pause();
  }
}

function ensureToggleButton() {
  if (document.getElementById("music-btn")) return;
  const btn = document.createElement("button");
  btn.id = "music-btn";
  btn.className = "music-btn";
  btn.type = "button";
  btn.addEventListener("click", toggle);
  // Place it in the header, before the account button if present.
  const header = document.querySelector("header");
  const accountBtn = document.getElementById("account-btn");
  if (header && accountBtn) header.insertBefore(btn, accountBtn);
  else if (header) header.appendChild(btn);
}

/** Call once at startup. */
export function initAudio() {
  wantOn = prefOn();
  ensureToggleButton();
  renderToggle();

  // Unlock playback on the very first user interaction (autoplay policy).
  const opts = { once: true, passive: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", unlockOnce, opts);
  window.addEventListener("keydown", unlockOnce, opts);
  window.addEventListener("touchstart", unlockOnce, opts);

  // Pause when tab hidden, resume when visible (if the user wants music on).
  document.addEventListener("visibilitychange", () => {
    if (!audio) return;
    if (document.visibilityState === "hidden") { audio.pause(); }
    else if (wantOn && started) { void play(); }
  });
}
