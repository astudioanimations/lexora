# Lexora — Deploy Runbook (Cloudflare Pages)

Get Lexora live on a public HTTPS URL for **$0**. Mirrors the Tessera deploy
path. Total time: ~10–15 minutes.

> **Why HTTPS matters:** the PWA (install prompt, offline service worker, and
> the phone “Add to Home Screen” experience) only fully activates over HTTPS.
> Cloudflare Pages gives you that automatically.

---

## Prerequisites
- The `Lexora/` project on your machine, running locally (`npm run dev` works).
- A **GitHub** account.
- A **Cloudflare** account (free tier is fine — you already have one from Tessera).
- **Git** installed (`git --version` to check; https://git-scm.com if not).

---

## Step 1 — Put the project on GitHub

From inside the `Lexora/` folder:

```bash
# make sure build artefacts and deps aren't committed
printf "node_modules/\ndist/\n.DS_Store\n" > .gitignore

git init
git add .
git commit -m "Lexora v1 — initial commit"
```

Create a **new, empty** repo on GitHub (github.com → New repository):
- Name: `Lexora`
- **Do NOT** add a README, .gitignore, or licence (keep it empty so the push is clean).

Then link and push (replace `YOUR-USERNAME`):

```bash
git remote add origin https://github.com/YOUR-USERNAME/Lexora.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Create the Cloudflare Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** tab.
2. Click **⚠️ “Connect to Git”** — **NOT** “Import an existing Git repository /
   Direct Upload”. This is the exact gotcha you hit with Tessera: the
   *Connect to Git* flow is what wires up auto-deploy on every push.
3. Authorise GitHub, then select the **`Lexora`** repo.

---

## Step 3 — Build settings

When prompted, set:

| Field | Value |
|---|---|
| **Framework preset** | `None` (or `Vite` if offered) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | *(leave blank)* |
| **Node version** | 18 or higher (see note below) |

> **Pin the Node version** to avoid surprises: add an env var
> **`NODE_VERSION`** = `20` (Settings → Environment variables), or commit a
> `.nvmrc` file containing `20`. This guarantees Cloudflare builds with the same
> Node major you develop on.

Click **Save and Deploy**. Cloudflare runs `npm install` → `npm run build` and
publishes `dist/`.

---

## Step 4 — Verify the live site

You’ll get a URL like `https://lexora-dw0.pages.dev` (and a per-deploy preview URL).

Check:
- [ ] Board + wheel render, level 1 (“father”) loads.
- [ ] `level-pack.json` and `dictionary.txt` load (open DevTools → Network; no 404s).
- [ ] **Install prompt** appears (Chrome: address-bar install icon; iOS Safari:
      Share → Add to Home Screen).
- [ ] **Offline test:** load once, then DevTools → Network → *Offline* → reload.
      The service worker should serve it from cache.
- [ ] **Lighthouse → PWA** audit passes (DevTools → Lighthouse → Progressive Web App).

---

## Step 5 — Continuous deploy (already on)

Because you used **Connect to Git**, every push auto-deploys:

```bash
git add .
git commit -m "tweak wheel hit-radius"
git push
```

- Pushes to **`main`** → production (`https://lexora-dw0.pages.dev`).
- Pushes to any **other branch** → a unique preview URL (great for playtesting a
  change before it goes live).

---

## Optional — custom domain
Pages project → **Custom domains** → add e.g. `Lexora.app` or a subdomain.
If the domain is already on Cloudflare, DNS is auto-configured; otherwise follow
the CNAME instructions shown.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails on `tsc` errors | Run `npm run build` locally first; fix TS errors, commit, push. |
| `vite: not found` in build log | Ensure `vite` + `vite-plugin-pwa` are in `devDependencies` (they are) and that `dist/` / `node_modules/` are **gitignored**, not committed. |
| Blank page, 404 on `level-pack.json` | Confirm the file is in **`public/`** (Vite copies `public/` → `dist/` root). It is in this project. |
| Service worker serves stale content after deploy | `registerType: "autoUpdate"` is set, so it self-updates; a hard refresh (Ctrl+Shift+R) forces it immediately. |
| Wrong Node version building | Set `NODE_VERSION=20` env var or add `.nvmrc`. |

---

## Rollback
Pages keeps every deploy. Project → **Deployments** → pick a previous good one →
**Rollback**. Zero downtime, no Git revert needed.
