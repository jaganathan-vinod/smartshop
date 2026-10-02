# UC-2 — Store map and site planning

**Goal:** An operations admin sees current stores and, for a candidate address, nearby competitors and drive times.

Population is out of scope. This menu does not place an order and does not edit the catalogue. The shopping assistant cannot open it.

---

## US-L2.01 Current stores on a map

**Title:** Operations sees current stores  
**Actor:** Operations  
**Story:** As an operations admin, I want a menu that shows current stores on a map.

**Preconditions**

- Signed in. Cognito group contains `admin`.
- At least one active current store exists.

**Main flow**

1. Admin opens the store-planning menu.
2. The page shows the active current stores.
3. A caller who is not `admin` is rejected.

**Acceptance criteria**

- Only the `admin` group can open the menu. No new login group.
- A customer token receives 403.
- The page does not change products, carts, or orders.

**APIs / screens**

- Admin store-planning menu

**Out of scope**

- Population.
- Opening or closing a store from this menu.
- Customer checkout.

---

## US-L2.02 Competitors and drive times for a candidate address

**Title:** A candidate address shows competitors and drive times  
**Actor:** Operations  
**Story:** As an operations admin, I want to enter a candidate address and see nearby competitors plus drive times from those competitors and from current stores.

**Preconditions**

- US-L2.01.
- The candidate address can be located.

**Main flow**

1. Admin enters a candidate address.
2. SmartShop finds nearby competitors.
3. It computes drive time from each current store and each competitor to that address.
4. The menu shows those subjects and their drive times.
5. The map draws the driving lines for that candidate.

**Acceptance criteria**

- Competitors and current stores are distinguishable.
- Each shown subject has a drive time to the candidate address.
- An address that cannot be located is reported. No plan is saved.
- A failed competitor or route lookup is reported. Partial results from that attempt are not kept.

**APIs / screens**

- Admin store-planning menu

**Out of scope**

- Population.
- Deciding to open a store.
- Placing an order or editing the catalogue.
- Express checkout (UC-1), which does not use this menu.
