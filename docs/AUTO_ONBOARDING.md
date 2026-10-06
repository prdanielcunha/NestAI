# NestAI automatic app onboarding

A MillionsNest app declares AI intent in `millionsnest.app.json`. The app repository never receives provider credentials.

## Contract

The manifest declares:
- `appId`
- product name
- enabled AI tasks
- default sensitivity
- PT-BR / English / Spanish locales
- canonical GitHub repository

## Registration flow

1. Repository is created from the MillionsNest template.
2. `millionsnest.app.json` is present.
3. GitHub Actions obtains a short-lived OIDC workload identity with audience `nestai-app-register`.
4. NestAI verifies GitHub's RS256 signature, issuer, audience, repository owner, exact repository and expiry.
5. NestAI validates task namespace and manifest schema.
6. Manifest + repository/ref/SHA are upserted into the D1 control plane.
7. Apps continue to call the fixed endpoint through `@millionsnest/ai`; model/provider changes do not require app deployment.

Provider secrets are never copied into app repositories.
