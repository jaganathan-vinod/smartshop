# UC-3 — Catalogue marketing images

**Goal:** A marketing operator chats with an agent that uses the existing catalogue and written guidance, then holds generated images for review.

Images are not published to the storefront. Video is UC-4. This agent is not the shopping assistant.

---

## US-M3.01 Generate a catalogue image for review

**Title:** Marketing receives still images from catalogue guidance  
**Actor:** Marketing  
**Story:** As a marketing operator, I want to describe an image using our catalogue and my guidance so the agent can return a still for review.

**Preconditions**

- Signed in. Cognito group contains `admin`.
- The catalogue has at least one active product.
- The guidance names a product that exists in the catalogue.

**Main flow**

1. Operator opens the marketing chat. This is not the shopping assistant.
2. Operator sends guidance that names one or more catalogue products.
3. The agent uses those product names, descriptions, and catalogue image URLs plus the guidance.
4. The agent returns a generated image for review.
5. Nothing in this flow updates the public catalogue or the product record.

**Acceptance criteria**

- A non-admin receives 403.
- Guidance that names no catalogue product does not generate an image. The reply says which products exist.
- A successful image is held for review and is not shown on the storefront.
- The shopping assistant cannot open this chat and cannot cart, quote, or confirm from it.

**APIs / screens**

- Marketing chat
- Review of the returned image

**Out of scope**

- Video.
- Publishing the image onto a product or the storefront.
- The shopping assistant.
