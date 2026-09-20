# Phase 5 — AI shopping assistant

**Goal:** The same shopping journey (browse → cart → quote → confirm → history) through **Amazon Bedrock AgentCore Runtime**, over **text, voice, and image**. Tools reach SmartShop with **service-to-service IAM** (not customer JWT, not in-process Converse in the shopping Lambda).

**Related:** [project-technical-requirements.md](../project-technical-requirements.md) §2.1, §2.4, §5.6–5.8

---

## Architecture (locked for Phase 5)

| Decision | Choice |
| --- | --- |
| Assistant host | AgentCore Runtime in `ap-southeast-1` |
| Text + image | `InvokeAgentRuntime` (HTTP / streamed response) |
| Voice | Runtime WebSocket + Amazon Nova Sonic (speech-to-speech, barge-in) |
| Shopping system of record | Existing Lambda modules (`catalog`, `cart`, `pricing`, `orders`) |
| Tool integration (v1) | **Service-to-service:** Runtime IAM role → IAM-authenticated internal tool API (or `lambda:InvokeFunction`) |
| Customer identity | Cognito JWT on Runtime **inbound**. Runtime injects `userId` = JWT `sub`. Tools **never** accept `userId` from the model. |
| Public REST | **Frozen** JWT `/v1/cart`, `/v1/quotes`, `/v1/orders`, `/v1/me`, admin — same contracts as today |
| Existing SPA | **Frozen** all shopping/auth routes except replacing the `/chat` stub |
| Deferred | AgentCore Gateway MCP wrapping public APIs; OAuth on-behalf-of / token passthrough |

Same cart and orders as the web. Admin APIs are not tools. Confirmation guard stays in **code** (Runtime harness + `confirm: true` on orders).

**Compatibility:** Phase 5 must not change existing catalogue, cart, checkout, orders, login, CORS, or JWT authorizers. See technical requirements §2.4 and US-5.08.

**Build order:** internal IAM tools → text Runtime → SPA `/chat` → confirmation/pricing tests → image → voice. Voice and image use the same tool list as text; they are not a second checkout. After each slice, existing Phase 4 web flows and existing unit tests must still pass.

---

## US-5.01 Text shopping on AgentCore Runtime

**Title:** Browse, cart, quote, confirm, and history via text  
**Actor:** Customer  
**Story:** As a customer, I want to search, cart, quote, confirm, and view history in `/chat` using AgentCore Runtime and the same cart/order data as the web.

**Preconditions**

- Signed in (Cognito email/password JWT).
- AgentCore Runtime and Bedrock model access in `ap-southeast-1`.
- Cart and order modules from Phases 2–3.
- Internal IAM tool API from US-5.04.

**Main flow**

1. Customer opens `/chat` (or drawer) and sends a text message.
2. SPA calls AgentCore Runtime (`InvokeAgentRuntime`) with the Cognito JWT and `{ conversationId?, message }`.
3. Runtime runs the model with tools: search, get product, cart mutations, set delivery, get quote, confirm order, list/get orders.
4. Each tool call is IAM service-to-service into SmartShop with `X-SmartShop-User-Id` set from the inbound JWT `sub`.
5. Reply is shown; `toolsUsed` is returned for debugging.

**Acceptance criteria**

- Adding an item in chat appears in `GET /v1/cart` on the web.
- Search results come from the catalogue, not hallucinated SKUs.
- Unauthenticated Runtime invoke returns 401.
- Tool loop stops by 8 iterations.
- The shopping Lambda does **not** host the Bedrock Converse loop.

**APIs / screens**

- AgentCore Runtime invoke (ARN / URL in `config.json`)
- `/chat` or chat drawer
- Tools in technical requirements §5.7

**Out of scope**

- Multi-user shared carts.
- AgentCore Gateway as the tool plane (deferred).

---

## US-5.02 Confirmation guard

**Title:** Assistant will not place an order until the customer says yes  
**Actor:** Customer  
**Story:** As a customer, I want the assistant to show a real quote and refuse `confirm_order` until I say yes (typed, tapped, or spoken).

**Preconditions**

- Cart is non-empty.

**Main flow**

1. Customer asks to check out or “buy it” (any modality).
2. Assistant **must** call `get_quote` (after delivery is known, or STANDARD only if the user chose it).
3. Assistant presents subtotal, discount, delivery, tax, total (text UI bubble and/or spoken).
4. If the user has not explicitly confirmed, `confirm_order` is rejected by the **Runtime harness** (not only the prompt). The app still requires `confirm: true`.
5. After a clear yes (“yes, place it”, confirm control, or equivalent spoken yes), `confirm_order` runs with `confirm: true`.
6. Reply includes `orderNumber`.

**Acceptance criteria**

