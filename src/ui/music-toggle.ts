/**
 * Lexora — main-screen music button (🔊 / 🔇).
 * Save as:  src/ui/music-toggle.ts
 *
 * Puts the music control on the MAIN SCREEN (in the header) so players don't
 * have to open the sign-in sheet to find it. Stays in sync with the account
 * sheet's toggle via onMusicChange().
 *
 * USAGE (main.ts, inside the DOMContentLoaded handler, after initAudio()):
 *   import { initMusicButton } from "./ui/music-toggle";
 *   initMusicButton();
 */
import { isMusicOn, toggleMusic, onMusicChange } from "../audio/audio";

export function initMusicButton() {
  if (document.getElementById("music-btn")) return;

  const btn = document.createElement("button");
  btn.id = "music-btn";
  btn.className = "music-btn";
  btn.type = "button";

  const paint = (on: boolean) => {
    btn.textContent = on ? "🔊" : "🔇";
    btn.title = on ? "Music on" : "Music off";
    btn.setAttribute("aria-label", on ? "Music on" : "Music off");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("on", on);
  };

  paint(isMusicOn());
  btn.addEventListener("click", () => paint(toggleMusic()));
  onMusicChange(paint); // sheet toggle or startup → header icon updates too

  const header = document.querySelector("header");
  header?.appendChild(btn);
}
