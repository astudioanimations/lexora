# Lexora — Complete Rebuild Guide (with the *why* behind each step)

A from-zero playbook to recreate this project — or any Wordscapes-style PWA with
accounts + cloud save. Each section explains **what** you do and **why** it matters,
so you can adapt it rather than copy blindly.

> Stack in one line: **Vite + vanilla TypeScript + vite-plugin-pwa** front-end,
> **Cloudflare Pages** hosting, **Pages Functions** backend, **Better Auth** for
> auth, **Cloudflare D1** database, **KV** for session cache, **Resend** for email.

---

## 0 · Mental model — the big picture

```
   Browser (PWA)                Cloudflare Pages
 ┌───────────────┐            ┌──────────────────────┐
 │ Vite app       │  same     │ functions/api/*  ────┼─► Better Auth ─► D1 (users, sessions)
 │ (HTML/TS/CSS)  │  origin   │  (server code)       │                └► KV (session cache)
 │ service worker │ ◄────────►│ static dist/ files   │  magic-link  ─► Resend (email)
 └───────────────┘            └──────────────────────┘  OAuth       ─► Google
```

**Why this shape:** everything lives on **one domain**, so browser ↔ server calls are
*same-origin* — no CORS, cookies "just work". Hosting is $0 on Cloudflare's free tier.
The DB and auth run "at the edge" (close to users) instead of a single server.

---

## 1 · Domain & DNS (Cloudflare)

**What:** Own a domain (e.g. `wordhaus.app`) in Cloudflare. Run each app on a
**subdomain** — `lexora.wordhaus.app`, `tessera.wordhaus.app`.

**Why a custom domain at all:**
- **Google OAuth** requires fixed, stable redirect URIs. A random `pages.dev` URL is
  fragile and not production-appropriate.
- **Resend** can only send email from a **domain you've verified** via DNS. You can't
  verify `*.pages.dev`.
- Branding + trust + it never changes if you redeploy.

**Why a subdomain (not a new domain):** one domain purchase covers unlimited apps; DNS,
SSL, and Resend verification are shared. Cheaper and simpler.

**Why Cloudflare for DNS:** because hosting is also Cloudflare Pages, attaching the
subdomain auto-creates the CNAME and SSL cert — zero manual DNS.

---

## 2 · Accounts you'll need

| Service | Why |
|---|---|
| **GitHub** | source of truth; Cloudflare auto-deploys on push |
| **Cloudflare** | hosting (Pages) + database (D1) + cache (KV) + DNS |
| **Google Cloud** | OAuth "Sign in with Google" |
| **Resend** | transactional email (magic-link sign-in) |

**Tip:** use ONE email to own all of them (we used `astudioanimations@gmail.com`).
Mixing accounts caused a `403 Permission denied` when the local git identity didn't
own the target repo.

---

## 3 · Front-end skeleton

```bash
npm create vite@latest lexora -- --template vanilla-ts
cd lexora
npm install
npm install -D vite-plugin-pwa
```

**Why Vite:** fast dev server + optimized production build, tiny output.
**Why vanilla TS (no framework):** a word game is DOM + canvas; React/Vue would add
weight for no benefit. Type-safety without framework overhead.
**Why vite-plugin-pwa:** generates the service worker + precache manifest so the game
installs to the home screen and works **offline**.

`vite.config.ts` essentials and *why*:
```ts
VitePWA({
  registerType: "autoUpdate",                 // SW updates itself (see gotcha below)
  manifest: false,                            // we ship our own public/manifest.webmanifest
  workbox: {
    globPatterns: ["**/*.{js,css,html,png,webp,json,txt,webmanifest}"], // what to precache offline
    navigateFallbackDenylist: [/^\/api\//],   // NEVER serve cached shell for API/auth routes
  },
})
```
**Why `navigateFallbackDenylist: [/^\/api\//]`:** without it, the service worker can
intercept the OAuth callback (`/api/auth/callback/google`) and serve the cached app
shell instead of letting the server complete sign-in.

---

## 4 · Game core (front-end)

Files and their job:
- `src/ui/board.ts` — crossword grid; JS `fit()` sizes square cells to the container
  (via ResizeObserver) so the whole puzzle always fits any screen.
