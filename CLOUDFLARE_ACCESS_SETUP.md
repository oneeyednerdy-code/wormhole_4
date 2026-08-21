# Protect Wormhole development previews

Wormhole does not configure Cloudflare Access from browser code. Apply this policy in the Cloudflare dashboard so only approved testers can open preview deployments.

1. Open **Workers & Pages** and select the Wormhole Pages project.
2. Open **Settings**, then **General**.
3. Select **Enable access policy** under preview deployment access.
4. In Cloudflare Zero Trust, limit the resulting Access application to your email address and the specific tester emails you approve.
5. Keep the default deny behavior for everyone who does not match an Allow policy.
6. Use a short development session duration, such as eight hours.
7. Test an anonymous/private browser window. A preview URL must show Cloudflare authentication before Wormhole loads.
8. Keep production public unless you intentionally want every Wormhole user to pass through Cloudflare Access.

Cloudflare's Pages access policy protects preview deployments only. It does not automatically protect the main `pages.dev` hostname or a production custom domain.

## Twitch callback note

If testers log in to Twitch from a protected preview hostname, that exact callback URL must also be registered in the Twitch Developer Console. Prefer one stable protected development hostname instead of registering many temporary preview URLs.
