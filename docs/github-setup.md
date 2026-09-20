# Connect SmartShop to GitHub

This repo is local until you create a **private** GitHub remote named `smartshop`.

**Local path:** `/Users/dhivya/vinod/cursor-projects/smartshop`  
**Intended remote:** `https://github.com/<your-user>/smartshop` (private)

The agent cannot complete GitHub’s browser login for you.

AWS CLI, `aws configure`, and CDK bootstrap are documented in [one-time-setup.md](one-time-setup.md) (not part of `npm run build`).

## 1. Install and sign in to GitHub CLI

```bash
brew install gh          # skip if `gh --version` already works
gh auth login
```

Choose:

1. GitHub.com
2. HTTPS (or SSH if you already use keys)
3. Login with a web browser

Confirm:

```bash
gh auth status
```

If `gh` works but `git push` still fails inside Cursor, use Cursor’s GitHub sign-in / Connect SCM flow to repair IDE credentials.

## 2. First local commit (only if files are not committed yet)

Do **not** commit `.env`, Cognito app secrets (if any), or AWS keys. `.gitignore` already excludes them.

```bash
cd /Users/dhivya/vinod/cursor-projects/smartshop
git status
git add README.md .gitignore docs
git commit -m "Add SmartShop business, technical, and phase use-case docs."
```

Ask the agent to create this commit if you prefer not to run git yourself.

## 3. Create the private GitHub repo and push

From the project folder, after the first commit:

```bash
cd /Users/dhivya/vinod/cursor-projects/smartshop
gh repo create smartshop --private --source=. --remote=origin --push
```

That command:

- creates a **private** repository named `smartshop`
- adds `origin`
- pushes `main`

Open: `https://github.com/<your-user>/smartshop`

### Alternative: create the empty repo in the browser

1. GitHub → New repository → name `smartshop` → **Private**.
2. Do **not** add a README, `.gitignore`, or license (this folder already has them).
3. Then:

```bash
cd /Users/dhivya/vinod/cursor-projects/smartshop
git remote add origin https://github.com/<your-user>/smartshop.git
git push -u origin main
```

## 4. Later work

- Stay on `main` for v1 unless you ask for feature branches.
- The agent will not commit or push unless you ask.
- Never force-push `main`.
- Never add a second remote if `origin` already exists.

```bash
git remote -v
git status
git push
```

## 5. Do not commit

- `.env` / `.env.*`
- Cognito app client secret (v1 uses a public SPA client with no secret)
- AWS access keys, `cdk.context.json` secrets, `.aws/`
- `node_modules/`, `cdk.out/`, `dist/`

## 6. GitHub Actions security check

`.github/workflows/security.yml` runs on pull requests to `main`. It installs workspaces, captures `npm audit` JSON (moderate findings do **not** fail the job), sends that JSON to a Cursor local agent via `@cursor/sdk` (`Agent.prompt`), and commits suggestions under `logs/`.

Add a repository secret:

1. Create an API key at [Cursor Dashboard → API Keys](https://cursor.com/dashboard/integrations)
2. GitHub repo **Settings → Secrets and variables → Actions**
3. Name: `CURSOR_TO_GIT_API_KEY`

Without the secret, the workflow still succeeds and writes a skip note in `logs/npm-audit-suggestions.md`.
