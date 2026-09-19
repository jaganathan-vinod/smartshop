# SmartShop

Startup e-commerce MVP: customers sign up and sign in with Amazon Cognito (email and password), browse a catalogue, manage a cart, preview delivery and premium pricing, confirm an order, and repeat that journey through an in-app AI assistant.

**Status:** documentation only. Application and AWS infrastructure are not built yet.

## Project path

`/Users/dhivya/vinod/cursor-projects/smartshop`

## Documentation

| Document | Description |
| --- | --- |
| [docs/project-business-requirements.md](docs/project-business-requirements.md) | Product, actors, pricing, scope |
| [docs/project-technical-requirements.md](docs/project-technical-requirements.md) | Architecture, data model, APIs |
| [docs/usecase-stories/](docs/usecase-stories/) | Use-case stories per implementation phase |
| [docs/github-setup.md](docs/github-setup.md) | Connect this folder to a private GitHub repo |

## Stack (v1)

- Frontend: React, TypeScript, Vite on S3 + CloudFront
- API: API Gateway HTTP API
- Backend: Node.js TypeScript Lambda (modular monolith)
- Data: DynamoDB
- Auth: Amazon Cognito User Pool (email + password, self-service sign-up)
- Validation: Zod
- Assistant: Amazon Bedrock (tool calling into the same domain modules)
- Checkout: simulated (no real payments)

## Next step

After you review the docs, say when to start Phase 0 (CDK foundation). To publish the repo, follow [docs/github-setup.md](docs/github-setup.md).