- Calling `confirm_order` without a prior quote in the conversation → tool error, no order.
- Calling `confirm_order` without an explicit user yes after that quote → tool error, no order.
- Prompt-only instructions are not sufficient; the guard is in code.
- Successful path returns the same order shape as `POST /v1/orders`.
- Spoken yes is accepted only after a quote was presented in that session.

**APIs / screens**

- `confirm_order` tool → internal tools → `orders` module
- `/chat` confirm control that sends an explicit confirm turn

**Out of scope**

- Implied consent from “sounds good”; v1 requires an explicit confirm phrase, spoken yes, or yes/no control.

---

## US-5.03 Prices only from the pricing engine

**Title:** Assistant never invents money figures  
**Actor:** Customer  
**Story:** As a customer, I want assistant prices to come only from the pricing engine (never invented).

**Preconditions**

- System prompt forbids inventing prices.

**Main flow**

1. Customer asks “how much is my cart with express?” (text or voice).
2. Assistant calls `get_quote` with `EXPRESS`.
3. Reply copies cent fields from the tool result (formatted for display or speech).

**Acceptance criteria**

- Unit tests / fixture: model output that states a total not present in the last quote is treated as a failure in evaluation, or the UI prefers rendering the structured `breakdown` from the tool over free text.
- `toolsUsed` includes `get_quote` whenever a total is shown or spoken.
- Premium discount in chat matches web quote for the same cart and delivery.

**APIs / screens**

- Quote tool, checkout-equivalent chat bubble with structured breakdown

**Out of scope**

- Fine-tuned custom model.

---

## US-5.04 Service-to-service tool integration

**Title:** Runtime calls SmartShop with IAM; `userId` is not a model argument  
**Actor:** Engineer  
**Story:** As an engineer, I want AgentCore Runtime to invoke SmartShop as a trusted service so tools reuse cart/pricing/orders without wrapping public JWT APIs.

**Preconditions**

- Shopping Lambda and HTTP API from Phases 0–3.

**Main flow**

1. CDK adds a **new explicit** route `POST /v1/internal/assistant/tools` with an IAM authorizer. `/{proxy+}` and `JWT_PROTECTED_METHODS` stay as they are.
2. CDK grants the Runtime execution role permission to SigV4 that route (and/or `lambda:InvokeFunction` as an equivalent private path).
3. Runtime verifies the inbound Cognito JWT, then calls the internal route with `{ conversationId, tool, args }` and header `X-SmartShop-User-Id: <sub>`.
4. Lambda accepts internal tools **only** from IAM (not the customer JWT authorizer). JWT `withClaims` behaviour for existing routes is unchanged.
5. Domain modules run as that `userId`. `args` must not contain `userId`; if present it is ignored. Existing Hono cart/quote/order routes are not edited.

**Acceptance criteria**

- Customer JWT cannot call `/v1/internal/*` (401/403).
- IAM caller without `X-SmartShop-User-Id` is rejected.
- A tool payload that includes a different `userId` still mutates only the inbound `sub`’s cart.
- Admin product/premium routes are not registered as tools.
- Public `/v1/cart`, `/v1/quotes`, `/v1/orders`, `/v1/me`, and `/v1/admin/*` stay JWT-only with the same request/response shapes.
- `GET /v1/health` and `GET /v1/products*` stay unauthenticated.
- Existing pricing, orders, authz, and catalog unit tests still pass.

**APIs / screens**

- `POST /v1/internal/assistant/tools` (IAM)
- Technical requirements §5.8

**Out of scope**

- AgentCore Gateway MCP targets for public `/v1/*`.
- On-behalf-of token exchange or JWT passthrough to the shopping API (future).

---

## US-5.05 Image-assisted shopping

**Title:** Identify a product from a photo and continue the same journey  
**Actor:** Customer  
**Story:** As a customer, I want to upload a product photo so the assistant can find catalogue matches and then cart, quote, and confirm like text chat.

**Preconditions**

- Signed in. Text Runtime path (US-5.01) works.
- Vision-capable model on Runtime.

**Main flow**

1. Customer attaches an image in `/chat` (or takes a photo).
2. SPA uploads to S3 via a customer-JWT presign (`POST /v1/assistant/uploads`), then invokes Runtime with `{ conversationId, message?, imageObjectKey }`.
3. Runtime fetches the object (IAM), sends image + text to the model.
4. Model uses `search_products` / `get_product` (not invented SKUs), then the usual cart/quote/confirm tools.

**Acceptance criteria**

- Unauthenticated upload or invoke returns 401.
- Matches are existing catalogue products; unknown items say so and do not add a fake SKU.
- Adding from a photo appears in `GET /v1/cart`.
- Images are not stored longer than needed for the turn (lifecycle rule on the upload prefix).
- Lambda / API Gateway payload limits are not used to send raw image bytes; object key or Runtime multimodal payload only.

