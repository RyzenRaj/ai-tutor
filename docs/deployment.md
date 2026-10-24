# GitHub and Vercel workflow

Target repository: `https://github.com/RyzenRaj/ai-tutor` · Hosting: Vercel (Git integration).

## Status (2026-10-24)

| Item | Status | Evidence |
|---|---|---|
| Local repo | ✓ `main` + `feature/quality-teaching-voice` | `git log` |
| GitHub remote | ✗ not configured | no `origin`; this build session has no GitHub credentials |
| `RyzenRaj/ai-tutor` | not public | logged-out browser: 404; not in the account's public repo list. It is private or not created yet |
| CI workflow | written, **not yet run on GitHub** | `.github/workflows/ci.yml`; same steps pass locally on a fresh clone |
| Vercel project | ✗ not linked | no `.vercel/`, no token |

## 1. Push (owner, one time)

The repository with full history is provided as a git bundle (`ai-tutor.bundle`). On Windows PowerShell:

```powershell
cd D:\learning
git clone ai-tutor.bundle ai-tutor
cd ai-tutor
git checkout feature/quality-teaching-voice
git checkout main
git remote set-url origin https://github.com/RyzenRaj/ai-tutor.git
git ls-remote origin
```

- If `git ls-remote` prints nothing (new, empty repo): continue.
- If it lists branches, **stop**: the remote already has history. Don't force-push; compare first.

```powershell
git push -u origin main
git push -u origin feature/quality-teaching-voice
```

Create the repository on GitHub first if it doesn't exist (private is fine; no README, so it stays empty). Authenticate with Git Credential Manager or `gh auth login`. Never paste tokens into chat or commit them.

## 2. Protect `main`

GitHub → Settings → Branches → Add rule for `main`:

- Require a pull request before merging (1 approval if you have a reviewer).
- Require status checks: **Lint, types, unit + integration, build** and **End-to-end (Playwright, deterministic fixtures)**.
- Block force pushes and deletions.

## 3. Open the pull request

```powershell
gh pr create --base main --head feature/quality-teaching-voice --title "Quality, teaching flow and voice" --body-file docs/quality/findings-2026-10-24.md
```

(or GitHub → Compare & pull request). CI runs on the PR. Merge only when both checks are green and the PR template's review boxes are honestly ticked.

## 4. Vercel

1. vercel.com → Add New → Project → import `RyzenRaj/ai-tutor`. Framework: Next.js (detected). Root directory: repo root. Build command / output: defaults.
2. Settings → Git: production branch `main`. Every PR gets a preview deployment automatically.
3. Settings → Environment Variables (never `NEXT_PUBLIC_*` for secrets):

   | Variable | Preview | Production |
   |---|---|---|
   | `OPENROUTER_API_KEY` | separate key, or leave empty (demo mode) | production key |
   | `OPENROUTER_MODEL` | `openrouter/free` | `openrouter/free` (paid models need `OPENROUTER_ALLOW_PAID=true`) |
   | `KOKORO_TTS_URL` | optional | optional, https only |
   | `RATE_LIMIT_PER_MINUTE`, `LIVE_AI_MAX_PER_MINUTE` | defaults | defaults |

4. Release flow: PR → CI + preview deployment → smoke-test the preview (`REVIEW_URL=<preview url> npm run review:browser`) → approve and merge → Vercel deploys `main` to production → check production (home page loads, `/api/status`, one lesson end to end).

Vercel's free Hobby plan covers this app's usage today (serverless functions, no GPU, no database). Live AI uses free OpenRouter models only unless you opt in to paid ones. Running a Kokoro voice server is separate (see ADR 0006).
