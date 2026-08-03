/**
 * Lexora — service-worker update prompt.
 * Save as:  src/ui/sw-update.ts
 *
 * Ends the "stale until hard refresh" problem. When a new deploy is detected,
 * a small toast appears with an "Update" button; tapping it activates the new
 * service worker and reloads once, so the user always lands on fresh content.
 *
 * Requires vite-plugin-pwa. In vite.config.ts set:  registerType: "prompt"
 * (the virtual module below is provided by the plugin at build time).
 */
// @ts-ignore — virtual module provided by vite-plugin-pwa
import { registerSW } from "virtual:pwa-register";

export function initSWUpdate() {
  const updateSW = registerSW({
    onNeedRefresh() { showUpdateToast(() => updateSW(true)); },
    onOfflineReady() { showInfoToast("Lexora is ready to play offline ✓"); },
  });
}

/* ------------------------------------------------------------------ */
/* Minimal, self-styled toast (no dependency on game CSS)              */
/* ------------------------------------------------------------------ */
function showUpdateToast(onUpdate: () => void) {
  if (document.getElementById("sw-toast")) return;

  const bar = document.createElement("div");
  bar.id = "sw-toast";
  bar.className = "sw-toast";
  bar.innerHTML = `
    <span class="sw-toast-msg">A new version of Lexora is available.</span>
    <button class="sw-toast-btn" id="sw-toast-update" type="button">Update</button>
    <button class="sw-toast-x" id="sw-toast-dismiss" type="button" aria-label="Dismiss">✕</button>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add("show"));

  document.getElementById("sw-toast-update")?.addEventListener("click", () => {
    const btn = document.getElementById("sw-toast-update") as HTMLButtonElement | null;
    if (btn) { btn.textContent = "Updating…"; btn.disabled = true; }
    onUpdate(); // activates the waiting SW → triggers a controlled reload
  });
  document.getElementById("sw-toast-dismiss")?.addEventListener("click", () => {
    bar.classList.remove("show");
    setTimeout(() => bar.remove(), 250);
  });
}

function showInfoToast(text: string) {
  const bar = document.createElement("div");
  bar.className = "sw-toast info";
  bar.innerHTML = `<span class="sw-toast-msg">${text}</span>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add("show"));
  setTimeout(() => { bar.classList.remove("show"); setTimeout(() => bar.remove(), 250); }, 2600);
}
