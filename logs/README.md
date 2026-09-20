# Audit logs

GitHub Actions writes npm audit output and Cursor SDK suggestions here on pull requests to `main`.

| File | Source |
| --- | --- |
| `npm-audit.json` | `npm audit --workspaces --include-workspace-root --json` |
| `npm-audit-suggestions.md` | `@cursor/sdk` `Agent.prompt` (advice only; no auto-fix) |

The security workflow does not fail the check for moderate `npm audit` findings, so the agent step can still run. Set repository secret `CURSOR_TO_GIT_API_KEY` (Cursor Dashboard → API Keys).
