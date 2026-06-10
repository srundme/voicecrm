---
name: Webhook URLs already include the secret
description: Computed webhook URLs in api-server config carry the ?secret= query param; never append it again in clients.
---

The api-server serializes `meta_webhook_url` and `website_form_webhook_url`
already suffixed with `?secret=<webhook_secret>`. The webhook handlers
validate the secret from `req.query.secret`.

**Rule:** When building website-embed snippets or any client that POSTs to
these webhook URLs, use the URL field directly — do NOT append `?secret=`
again.

**Why:** Appending a second `?secret=` produces a malformed URL
(`...?secret=abc?secret=abc`). Express parses the first `secret` value as
`abc?secret=abc`, which fails the equality check and returns 401, silently
breaking all form submissions.

**How to apply:** In the frontend, the endpoint for the embed form is just
`config.website_form_webhook_url`. The standalone `webhook_secret` field is
only for display, not for URL construction.
