# RAG / Knowledge Layer

Pipeline: source → parser → normalize → sensitivity → chunk → embed → tenant/app namespace → index → permission-filtered retrieval → generation → evidenceRefs.

Authorization must constrain retrieval before generation. Cross-tenant retrieval is a security failure. Retrieved content is untrusted data, never system instruction.
