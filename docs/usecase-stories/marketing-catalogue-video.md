# UC-4 — Catalogue marketing video

**Goal:** The same marketing operator, in a separate flow, asks for a short marketing video from catalogue products and written guidance, then holds it for review.

Still images stay in UC-3. The video is not published to the storefront. The shopping assistant cannot start this flow.

---

## US-M4.01 Generate a catalogue video for review

**Title:** Marketing receives a short video from catalogue guidance  
**Actor:** Marketing  
**Story:** As a marketing operator, I want to ask for a short video of catalogue products so I can review it before anyone else sees it.

**Preconditions**

- Signed in. Cognito group contains `admin`.
- The catalogue has the products named in the guidance.
- This is the video flow, separate from the still-image flow.

**Main flow**

1. Operator sends a video request with guidance and one or more catalogue products.
2. The agent checks those products against the catalogue.
3. It starts a short video and does not make the operator wait inside the request that only starts the job.
4. The review state moves from generating to ready, or to failed.
5. When it is ready, the operator can play the video.
6. The video is not published to the storefront. Product records are unchanged.

**Acceptance criteria**

- A non-admin receives 403.
- A named product that is missing from the catalogue is refused. No video is started.
- A rejected video job is shown as failed and has no playable file.
- If the job does not finish within 15 minutes, it is failed and the page stops waiting.
- The shopping assistant cannot start this flow.

**APIs / screens**

- Marketing video flow
- Review playback of the returned video

**Out of scope**

- Still images (UC-3).
- Publishing the video to the storefront.
- The shopping assistant.
