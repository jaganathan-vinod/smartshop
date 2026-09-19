#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

echo "== Phase 0 local checks (no AWS required) =="

test -f .gitignore || fail ".gitignore missing"
grep -q '^\.env$' .gitignore || fail ".env is not ignored"
grep -q '^cdk.out/' .gitignore || fail "cdk.out is not ignored"
ok ".gitignore covers .env and cdk.out"

npm run build --silent || fail "shared Zod types did not typecheck"
ok "@smartshop/shared typecheck"

if ! npm run synth > /tmp/smartshop-synth.log 2>&1; then
  cat /tmp/smartshop-synth.log
  fail "cdk synth failed"
fi
ok "cdk synth"

if [[ ! -d infra/cdk.out ]]; then
  fail "infra/cdk.out was not produced"
fi

if grep -R -E "AKIA[A-Z0-9]{16}" infra/cdk.out >/dev/null 2>&1; then
  fail "possible AWS access key in cdk.out"
fi
ok "cdk.out present; no obvious access keys"

echo
echo "== Phase 0 AWS checks (after cdk deploy) =="

API_URL="${API_URL:-}"
if [[ -z "$API_URL" && -f cdk-outputs.json ]]; then
  API_URL="$(node -e "const o=require('./cdk-outputs.json'); const s=o.SmartShopStack||Object.values(o)[0]; process.stdout.write(s.ApiUrl||'')")"
fi

if [[ -z "$API_URL" ]]; then
  echo "SKIP: deploy first, then re-run with API_URL or cdk-outputs.json"
  echo "  npm run deploy"
  echo "  npm run seed"
  echo "  npm run verify:phase0"
  exit 0
fi

API_URL="${API_URL%/}"
code="$(curl -sS -o /tmp/smartshop-health.json -w '%{http_code}' "$API_URL/v1/health")"
[[ "$code" == "200" ]] || fail "GET /v1/health returned HTTP $code"
node -e "const b=require('/tmp/smartshop-health.json'); if (b.status!=='ok'||b.service!=='smartshop') process.exit(1)"
ok "GET $API_URL/v1/health"

if [[ -f cdk-outputs.json ]]; then
  CF_URL="$(node -e "const o=require('./cdk-outputs.json'); const s=o.SmartShopStack||Object.values(o)[0]; process.stdout.write(s.CloudFrontUrl||'')")"
  POOL="$(node -e "const o=require('./cdk-outputs.json'); const s=o.SmartShopStack||Object.values(o)[0]; process.stdout.write(s.UserPoolId||'')")"
  echo "CloudFront: $CF_URL"
  echo "UserPool:   $POOL"
  echo "Open CloudFront in a browser — you should see the SmartShop placeholder."
fi

ok "Phase 0 verification finished"
