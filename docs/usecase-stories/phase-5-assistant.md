# Phase 5 — AI shopping assistant

**Goal:** The same shopping journey through Amazon Bedrock, using in-process tools over the same domain modules as the HTTP API.

---

## US-5.01 Full shopping journey in chat

**Title:** Browse, cart, quote, confirm, and history via assistant  
**Actor:** Customer  
**Story:** As a customer, I want to search, cart, quote, confirm, and view history through chat using the same modules as the API.

**Preconditions**

- Valid customer JWT.
- Bedrock model access in `ap-southeast-1`.
- Cart and order modules from Phases 2–3.

**Main flow**

1. Customer opens `/chat` (or drawer) and sends a message.
2. SPA `POST /v1/assistant/messages` with `{ conversationId?, message }`.
3. Assistant module runs Bedrock Converse with tools: search, get product, cart mutations, set delivery, get quote, confirm order, list/get orders.
4. Tools call in-process functions with the JWT `userId` (not API Gateway).
5. Reply is shown; `toolsUsed` is returned for debugging.

**Acceptance criteria**

- Adding an item in chat appears in `GET /v1/cart` on the web.
- Search results come from the catalogue module, not hallucinated SKUs.
- Unauthenticated chat returns 401.
- Tool loop stops by 8 iterations.

**APIs / screens**

- `POST /v1/assistant/messages`
- `/chat` or chat drawer
- Tools listed in technical requirements §5.7

**Out of scope**

- Voice, image upload, multi-user shared carts.

---

## US-5.02 Confirmation guard

**Title:** Assistant will not place an order until the customer says yes  
**Actor:** Customer  
**Story:** As a customer, I want the assistant to show a real quote and refuse `confirm_order` until I say yes.

**Preconditions**

- Cart is non-empty.

**Main flow**

1. Customer asks to check out or “buy it”.
2. Assistant **must** call `get_quote` (after delivery is known or defaulting STANDARD only if the user chose it).
3. Assistant presents subtotal, discount, delivery, tax, total in the reply.
4. If the user has not explicitly confirmed, `confirm_order` is rejected by the **assistant module** (not only the prompt).
5. After a clear yes (“yes, place it”), `confirm_order` runs with `confirm: true`.
6. Reply includes `orderNumber`.

**Acceptance criteria**

- Calling `confirm_order` without a prior quote in the conversation → tool error, no order.
- Calling `confirm_order` without an explicit user yes after that quote → tool error, no order.
- Prompt-only instructions are not sufficient; the guard is in code.
- Successful path returns the same order shape as `POST /v1/orders`.

**APIs / screens**

- `POST /v1/assistant/messages`
- `confirm_order` tool → `orders` module

**Out of scope**

- Implied consent from “sounds good”; v1 requires an explicit confirm phrase or yes/no control in the UI that sends a confirm message.

---

## US-5.03 Prices only from the pricing engine

**Title:** Chat never invents money figures  
**Actor:** Customer  
**Story:** As a customer, I want chat prices to come only from the pricing engine (never invented).

**Preconditions**

- System prompt forbids inventing prices.

**Main flow**

1. Customer asks “how much is my cart with express?”.
2. Assistant calls `get_quote` with `EXPRESS`.
3. Reply copies cent fields from the tool result (formatted for display).

**Acceptance criteria**

- Unit tests / fixture: model output that states a total not present in the last quote is treated as a failure in evaluation, or the UI prefers rendering the structured `breakdown` from the tool over free text.
- `toolsUsed` includes `get_quote` whenever a total is shown.
- Premium discount in chat matches web quote for the same cart and delivery.

**APIs / screens**

- Quote tool, checkout-equivalent chat bubble with structured breakdown

**Out of scope**

- Fine-tuned custom model.
