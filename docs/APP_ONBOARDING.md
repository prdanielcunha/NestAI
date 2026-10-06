# App Onboarding

Target flow: repository → `millionsnest.app.json` → CI validation → workload identity/OIDC → NestAI App Registry → authorized canonical tasks.

Provider secrets are never copied into consumer repositories. Production SDK endpoint defaults to `https://ai.millionsnest.com/v1` after that domain is actually deployed and verified.
