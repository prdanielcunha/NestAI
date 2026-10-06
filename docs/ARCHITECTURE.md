# Architecture

Apps → @millionsnest/ai → Edge API → Auth/Tenant → Privacy Firewall → Policy Engine → deterministic Router → AI Gateway/provider adapter.

Routing constraints are evaluated before ranking. P4 never leaves the platform. Hub remains authoritative for identity, organization, membership, entitlement, RBAC and capabilities.
