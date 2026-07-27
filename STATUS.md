# Lexora — Project Status

_Last updated: 21 Jul 2026_

## Where things stand

| Milestone | Status |
|---|---|
| PRD → validated level pack | ✅ |
| Lexora brand + icons | ✅ |
| Full PWA client built + tested | ✅ |
| Pushed to GitHub | ✅ `github.com/tessera11/Lexora` |
| **Live on Cloudflare Pages** | ✅ `Lexora-9up.pages.dev` |
| Auto-deploy on push | ✅ (Connect to Git) |
| **Scaled to 300 levels** | ✅ verified live (`Levels live: 300`) |
| **Proper-noun leak closed** | ✅ verified live (`CLEAN - 0 leaks`) |

From here, any change is just `git add . && git commit -m "..." && git push` — live in ~2 min.

## Live URL
🔗 https://Lexora-9up.pages.dev/

## 300-level generation — verified results (21 Jul 2026)
Clean frequency-ordered dictionary: 23,247 words.

| Tier | Produced | Scanned | Yield |
|---|---|---|---|
| Easy | 90/90 | 102 | 88% |
| Medium | 110/110 | 121 | 91% |
| Hard | 100/100 | 119 | 84% |
| **Total** | **300/300** | **342** | **88%** |

- Every tier hit target without exhausting its candidate pool → large headroom
  (used 102/374 easy, 121/1599 medium, 119/3177 hard). Scaling to 500+ later
  needs no rank-window changes.
- Name filter applied at **generation time** (in `isCleanWord`), so blocked names
  are never eligible → cannot orphan grid words. `eric`/`vera`/`noah`/`han` +
  focused name set added; live pack verified 0 leaks across 300 levels.
- Runtime bonus-word dictionary: 2,746 words.

## Regenerate levels (from the Lexora project root)
The project doubles as the build-time content factory. Generator inputs
(`data/`) and outputs (`output/`) are git-ignored — regenerate, don't version.

```bash
node src/build-level-pack.mjs                                   # → output/level-pack.json + tier-stats.json
node src/build-dictionary.mjs output/level-pack.json output/dictionary.txt
# copy into the app, then commit/push:
copy output\level-pack.json public\level-pack.json
copy output\level-pack.json src\data\level-pack.json
copy output\dictionary.txt   public\dictionary.txt
```
Generator deps (dev-only): `crossword-layout-generator`, `word-list`.
Data inputs: `data/en_50k.txt` (hermitdave FrequencyWords), `data/profanity.txt` (LDNOOBW).

## Deploy workflow (recap)
- **Production:** pushes to `main` → auto-deploy to `Lexora-9up.pages.dev`.
- **Previews:** pushes to any other branch → unique preview URL (safe playtesting).
- **Rollback:** Cloudflare dashboard → project → Deployments → pick a good build → Rollback.

## Remaining polish (optional, non-blocking)
- [ ] Ship a real curated runtime dictionary (SCOWL-derived, name/profanity
      filtered) to broaden bonus-word discovery beyond the 2,746-word set.
- [ ] Drop in a real names dataset via `data/names.txt` (generator already reads it).
- [ ] Wordmark clip fix + full favicon/splash set (cosmetic).
- [ ] Playtest the wheel gesture on real touch devices; tune hit-radius.

## Deferred to later phases (per PRD)
- Accounts, cross-device sync, leaderboards.
- Coin economy / power-up store.
- Ads, IAP, monetisation (v1 is PWA-first, monetise later).
- Native TWA wrapper (Bubblewrap, mirroring Tessera v1.5).
