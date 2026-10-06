# Privacy

Classification: P0 Public, P1 Internal, P2 Personal, P3 Sensitive, P4 Restricted.

Mandatory pipeline: authenticate → resolve tenant/task → classify → minimize/redact → filter providers → route.

Religious context tied to identifiable people is treated conservatively as sensitive. P4 is never sent to an external model. P2/P3 content is metadata-only in telemetry by default.
