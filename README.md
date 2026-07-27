# Lexora 🧵

A procedural word-connect PWA — connect letters on the wheel, weave crossword-style grids, discover bonus words. Sequential levels, play at your own pace, fully offline.

**Palette:** indigo `#1B2A4A` · linen `#F4EDE4` · amber `#E4A853` · sage `#5B8A72`
**Stack:** Vite + vanilla TS + `vite-plugin-pwa` → Cloudflare Pages (reuses the Tessera shape).

## Decisions locked (v1)
- **PWA-first**, monetise later (no ad SDK / Play Billing in v1).
- **300 launch levels** (pack currently holds a validated 170; scale-up pending).
- **Broader runtime dictionary bundled** so players find bonus words beyond the pre-computed list.

## Run it
Requires **Node.js 18+** (`node --version` to check; get the LTS from https://nodejs.org).

```bash
npm install        # install deps (Vite + PWA plugin + TypeScript)
npm run dev        # local dev server → http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # preview the production build
npx tsx --test tests/scoring.test.ts   # scoring engine tests (5 passing)
```

> **Note:** the command is `npm run dev` — it starts with `npm`, not `run`.
> (`run` on its own is not a command and PowerShell will error with
> *"The term 'run' is not recognized…"*.)

### Test on your phone 📱
The best way to feel the real swipe gesture + haptics is on an actual device.

```bash
npm run dev -- --host
```

Vite then prints both a Local and a **Network** URL:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

Open the **`192.168.x.x`** Network URL on your phone — the phone must be on the
**same Wi-Fi** as your computer.

**If the phone URL won't load (Windows):** it's almost always the firewall.
- When Node first runs, Windows shows *"Allow Node.js through the firewall?"* —
  click **Allow access** and tick **Private networks**.
- Make sure your Wi-Fi is set to a **Private** network profile (Public profiles
  block incoming connections).

**PWA install / offline** behaviour only fully activates on a production build
served over HTTPS — use `npm run build` then `npm run preview`, or the deployed
Cloudflare Pages URL.

## Project layout
```
src/
  types.ts              data contract (matches level-pack.json)
  game/
    scoring.ts          duplicate-letter-SAFE matching + level completion
    dictionary.ts       runtime bonus-word lookup (Set)
    state.ts            sequential progression + localStorage
  ui/
    board.ts            crossword renderer (DOM/CSS grid)
    wheel.ts            swipe letter-wheel (Canvas, pointer events)
  main.ts               app wiring
  style.css             Lexora palette
public/
  level-pack.json       validated level data (fetched at runtime)
  dictionary.txt        runtime bonus-word set
  manifest.webmanifest  PWA manifest
  icons/                app icons (192/512/maskable/apple-touch)
tools/
  fix-names.mjs         proper-noun leak filter (see below)
  names-blocklist.txt   conservative proper-noun-only list
tests/
  scoring.test.ts       duplicate-safe scoring coverage
```

## Key correctness note — duplicate-letter-safe scoring
Words are matched by **consuming a multiset of wheel tiles**, never by
`String.includes()`. So wheel `AEFHRT` (father) makes `heart` but **not**
`hatter` (needs two T's). This is the subtle case the PRD flagged; it's covered
by `tests/scoring.test.ts`.

## Content quality — the names-blocklist finding ⚠️
`step2-findings.md` flagged 18 proper-noun leaks (`eric`, `vera`, `noah`, `han`).
While wiring the fix we learned a **naive names blocklist over-filters**: a broad
195-name list flagged 50 grid words and removed 109 bonus words, because many
common words are also names — `rose`, `ray`, `pat`, `sue`, `lee`, `mac`, `ken`,
`peter`, `cole`, `noel`. Subtracting names from finished output destroys
legitimate words.

**Recommended production fix:** difference-filter names against a curated
common-word frequency dictionary **at generation time** — block a name only if
it fails a word-validity/frequency threshold. `tools/fix-names.mjs` ships a
conservative proper-noun-only list and, crucially, **flags** name-collision grid
words rather than silently dropping them (removing a grid word breaks the
crossword; those levels should be regenerated with the name blocklisted in the
generator).

```bash
cd tools
node fix-names.mjs --pack ../public/level-pack.json \
                   --names names-blocklist.txt \
                   --out ../public/level-pack.clean.json
```

## Deploy (Cloudflare Pages)
Use **“Connect to Git”** (not “Import a repository”). Build command `npm run build`,
output dir `dist`. $0 at v1 scale — static site, build-time generation, no backend.

## Still to do before launch
- [ ] Regenerate pack to **300 levels** with the name difference-filter applied at generation time.
- [ ] Ship the real curated runtime dictionary (SCOWL-derived, name/profanity filtered) as a compressed asset.
- [ ] Regenerate the 12 flagged grid-word levels with names blocklisted.
- [ ] Playtest the wheel gesture on real touch devices; tune hit-radius.