**APIs / screens**

- `POST /v1/assistant/uploads` (customer JWT) → `{ uploadUrl, objectKey }`
- Runtime multimodal invoke
- `/chat` image attach

**Out of scope**

- Visual embedding / k-NN catalogue search (OpenSearch, S3 Vectors).
- Receipt OCR shopping lists as a dedicated feature (v1 is one product photo → search).

---

## US-5.06 Voice-assisted shopping

**Title:** Speak the same shopping journey  
**Actor:** Customer  
**Story:** As a customer, I want to talk to the assistant (search, cart, hear a quote, say yes) over a live voice session that uses the same tools as text.

**Preconditions**

- Signed in. Text Runtime path (US-5.01) and confirmation guard (US-5.02) work.
- Nova Sonic (or equivalent speech-to-speech) enabled in `ap-southeast-1`.

**Main flow**

1. Customer starts voice on `/chat`.
2. SPA opens AgentCore Runtime **WebSocket** (`/ws`) with the Cognito JWT.
3. Nova Sonic streams audio both ways; tool calls still go IAM service-to-service with injected `userId`.
4. Quote totals are spoken from `get_quote` fields; confirm still requires explicit spoken yes after the quote.

**Acceptance criteria**

- Voice add-to-cart appears in `GET /v1/cart`.
- Barge-in / interrupt does not double-submit confirm (idempotency: Runtime `sessionId` + turn).
- Unauthenticated WebSocket is rejected.
- Voice is **not** proxied through the 30s shopping Lambda.

**APIs / screens**

- AgentCore Runtime WebSocket
- `/chat` push-to-talk or live voice control

**Out of scope**

- Phone / PSTN / Alexa skill.
- Offline dictation-only (Transcribe sandwich) as the v1 architecture — allowed only as a local fallback, not the production path.

---

## US-5.07 Shared session across modalities

**Title:** One conversation can mix text, image, and voice  
**Actor:** Customer  
**Story:** As a customer, I want to type, then attach a photo, then speak confirm without losing cart or the last quote.

**Preconditions**

- US-5.01, US-5.05, and US-5.06.

**Main flow**

1. Customer starts a conversation (Runtime `runtimeSessionId` mapped to `conversationId`).
2. A later image or voice turn reuses that id.
3. Quote-presented and pending delivery flags live in DynamoDB `Conversations` (and/or AgentCore Memory as a cache), keyed by `userId` + `conversationId`.

**Acceptance criteria**

- Cart is the server-side cart (one per user), not per modality.
- Confirm guard still sees the quote from an earlier text or voice turn.
- Starting a new chat session does not reuse another customer’s session.

**APIs / screens**

- Same Runtime session id across `/chat` text, image, and voice

**Out of scope**

- Resuming a voice WebSocket after the browser tab is fully closed (new socket, same `conversationId`, is enough).

---

## US-5.08 Existing web shopping unchanged

**Title:** Phase 5 does not regress catalogue, cart, checkout, orders, or login  
**Actor:** Customer / engineer  
**Story:** As a customer, I want the current website to work exactly as it does today after the assistant ships.

**Preconditions**

- Phases 1–4 and 6 behaviour is already live.
- Phase 5 assistant work is in progress or deployed.

**Main flow**

1. Visitor browses home, category, and product pages without signing in.
2. Customer signs up / confirms / logs in as today.
3. Customer uses **web** cart → checkout (delivery + breakdown + Place order) → order history — not `/chat`.
4. Admin still uses the same admin APIs (no assistant tools).

**Acceptance criteria**

- Public catalogue GET still has no JWT.
- Cart, quote, and order HTTP paths, status codes, and JSON shapes are unchanged (`confirm: true`, `Idempotency-Key`, premium 10% merchandise only).
- CORS preflight (OPTIONS) still succeeds without `Authorization` (JWT list still excludes OPTIONS/ANY).
- CloudFront SPA still loads; `config.json` still supplies `apiUrl`, `userPoolId`, `userPoolClientId`, `region`. Extra Runtime keys are optional.
- Routes other than `/chat` keep current UI behaviour (mint storefront, ratings, hero, checkout confirm control).
- `/chat` stays behind `Protected` (signed-in only). Only `ChatPage` contents change.
- Existing unit tests (pricing, orders, authz, catalog, SPA validation) pass without contract edits.
- Customer JWT cannot call `/v1/internal/*`. Internal IAM cannot call `/v1/admin/*`.

**APIs / screens**

- All Phase 1–4 APIs and SPA routes except the `/chat` stub
- Technical requirements §2.4

**Out of scope**

- Redesign of home, cart, or checkout to “match” the assistant UI.