- `src/ui/wheel.ts` — canvas letter-wheel; pointer events, backtracking, haptics,
  glowing swipe trail. All feel constants in a `TUNING` object.
- `src/game/scoring.ts` — duplicate-letter-SAFE matching (consume a multiset of tiles,
  never `String.includes`). This is the subtle correctness bug most clones get wrong.
- `src/game/dictionary.ts` — runtime word set for bonus-word validation.
- `src/game/state.ts` — level progression + localStorage.
- `src/main.ts` — wires it all together.

**Why localStorage first:** the game must be fully playable offline and signed-out.
Cloud save is added *on top* later, never as a requirement.

---

## 5 · Polish layer (`theme.css`)

A cosmetic layer imported **after** `style.css` so it overrides without touching logic.
Key techniques (learned from studying Wordscapes/Zen Word):
- **Scenic background** behind everything, with a **darkened top wash** so header text
  stays readable and background stars don't bleed through the HUD.
- **Frosted glass card** behind the board (`backdrop-filter: blur`) so tiles never
  blend into the background — the #1 player complaint about busy backgrounds.
- **Juicy buttons** (bounce + press) and **confetti** on level-complete — "movement on
  every state change" is what makes it feel premium.

**Why a separate theme layer:** you can restyle the entire look without risking game
logic, and revert cosmetics independently.

---

## 6 · Daily rotating background

`src/ui/daily-bg.ts` picks an image by **local calendar day**:
```
dayIndex = floor(localMidnightTimestamp / 86,400,000)
pick     = dayIndex % BG_COUNT
```
Sets a CSS variable `--lx-bg`; `theme.css` uses `var(--lx-bg, url("/bg-0.webp"))`.

**Why deterministic-by-date (not random):** same background all day = stable "surprise
of the day"; random-per-refresh would flicker jarringly. Local date → flips at the
user's midnight.
**Why WebP:** ~half the size of PNG → leaner offline precache.
**Critical:** `BG_COUNT` must equal the number of images that actually exist, or the
modulo points at a missing file → 404 → no background.

---

## 7 · Game-feel: score, level counter, hint cost

In `main.ts`:
- **`Level X / total`** using `levels.length`.
- **Running score** persisted in localStorage: grid word = `10 × letters`, bonus = `+25`.
- **Hint costs 75 pts**, blocked if unaffordable, auto-refunded if there's no letter to
  reveal. (Mirrors Wordscapes' coin-cost hints.)

**Why persist + cost hints:** gives the score meaning and a small economy, which is
what makes players care about the number.

---

## 8 · Backend prerequisite decisions

**Why you now need a server:** a static PWA has no server. Auth + cloud save require
server code to hold secrets and write a database.

**Two ways to add it:**
- **A · Pages Functions (chosen):** a `functions/` folder in the *same* repo, deployed
  with the same Pages build. One repo, one domain, no CORS. Simplest for a solo dev.
- **B · Separate Worker:** more separation but two deploys + CORS/cookie config, and a
  known pitfall (caching one auth instance across requests causes multi-second hangs).

**Why Better Auth:** Lucia (the old go-to) was **deprecated in 2025**. Better Auth is
the modern, framework-agnostic replacement with Google + magic-link as plugins and a
native Cloudflare D1/KV story.

---

## 9 · Provision D1 + KV

```bash
npx wrangler login
npx wrangler d1 create lexora-db          # → prints database_id
npx wrangler kv namespace create AUTH_KV  # → prints id
```
Create `wrangler.toml` (root):
```toml
name = "lexora"
pages_build_output_dir = "dist"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]   # Better Auth + Resend use Node APIs

[[d1_databases]]
binding = "DB"                            # MUST be DB (matches code) — not lexora_db
database_name = "lexora-db"
database_id = "…"

[[kv_namespaces]]
binding = "AUTH_KV"
id = "…"
```
**Why D1:** serverless SQLite at the edge, free tier, no server to run.
**Why KV cache:** caching sessions in KV drops session reads from ~800ms → ~20ms.
**Why `nodejs_compat`:** without it the functions fail at build/runtime — Better Auth
and Resend need Node built-ins.
**Why binding = `DB`:** the code refers to `env.DB`; Wrangler's auto-suggested
`lexora_db` would make every function crash with "DB is undefined".

---

## 10 · Create the database tables

**Better Auth's own tables** — generate with its CLI (don't hand-write; the schema
tracks the version you install):
```bash
npm install better-auth kysely kysely-d1 resend
npm install -D @better-auth/cli
# temporary shim so the CLI can init an adapter:
npm install -D better-sqlite3
# auth.config.ts (root, throwaway): betterAuth({ database: new Database(":memory:"), ...google, magicLink })
npx @better-auth/cli generate --config auth.config.ts --output better-auth.sql
npx wrangler d1 execute lexora-db --remote --file=./better-auth.sql
```
**Your progress table** (`progress.sql`):
```sql
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY, score INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1, bonus_words TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT 0);
```
```bash
npx wrangler d1 execute lexora-db --remote --file=./progress.sql
```
**Cleanup — important:** delete `auth.config.ts` AND `npm uninstall better-sqlite3`.
It's a CLI-only dependency; leaving it caused an `ERESOLVE` conflict that **failed the
Cloudflare deploy** (Better Auth wants v12, npm pulled v13).

