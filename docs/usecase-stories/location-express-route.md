# UC-1 — Express route at checkout

**Goal:** On express confirm, pick the current store with the shortest drive to the delivery address, save that path on the order, and show it on the order page.

Standard delivery does not collect an address. The express fee stays $12.99 and the 1–2 day promise stays as written. Drive time does not change that promise.

---

## US-L1.01 Address required for express

**Title:** Express checkout collects a delivery address  
**Actor:** Customer  
**Story:** As a customer, I want to enter a delivery address when I choose express so SmartShop can find a driving route.

**Preconditions**

- Signed in.
- Cart is non-empty.
- Delivery method is `EXPRESS`.

**Main flow**

1. Checkout asks for `deliveryAddress` only when delivery is express.
2. Client `POST /v1/orders` with `{ deliveryMethod: "EXPRESS", deliveryAddress, confirm: true }`.
3. A missing address is rejected. A standard order that includes an address is rejected.

**Acceptance criteria**

- EXPRESS without `deliveryAddress` returns 400. No order. Cart and stock unchanged.
- STANDARD with `deliveryAddress` returns 400. No order.
- STANDARD without an address still confirms as today.
- `confirm` must still be boolean `true`.

**APIs / screens**

- `POST /v1/orders`
- `/checkout`

**Out of scope**

- The shopping assistant collecting this address.
- Changing the express fee or the 1–2 day promise.

---

## US-L1.02 Nearest store by driving duration

**Title:** Confirm keeps the current store with the shortest drive  
**Actor:** Customer  
**Story:** As a customer, I want express confirm to choose the current store that can drive to my address in the least time.

**Preconditions**

- US-L1.01.
- At least one active current store exists.

**Main flow**

1. Confirm geocodes `deliveryAddress`.
2. It asks for driving time from each active current store to that point.
3. It keeps the store with the shortest duration.
4. It copies the path, distance, and duration onto the order, the same way prices are snapshotted.
5. Stock decrements and the cart clears only after that snapshot exists.

**Acceptance criteria**

- The stored route is the minimum duration, not the minimum distance.
- Later store edits do not rewrite the snapshot on the order.
- The order response includes the address and the route id.

**APIs / screens**

- `POST /v1/orders`

**Out of scope**

- Standard delivery calling geocoding or routing.
- Choosing a store the customer names by hand.

---

## US-L1.03 Map on the order

**Title:** The customer sees the stored route  
**Actor:** Customer  
**Story:** As a customer, I want to open my express order and see the driving route that was saved at confirm.

**Preconditions**

- An express order from US-L1.02.

**Main flow**

1. Customer opens the order.
2. `GET /v1/orders/{orderId}` returns the address, store name, distance, duration, and the stored route line.
3. The order page draws that line on a map.

**Acceptance criteria**

- The map uses the snapshot from confirm, not a newly computed route.
- The order list stays a summary. The map loads on the detail page.
- A standard order has no route map.

**APIs / screens**

- `GET /v1/orders/{orderId}`
- `/orders/{orderId}`

**Out of scope**

- Live traffic updates after the order exists.
- Sharing the map with another customer.

---

## US-L1.04 Routing failure blocks confirm

**Title:** Express confirm creates no order when routing fails  
**Actor:** Customer  
**Story:** As a customer, I want a failed route lookup to stop the order so I am not charged a delivery we cannot route.

**Preconditions**

- Express confirm from US-L1.01.
- Geocoding, routing, or saving the route fails, or no active store exists.

**Main flow**

1. Confirm attempts the route before writing the order.
2. On failure it returns an error and does not write the order.
3. Cart and stock stay as they were.

**Acceptance criteria**

- No active store returns 503. No order.
- Geocoding or routing failure returns 502. No order.
- Saving the route after a store was chosen, if that save fails, still creates no order.

**APIs / screens**

- `POST /v1/orders`
- `/checkout` shows the failure

**Out of scope**

- Placing the order anyway and filling the route later.
- Falling back to standard delivery automatically.
