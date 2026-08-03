# Lexora — Project Handoff

_Snapshot: 24 Jul 2026, Brisbane. Paste/attach this into a new chat to resume._
_(Supersedes the old WordLoom handoff from 21 Jul — the project has since been
rebranded to Lexora, re-homed to new accounts, and gained a full auth backend.)_

---

## HOW TO GIVE A NEW CHAT CONTEXT (read first)

A new chat starts fresh — it can't see this session's files or your drive. Point it at
the repo and attach key files.

- **Repo (source of truth):** `github.com/astudioanimations/lexora` — a new chat can fetch source here.
- **Upload rules (M365 Copilot):** ✅ .md .txt .css .js .json .html .png .webp .pdf
  ❌ .zip .ts .mjs → rename `.ts` → `.ts.txt` to upload.
- ⚠️ **Copy-paste gotcha:** pasting **HTML** into chat strips tags; pasting **TS/CSS**
  sometimes mangles (empty `{}`, stripped `import`). Prefer **git restore/checkout**
  or the repo over pasted files for anything with markup.

---

## What Lexora is

A Wordscapes-style procedural word-connect **PWA**. Swipe letters on a wheel → fill
crossword grids → discover bonus words. Level-based, play-at-your-own-pace.
Separate project from **Tessera** (the daily Wordle-style game); they share the
`wordhaus.app` domain + Google Cloud project + Resend domain, but not code.

---

## Live status ✅

- **Production:** https://lexora.wordhaus.app  (custom domain, active)
- **Pages project:** `lexora`  (also at `lexora-dw0.pages.dev`)
- **GitHub:** `github.com/astudioanimations/lexora`  (push to `main` → auto-deploy)
- **Cloudflare + GitHub + Google + Resend account:** `astudioanimations@gmail.com`
- 300 levels live · runtime dictionary 115,355 words

## Locked decisions

- PWA-first, monetise later (no ads/IAP in v1)
- 300 launch levels (90 easy / 110 medium / 100 hard)
- Palette: indigo `#1B2A4A`, linen `#F4EDE4`, amber `#E4A853`, sage `#5B8A72`, ink `#0E1729`
- Stack: Vite + vanilla TS + vite-plugin-pwa → Cloudflare Pages (auto-deploy from GitHub)
- Backend: Cloudflare **Pages Functions** (same repo, same domain — no CORS)
- Auth: **Better Auth** (Lucia is deprecated) + Google OAuth + email magic-link
- DB: Cloudflare **D1** (`lexora-db`) · session cache: **KV** (`AUTH_KV`) · email: **Resend**

---

## Backend infrastructure (all under astudioanimations account)

| Resource | Name / value |
|---|---|
| D1 database | `lexora-db` — id `ca4c69bb-091f-4c20-abe8-a3ef071acf27` |
| KV namespace | `AUTH_KV` — id `a9adcd03bbee4a93a9daba2f2351184a` |
| D1 binding | **`DB`** (not the auto-suggested `lexora_db`) |
| Tables | `user`, `session`, `account`, `verification` (Better Auth) + `progress` (ours) |
| Google OAuth | reused **Tessera's** Google Cloud project; new client **"Lexora Web"** |
| Google redirect URI | `https://lexora.wordhaus.app/api/auth/callback/google` (+ localhost:8788 for dev) |
| Resend | shared **verified `wordhaus.app`**; sends from `noreply@wordhaus.app` |

**Pages secrets (production):** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
(`https://lexora.wordhaus.app`, no trailing slash), `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM` (`Lexora <noreply@wordhaus.app>`).

`wrangler.toml` (root) declares `nodejs_compat`, `pages_build_output_dir = dist`,
and the D1 + KV bindings.

---

## Features shipped

- **Polish:** scenic daily background, frosted board card, restyled wheel + glowing
  swipe trail, level-complete confetti card.
- **Game-feel:** `Level X / 300` counter, running **⭐ score** (10×letters grid word,
  +25 bonus), **hint costs 75 pts** (blocked if unaffordable, auto-refund if no letter).
