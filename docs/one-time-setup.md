# One-time machine setup

Run these commands **once per laptop** (or once per AWS account/region for bootstrap). They are **not** part of `npm run build`, `npm run synth`, `npm run deploy`, or `npm run verify:phase0`.

Do not put access keys, secret keys, or the 12-digit account ID into this repo.

Related: [github-setup.md](github-setup.md) (GitHub remote). After this file is done, Phase 0 deploy is `npm run deploy` from the repo root.

---

## 1. Node.js

This repo expects Node 20 or newer (see `.nvmrc`).

```bash
cd /Users/dhivya/vinod/cursor-projects/smartshop
nvm use
node -v    # should be v20+
```

Install nvm from [nvm](https://github.com/nvm-sh/nvm) if `nvm` is missing, then `nvm install`.

---

## 2. Homebrew (macOS)

Needed for `gh` and `awscli` if they are not already installed.

```bash
brew --version
```

---

## 3. GitHub CLI (if you will push)

Skip if `gh auth status` already shows a valid login.

```bash
brew install gh
gh auth login          # GitHub.com → HTTPS or SSH → browser
gh auth status
```

Full remote steps: [github-setup.md](github-setup.md).

If `gh` reports an invalid keyring token:

```bash
gh auth refresh -h github.com
```

---

## 4. AWS CLI

`aws` was not on PATH on the Phase 0 machine until this step.

```bash
brew install awscli
aws --version
```

---

## 5. AWS credentials

Creates `~/.aws/credentials` and `~/.aws/config` **outside the repo**. Never copy those files into SmartShop.

```bash
aws configure
```

When prompted:

| Prompt | Value |
| --- | --- |
| AWS Access Key ID | IAM user (or SSO-exported) access key, **not** the account ID |
| AWS Secret Access Key | matching secret |
| Default region name | `ap-southeast-1` |
| Default output format | `json` |

Prefer an IAM user (or Identity Center) with rights to CloudFormation, IAM, Lambda, API Gateway, Cognito, DynamoDB, S3, CloudFront, and SSM. Do not use the root account for daily deploy.

---

## 6. Confirm the caller

```bash
aws sts get-caller-identity
```

Expect JSON with `Account` (12 digits), `UserId`, and `Arn`. If you get `command not found`, go back to step 4. If you get `InvalidClientTokenId` / `ExpiredToken`, re-run `aws configure` (or refresh SSO).

You do **not** need to paste `Account` into chat or into git. Use it only locally in the next command.

---

## 7. CDK bootstrap (once per AWS account + region)

CDK needs a bootstrap stack in `ap-southeast-1` before the first `cdk deploy`.

```bash
cd /Users/dhivya/vinod/cursor-projects/smartshop
npm install

export CDK_DEFAULT_REGION=ap-southeast-1
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
npx cdk bootstrap "aws://${ACCOUNT}/ap-southeast-1"
```

Re-run bootstrap only if you change account, region, or CDK bootstrap version. Do not add this to `package.json` scripts.

---

## After one-time setup (recurring, in the build)

These **are** project scripts. They assume steps 1–7 already succeeded.

```bash
cd /Users/dhivya/vinod/cursor-projects/smartshop
npm install
npm run synth
npm run verify:phase0    # local typecheck + synth; health check only if already deployed
npm run deploy           # creates/updates SmartShopStack; writes gitignored cdk-outputs.json
npm run seed
npm run verify:phase0    # now includes GET /v1/health
```

Cognito admin group and premium toggle: [runbook.md](runbook.md).

---

## Do not

- Commit `.env`, `~/.aws/credentials`, `cdk-outputs.json`, or access keys
- Put `aws configure`, `aws sts`, or `cdk bootstrap` in `npm run build`
- Hard-code an AWS account ID in source or docs
