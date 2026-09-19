# Phase 4 — Web SPA

**Goal:** React + Vite UI on CloudFront so a visitor can sign up, a customer can sign in with Cognito, and then complete the full shopping journey in the browser.

**Related:** [project-technical-requirements.md](../project-technical-requirements.md) §2.3 and §6

---

## US-4.01 Sign up

**Title:** Visitor creates a Cognito account on `/signup`  
**Actor:** Visitor  
**Story:** As a visitor, I want a sign-up page that captures my details so Cognito can create my email-and-password account.

**Preconditions**

- Cognito User Pool with self-registration and email verification (Phase 0).
- SPA hosted locally or on CloudFront.

**Main flow**

1. Visitor opens `/signup`.
2. Form collects **email**, **display name**, **password**, and **confirm password**.
3. Client-side checks: required fields, email format, passwords match, password meets Cognito policy (min 8, upper, lower, number).
4. SPA calls Cognito `SignUp` (not SmartShop Lambda). Email is the username; `name` is the display name.
5. On success, SPA navigates to `/confirm` with the email prefilled.
6. Link to `/login` for visitors who already have an account.

**Acceptance criteria**

- Duplicate email shows a clear Cognito error (user already exists).
- Mismatched confirm password never calls Cognito.
- Password is not sent to SmartShop APIs or written to DynamoDB.
- `isPremium` is not on the form and remains false.
- Sign-up does not log the user in until email is confirmed.

**APIs / screens**

- `/signup`
- Cognito `SignUp`

**Out of scope**

- Social sign-up, phone number, address, marketing opt-in.

---

## US-4.02 Confirm email

**Title:** Visitor confirms the Cognito email code  
**Actor:** Visitor  
**Story:** As a visitor, I want to enter the verification code so my User Pool account becomes active.

**Preconditions**

- `SignUp` succeeded for that email.

**Main flow**

1. Visitor opens `/confirm` and enters email + code from Cognito’s email.
2. SPA calls Cognito `ConfirmSignUp`.
3. On success, SPA sends the user to `/login`.

**Acceptance criteria**

- Wrong code shows an error; account stays unconfirmed.
- Confirmed user can sign in on `/login`.
- Unconfirmed user who tries `/login` is directed to `/confirm`.

**APIs / screens**

- `/confirm`
- Cognito `ConfirmSignUp`

**Out of scope**

- Custom email templates (Cognito default message is enough for v1).

---

## US-4.03 Sign in

**Title:** Customer signs in with email and password  
**Actor:** Customer  
**Story:** As a customer, I want to sign in with the email and password stored in the Cognito User Pool so my cart and orders are tied to me.

**Preconditions**

- Confirmed User Pool account.

**Main flow**

1. Customer opens `/login`.
2. Form collects email and password.
3. SPA calls Cognito `InitiateAuth` (SRP or `USER_PASSWORD_AUTH`).
4. SPA holds tokens via Amplify Auth (avoid rolling a custom token store).
5. Authenticated requests send `Authorization: Bearer` (ID token).
6. SPA calls `GET /v1/me` and shows display name.
7. Sign-out clears the Cognito session.

**Acceptance criteria**

- Unsigned users can still open `/` catalogue.
- Cart, checkout, orders, and chat routes redirect to `/login`.
- Wrong password does not create a DynamoDB user.
- After first successful `/me`, DynamoDB `Users` exists for that `sub`.
- `/login` links to `/signup`.

**APIs / screens**

- `/login`, `/signup`
- `GET /v1/me`
- Cognito `InitiateAuth`

**Out of scope**

- Google/Apple IdPs, magic links, forgot-password UI.

---

## US-4.04 End-to-end web checkout

**Title:** Browse, cart, preview, confirm, order number  
**Actor:** Customer  
**Story:** As a customer, I want to complete browse → cart → checkout preview → confirm → order number in the browser.

**Preconditions**

- Signed in with Cognito email/password.
- Catalogue has stocked products.

**Main flow**

1. `/` lists products; search box calls `GET /v1/products?q=`.
2. `/products/:id` shows price and stock; Add to cart calls `PUT /v1/cart/items`.
3. `/cart` allows quantity change and remove.
4. `/checkout` lets the customer choose STANDARD or EXPRESS, calls `POST /v1/quotes`, and renders subtotal, premium discount (or “not applied”), delivery, tax, total.
5. Place order stays disabled until the customer checks an explicit confirm control.
6. Submit calls `POST /v1/orders` with `confirm: true` and `Idempotency-Key`.
7. Confirmation view shows `orderNumber`.

**Acceptance criteria**

- Breakdown numbers match the quote API (cents formatted as currency).
- Premium users see 10% off merchandise; non-premium see discount 0 / “not applied”.
- Double-click Place order does not create two orders.
- Empty cart cannot reach a successful order.

**APIs / screens**

- `/`, `/products/:id`, `/cart`, `/checkout`
- Catalogue, cart, quote, order APIs

**Out of scope**

- Guest checkout, saved addresses.

---

## US-4.05 Order history in the UI

**Title:** Orders list and detail pages  
**Actor:** Customer  
**Story:** As a customer, I want an orders list and order detail page so I can retrieve previous purchases.

**Preconditions**

- At least one confirmed order.

**Main flow**

1. `/orders` calls `GET /v1/orders` and lists order number, date, total.
2. `/orders/:id` calls `GET /v1/orders/{orderId}` and shows snapshotted lines and breakdown.

**Acceptance criteria**

- Newest orders first.
- Navigating from confirmation to history shows the new order.
- Unknown or other-user id shows a not-found state (no other customer’s data).

**APIs / screens**

- `/orders`, `/orders/:id`
- `GET /v1/orders`, `GET /v1/orders/{orderId}`

**Out of scope**

- Re-order button, returns.