- **Daily background:** deterministic-by-local-date rotation (`src/ui/daily-bg.ts`),
  `--lx-bg` CSS var, images `public/bg-0.webp … bg-12.webp`. **`BG_COUNT = 13`.**
- **Accounts:** Google + email magic-link, signed-out "Sign in" pill → signed-in
  avatar → "Synced / email" sheet with Privacy + Delete my data.
- **Cloud score:** `GET/POST /api/progress`, higher-score-wins merge, localStorage
  offline fallback. Hydrates on sign-in via `initAccountUI` in `main.ts`.

---

## Project structure

```
lexora/
├─ functions/                      # Cloudflare Pages Functions (backend)
│  ├─ _lib/ auth.ts, env.d.ts      # Better Auth factory + Env types
│  └─ api/
│     ├─ auth/[[route]].ts         # Better Auth catch-all
│     ├─ progress.ts               # GET/POST cloud score
│     └─ account/delete.ts         # account deletion (Play compliance)
├─ src/
│  ├─ auth/client.ts               # Better Auth browser client
│  ├─ ui/ board.ts, wheel.ts, celebration.ts, daily-bg.ts, account.ts
│  ├─ game/ scoring.ts, dictionary.ts, state.ts
│  ├─ main.ts, style.css, theme.css, types.ts
├─ public/ bg-0..12.webp, privacy.html, manifest.webmanifest, icons/, level-pack.json, dictionary.txt
├─ wrangler.toml, vite.config.ts, progress.sql, better-auth.sql
```

---

## ⚠️ Gotchas learned the hard way

1. **Service-worker cache** (`registerType: "autoUpdate"`) serves the OLD bundle on
   the first load after each deploy — new SW activates on the *next* load. This hid
   the Sign-in pill, the background, and the footer CSS across three cycles. To verify
   a fix is really live, open the deployment's **unique preview URL**
   (`<hash>.lexora-dw0.pages.dev`) — no SW there. To fix locally: DevTools →
   Application → Service Workers → Unregister → Clear site data.
   _Deferred: add a "new version — tap reload" prompt or `skipWaiting`._
2. **SharePoint download links** — some Copilot file links route through the user's
   M365 tenant and, if saved wrong, deploy as a "Sign in to Microsoft" page. Don't
   deploy those; use git.
3. **`better-sqlite3`** was a CLI-only dep for schema generation — it caused an
   `ERESOLVE` deploy failure (wanted v12, got v13). **Removed** once tables existed.
4. **`/* */` in comments:** a glob example `**/*...` inside a block comment
   self-terminated it and broke `daily-bg.ts` — now uses `//` line comments.
5. **D1 binding must be `DB`**, not Wrangler's auto-suggested `lexora_db`.

---

## Remaining / roadmap

- **Footer layout** (Privacy / Delete my data alignment) — cosmetic, parked; likely
  just SW cache. Robust `.acc-foot` CSS with `space-between` ready to re-verify.
- **Background batches 3–5** (`bg-13 … bg-30`) — ~18 images left; then raise
  `BG_COUNT` back to **31**. Categories: seasons, more space, abstract, atmosphere,
  more landscape.
- **SW update prompt** — end the manual cache-clear dance.
- **Wheel touch-feel playtest** — tune `hitRadiusFactor` / `hapticMs` / backtrack via
  PLAYTEST.md on a phone.
- **TWA / Play Store** — repoint the Android wrapper at `https://lexora.wordhaus.app`,
  deploy `assetlinks.json` to `public/.well-known/`, set target audience 13+, submit `.aab`.
- **Google consent screen** currently in "Testing" — publish before public launch.

---

## Working notes

- Windows / PowerShell. `npm run build` = `tsc --noEmit && vite build` — run it
  locally before pushing to catch TS errors off Cloudflare's build.
- Score keys in localStorage: `lexora.score`, `lexora.current`, `lexora.bonusWords`.
- Privacy/delete-data contact email: `iflowuser02@gmail.com`.
- Today's background check: `dayIndex % 13`; 24 Jul 2026 → **bg-10** (spiral galaxy).
