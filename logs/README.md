# Audit logs

The security workflow writes these files on the runner only. It does **not** commit them. They are posted on the PR as a comment and uploaded as the Actions artifact `npm-audit-cursor-suggestions`.

| File | Source |
| --- | --- |
| `npm-audit.json` | `npm audit --workspaces --include-workspace-root --json` |
| `npm-audit-suggestions.md` | `@cursor/sdk` `Agent.prompt` (advice only; no auto-fix) |

The check does not fail for moderate `npm audit` findings, so the agent step can still run. Set repository secret `CURSOR_TO_GIT_API_KEY` (Cursor Dashboard → API Keys).
