# Remaining account-level blockers

This file is intentionally short. These are not coding TODOs; they require authenticated external account access.

1. **Cloudflare D1 provisioning**
   - Create database `nestai`.
   - Replace the placeholder UUID in `wrangler.jsonc`.
   - Apply migration `0001_usage.sql`.

2. **Cloudflare deployment credentials in GitHub**
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

3. **Worker secret**
   - `HUB_TOKEN_PUBLIC_JWK`

4. **Hub issuer implementation**
   - Hub must mint ES256 short-lived tokens matching the NestAI claim contract.

5. **Optional Groq**
   - Add `GROQ_API_KEY` only if Groq routing is desired. NestAI remains operable through Workers AI when policy allows.

6. **Custom domain**
   - Attach `ai.millionsnest.com` only after live health/auth/privacy smoke tests pass.

Until these are verified, `production` must not be represented as live.
