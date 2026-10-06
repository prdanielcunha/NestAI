# Intelligence Mission Control — UI contract

The console is an operational surface, not the authority for Hub identity/billing.

## Navigation
- Overview
- Tasks
- Models & Providers
- Privacy
- Usage & Free Budget
- Evaluations
- Knowledge / RAG
- Jobs
- Applications
- Traces
- Settings

## Overview
Responsive cards show service health, FREE_ONLY status, provider readiness, requests today, rejected privacy events, rate-limit events, D1 usage and latest release SHA. No prompt/output content appears by default.

## Design language
Premium dark-first MillionsNest surface with restrained glass depth, high information density without clutter, maximum two font families, WCAG AA contrast, keyboard navigation and reduced-motion support. Mobile uses bottom navigation / compact sheets instead of desktop sidebars.

## Safety UX
- Paid routing controls are visibly locked while FREE_ONLY is active.
- P4 events show metadata/reason only, never payload.
- Tool writes show disabled state by default.
- Any future irreversible action requires a deterministic domain confirmation screen outside LLM output.
- Production/deployment badges are derived from verified deployment state, never manually typed.

## i18n
Every user-visible string is keyed and available in PT-BR, English and Spanish.

## Data
Console consumes NestAI control-plane endpoints and Hub identity. It must not embed provider API keys in browser bundles.