---

## 11 · Google OAuth

1. Google Cloud Console → **reuse your umbrella project** (e.g. Tessera's) so the
   consent screen/branding for `wordhaus.app` is shared.
2. **Create a NEW OAuth client** ("Lexora Web") — separate per app so you can rotate
   or delete one without affecting the other.
3. Application type: **Web**. Authorized redirect URI (character-exact):
   ```
   https://lexora.wordhaus.app/api/auth/callback/google
   http://localhost:8788/api/auth/callback/google   (for local dev)
   ```
4. Copy **Client ID** + **Client secret**.

**Why exact redirect URI:** any mismatch → `redirect_uri_mismatch` and sign-in fails.
**Why "Testing" mode is fine at first:** add yourself as a test user; publish before
public launch.

---

## 12 · Resend (email magic-link)

- Reuse the **already-verified `wordhaus.app`** domain (shared with Tessera). If new:
  add the domain in Resend → paste its DKIM/SPF records into Cloudflare DNS → verify.
- Send from `noreply@wordhaus.app` (NOT a `pages.dev` address — unverifiable).
- Grab a **RESEND_API_KEY**.

**Why magic-link + Google both:** Google is one-tap for most; magic-link covers users
without Google and needs no password to store.

---

## 13 · Secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # BETTER_AUTH_SECRET
npx wrangler pages secret put BETTER_AUTH_SECRET   --project-name lexora
npx wrangler pages secret put BETTER_AUTH_URL      --project-name lexora   # https://lexora.wordhaus.app (NO trailing slash)
npx wrangler pages secret put GOOGLE_CLIENT_ID     --project-name lexora
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name lexora
npx wrangler pages secret put RESEND_API_KEY       --project-name lexora
npx wrangler pages secret put RESEND_FROM          --project-name lexora   # Lexora <noreply@wordhaus.app>
```
**Why secrets not code:** never commit keys. Cloudflare encrypts them; the dashboard
shows names only. For local `wrangler pages dev`, mirror them into a gitignored
`.dev.vars`.
**Why no trailing slash on BETTER_AUTH_URL:** a stray `/` can break OAuth callbacks.

---

## 14 · Backend code (the `functions/` folder)

```
functions/
├─ _lib/auth.ts            # createAuth(env): D1 (Kysely) + KV secondaryStorage + Google + magicLink(Resend)
├─ _lib/env.d.ts           # Env: DB, AUTH_KV, + the 6 secrets
└─ api/
   ├─ auth/[[route]].ts    # onRequest → auth.handler(request)  (catch-all: [[route]])
   ├─ progress.ts          # GET/POST cloud score, higher-wins merge, requires session
   └─ account/delete.ts    # POST: delete progress + auth rows (Play compliance)
```
**Why create the auth instance PER REQUEST:** Pages Functions only expose env bindings
at request time, and caching a global instance that touches D1 causes hangs.
**Why higher-score-wins on POST:** a device that played offline and got ahead must not
be clobbered when it later syncs.
**Why `[[route]]` (double brackets):** Cloudflare's catch-all segment — mounts every
`/api/auth/*` route (sign-in, callback, session, sign-out) to one handler.

---

## 15 · Client wiring

- `src/auth/client.ts` — `createAuthClient({ baseURL: location.origin, plugins:[magicLinkClient()] })`.
- `src/ui/account.ts` — injects the header button (signed-out "Sign in" pill →
  signed-in avatar initial), the sign-in sheet (Google + email + Privacy link), and
  cloud sync. **Reactive refresh:** re-checks the session on `focus`/`visibilitychange`
  + a short retry loop, because the auth cookie can land just after first paint.
- `main.ts`: `applyDailyBackground()` at top; in `boot()` call
  `initAccountUI(cloud => { score = cloud.score; renderScore(); })`; in `award()`/
  `spend()` call `schedulePush({...})` (debounced, no-op when signed out).
- `public/privacy.html` — required by the Privacy link and Google Play data-safety.

**Why reactive refresh:** fixes "avatar doesn't appear until a hard refresh" after the
OAuth redirect returns.

---

## 16 · Deploy

```bash
npm run build          # = tsc --noEmit && vite build — run locally to catch TS errors early
git add -A
git commit -m "…"
git push               # Cloudflare Pages auto-builds; functions/ deploy automatically
```
Attach the custom domain: Pages project → **Custom domains** → `lexora.wordhaus.app`.

**Why build locally first:** the same `tsc` that runs on Cloudflare runs on your
machine — catch errors in seconds instead of a failed remote build.

---

## 17 · Test checklist

- [ ] `/api/auth/…` returns JSON (functions alive)
- [ ] Signed out → "Sign in" pill; Google sign-in → avatar initial
- [ ] Magic-link email arrives from `noreply@wordhaus.app` → link signs you in
- [ ] Score persists on reload; syncs to a 2nd device (higher wins)
- [ ] Sign out → local play still works; airplane mode → game still loads
- [ ] Delete my data removes account + progress

---

## 18 · Hard-won gotchas (save yourself hours)

1. **Service-worker cache** shows the OLD bundle on the first load after each deploy
   (`autoUpdate` activates on the *next* load). It hid a button, a background, and CSS
   across separate debugging cycles. **Verify fixes on the deployment's unique preview
   URL** (`<hash>.lexora-dw0.pages.dev`) which has no SW. Consider adding a "new
   version — reload" prompt or `skipWaiting`.
2. **Don't paste HTML into chat/tools** — tags get stripped and you can deploy a broken
   page. Use git. Also beware file links that route through a corporate M365 tenant
   (they can save as a "Sign in to Microsoft" page).
3. **`better-sqlite3` is CLI-only** — remove it after generating schema or it breaks
   the deploy (peer-dep conflict).
4. **No `**/*` globs inside `/* */` comments** — the `*/` closes the comment early.
   Use `//` line comments.
5. **D1 binding = `DB`**, redirect URIs character-exact, `BETTER_AUTH_URL` no trailing
   slash.

---

## 19 · Cost

Everything above runs on **free tiers**: Cloudflare Pages + D1 + KV, Resend's free
email allowance, Google OAuth (free), GitHub (free). The only paid item is the
**domain** (~AUD $10–25/yr). Add paid tiers only when traffic demands.

---

## 20 · Rebuild order (TL;DR checklist)

1. Buy domain in Cloudflare → 2. Create GitHub + CF + Google + Resend accounts (one
email) → 3. `npm create vite` + PWA plugin → 4. Build game core + localStorage →
5. Theme/polish + daily background → 6. Score/level/hint → 7. `wrangler login`;
create D1 + KV; `wrangler.toml` (binding `DB`, `nodejs_compat`) → 8. Generate + apply
Better Auth schema; add `progress` table; **remove better-sqlite3** → 9. Google OAuth
client + Resend domain → 10. Set 6 secrets → 11. Add `functions/` + client + account
UI + `privacy.html` → 12. `npm run build`, push, attach custom domain → 13. Test,
then clear SW cache → 14. TWA/Play Store when ready.
