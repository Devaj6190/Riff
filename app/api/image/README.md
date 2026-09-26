# Image generation

`POST /api/image` accepts the shared `ImageRequest` and returns `ImageResponse`.
`requirePlayer()` checks membership before generation or pool access. Requests need
a nonempty prompt (at most 2,000 characters) and up to 20 tags (80 characters each).

Grok Imagine gets a five-second budget, including response body parsing. Timeout,
network errors, provider errors, invalid output, or a missing `XAI_API_KEY` return
a local image with `fromPool: true`. Tags are trimmed and lowercased; the entry
with the most matching tags wins, with random selection among ties. Empty or
unknown tags select from the whole pool. A small pool cannot match every custom
interest, and repeated requests may return the same image.

The four checked-in JPEGs cover all starter interest chips. They were generated
with Grok Imagine on 2026-09-26 and visually inspected. `pool.json` records prompts,
tags, model, paths and measured generation latency. Regenerate explicitly with
`node --env-file=.env.local app/api/image/generate-pool.mjs` (four paid API calls).

Measured from request start through complete base64 response parsing, sequential
calls to `grok-imagine-image-2.0`: 19,669 / 24,314 / 18,653 / 16,756 ms; mean
19,848 ms. This is a four-call development sample, not a service latency guarantee.
All exceeded the runtime budget, supporting the use of the local fallback pool.

The runtime requests URL output. Provider URLs are temporary and intended for the
current round; the checked-in fallback assets remain available indefinitely.
API reference: https://docs.x.ai/developers/model-capabilities/images/generation

Tests exercise auth rejection, success, timeouts (including a stalled body),
upstream failures, malformed requests/output, tag selection and asset presence.
