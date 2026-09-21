# SmartShop — Project Business Requirements

**Product:** SmartShop  
**Version:** v1 (MVP)  
**Status:** Approved for documentation; application not built yet  
**Repo:** `/Users/dhivya/vinod/cursor-projects/smartshop`

## 1. Purpose

SmartShop lets customers create an account in Amazon Cognito (email and password), shop a product catalogue, manage a cart, choose delivery, preview a complete price breakdown (including a 10% premium discount when eligible), place an order only after explicit confirmation, receive an order number, retrieve past orders, and complete the same journey through an AI assistant over **text, voice, or image**.

## 2. Goals

- Demonstrate a complete, trustworthy checkout path on the web and through the assistant (text, voice, image).
- Use one pricing engine so web and chat never disagree on money.
- Keep v1 small: simulated checkout, seeded catalogue plus admin APIs, no merchant UI.

## 3. Success criteria

A signed-in customer (Cognito email and password) can complete:

**Browse → cart → delivery choice → price preview → explicit confirm → order number → order history**

on the web **and** through the assistant (typed chat, spoken turns, or a product photo that resolves to catalogue SKUs). Premium customers see 10% off merchandise (not delivery) in the preview and on the confirmed order.

## 4. Actors

| Actor | Description |
| --- | --- |
| **Visitor** | Unauthenticated person. May browse and search the catalogue. Cannot mutate a cart or place an order. |
| **Customer** | Shopper with a Cognito User Pool account (email + password). May have `isPremium`. Owns a server-side cart and order history. |
| **Admin** | Cognito group `admin`. Creates/updates products and toggles premium flags via API (Postman/curl in v1). No admin UI. |
| **Assistant** | Amazon Bedrock AgentCore Runtime (text, voice, image) acting **as the signed-in customer**. Tools call SmartShop over IAM service-to-service with `userId` injected from the Cognito JWT. Cannot bypass confirmation, invent prices, or call admin APIs. |

## 5. Customer capabilities

1. Sign up with email, password, and profile details, then sign in. Credentials are stored and verified by the Cognito User Pool (not by SmartShop’s own database).
2. Browse and search the product catalogue (name and category; case-insensitive contains on a small seeded set).
3. Add, update, and remove products from the shopping cart.
4. Select **standard** or **express** delivery.
5. Receive a **10% discount** if they are a premium customer.
6. Preview the **complete price breakdown** before placing an order.
7. Place an order only after **explicit confirmation**.
8. Receive an **order number**.
9. Retrieve **previous orders**.
10. Perform the same shopping journey through an **AI assistant** using text, voice, and/or a product image.

## 6. Pricing rules

All money in the product is stored and transported as integer **cents** in USD.

```
subtotalCents        = sum(unitPriceCents × quantity)
premiumDiscountCents = isPremium ? floor(subtotalCents × 0.10) : 0
deliveryCents        = STANDARD 499 | EXPRESS 1299
taxCents             = 0
totalCents           = subtotalCents − premiumDiscountCents + deliveryCents + taxCents
```

| Rule | Detail |
| --- | --- |
| Premium discount | 10% of merchandise subtotal only. Delivery is never discounted. |
| Tax | v1 always returns `taxCents: 0` so the breakdown shape is stable. |
| Standard delivery | $4.99, 3–5 days (`STANDARD`). |
| Express delivery | $12.99, 1–2 days (`EXPRESS`). |
| Quotes | Not stored as durable offers. Checkout **re-prices** at confirm time. |
| Snapshots | Item names, quantities, unit prices, and the full breakdown are copied onto the order. Later catalogue edits do not rewrite history. |

## 7. Checkout and confirmation

- Checkout is **simulated**. No card capture, Stripe, or real money movement.
- Placing an order persists a `CONFIRMED` order and returns a human order number, for example `SS-20260919-00041`.
- The API accepts create-order only when `confirm` is exactly `true`.
- The assistant may call confirm only after it has shown (or spoken) the quote **and** the customer has given a clear yes (typed “yes, place it”, confirm control, or equivalent spoken yes).
- A duplicate submit with the same idempotency key must not create two orders.

## 8. Premium membership

- Not a paid subscription in v1.
- Stored as a boolean user flag (`isPremium`) for demo and test accounts.
- Admins toggle it via `PATCH /v1/admin/users/{userId}/premium`.
- Applied automatically on quote and confirm; the customer does not enter a coupon code.

## 9. Catalogue operations

- v1 starts from a **seeded** catalogue (~12 products).
- Admins may create and update products through **admin APIs**.
- There is **no admin UI** in v1.

## 10. Cart and stock

- One **server-side** cart per customer. It survives refresh and is shared with the web and the assistant (all modalities).
- Line quantity must be ≥ 1. Quantity 0 removes the line.
- Products have `stockQty`. Confirm checks availability and decrements with a conditional write. Insufficient stock fails the order; the cart is left unchanged.

## 11. Authentication and access

- **Amazon Cognito User Pool** is the identity store. It owns sign-up, sign-in, password hashing, and session JWTs.
- **Sign-up page** (`/signup`) captures:
  - Email (required; used as username)
  - Password and confirm password (required; Cognito password policy)
  - Display name (required; stored as Cognito `name`)
- Email verification uses Cognito’s confirmation code (`/confirm`) before the account can sign in.
- **Login page** (`/login`) authenticates with email and password against the same User Pool.
- The SPA talks to Cognito directly (Amplify Auth or Cognito SDK). Passwords never pass through the SmartShop Lambda or DynamoDB.
- DynamoDB `Users` is an **application profile** only (`isPremium`, display cache), keyed by Cognito `sub`, upserted on `GET /v1/me`.
- Catalogue `GET` may be public.
- Cart, quotes, orders, assistant (Runtime invoke / voice WebSocket / image upload), and `/me` require a signed-in customer.
- Admin routes require Cognito group `admin`. New sign-ups are customers unless an operator adds them to that group.
- Customer A cannot read Customer B’s cart or orders.
- Customers cannot set `isPremium` on the sign-up form.

Phase 5 (AgentCore assistant) is additive. It must not change catalogue, cart, checkout, orders, login, CORS, or JWT rules. The assistant reuses the same cart and orders; it does not replace the web APIs. Details: [project-technical-requirements.md](project-technical-requirements.md) §2.4 and [US-5.08](usecase-stories/phase-5-assistant.md).

## 12. Out of scope for v1

- Real payments and refunds
- Admin / merchant UI
- Email or SMS notifications
- Returns, reviews, wishlists
- Guest checkout
- Multi-currency
- Dedicated search engine (OpenSearch) and visual k-NN catalogue search
- Native mobile apps
- AgentCore Gateway MCP wrapping public `/v1` APIs, and on-behalf-of / JWT passthrough (Phase 5 uses IAM service-to-service)
- Phone / PSTN / Alexa skill
- Paid premium subscription
- Google / social identity providers
- Forgot-password and profile-edit UI (Cognito console can reset passwords for demos)

## 13. Related documents

- [project-technical-requirements.md](project-technical-requirements.md)
- [usecase-stories/](usecase-stories/)
- [github-setup.md](github-setup.md)
