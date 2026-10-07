# NestAI — Matriz de Implementação do Blueprint

**Fonte canônica:** `NestAI_MillionsNest_AI_Platform_Blueprint_v1.0_2026-10-06.docx`  
**Texto integral normalizado:** `docs/blueprint-source/` (4 partes)  
**Atualização:** 2026-10-07  
**Ambientes:** `main` = integração/QA; `production` = último release publicado.

Esta matriz registra evidências verificáveis. **Implementado** não significa automaticamente **validado ao vivo**, e nenhuma task passa a `DONE` apenas porque o código compila.

### Estados

- **DONE:** requisito implementado, testado e, quando aplicável, validado em produção.
- **PARTIAL:** parte funcional existe, mas falta requisito, integração, validação real ou aceite.
- **BLOCKED:** existe dependência externa que exige ação humana ou permissão de terceiro.
- **FUTURE:** item expressamente classificado como futuro no blueprint.

## Roadmap (§61)

| Fase | Estado | Evidência e restante |
| --- | --- | --- |
| F0 — Especificação canônica | PARTIAL | Blueprint integral em `docs/blueprint-source/`; ADRs 001–011, contratos e taxonomia no repositório. Falta reconciliação formal de cada requisito com implementação e aceite. |
| F1 — Bootstrap | DONE | Worker/API, pnpm/TS, lint, Vitest, GitHub CI, D1, domínio `ai.millionsnest.com`, deploy + smoke e SPA de console entregues. |
| F2 — Auth | PARTIAL | Hub ES256/JWKS, token curto, tenant/app/capabilities, App Check, admin global e guest restrito com testes. Falta smoke live autenticado de todos os apps + service-to-service completo. |
| F3 — Providers | PARTIAL | Adapters Groq, Cloudflare, Gemini e Mistral, streaming, schema e circuit/fallback. Gemini atualizado para `gemini-3.5-flash-lite` estável e elegível apenas para tasks não sensíveis autorizadas. Mistral permanece lab/fail-closed até confirmação de Free mode + pay-as-you-go off. Faltam credenciais/live certification dos provedores externos e revisão periódica. |
| F4 — Router/Policy | PARTIAL | Registries, privacy P0–P4, hard constraints, roteamento por modalidade e safe fallback. Falta console editável com versionamento/promoção e avaliação comparativa live. |
| F5 — ZERO COST | PARTIAL | FREE_ONLY hard lock, quotas por provider/app/org/user, 80/20, reserve/conserve e kill switches. R2 agora possui ledger mensal próprio + margens 50/60/70/80%, lifecycle e reconciliação de inventário. Faltam teste de exaustão real e conciliação com métricas externas de Cloudflare/Groq/Gemini. |
| F6 — Observability | PARTIAL | Metadata traces, health, SLO/alertas, incidentes e scheduler. Falta waterfall real completo, monitoramento de ponta a ponta e verificação de retenção. |
| F7 — Mission Control | PARTIAL | SPA React/Vite/Tailwind responsiva com 12 áreas, PT/EN/ES, command palette, health e APIs admin protegidas. Vários painéis permanecem read-only; botões de edição/evals/reindex não são fluxos produtivos. Auditoria visual, acessibilidade WCAG AA e testes E2E ainda pendentes. |
| F8 — SDK | PARTIAL | Pacote `@millionsnest/ai v0.1.0` publicado em GitHub Releases, run/stream/media/jobs/HUB token/App Check. `v0.2.0` guest e release imutável em QA. Falta instalação e chamadas reais dos consumidores. |
| F9 — Auto-onboarding | DONE para registro | `millionsnest.app.json`, validação, GitHub OIDC, reusable workflow e **8/8 repos registrados com sucesso** em produção; não implica migração do código desses apps. |
| F10 — Evaluation Lab | PARTIAL | Runner, thresholds, promotion gate e 80 golden cases sanitizados. Falta executar datasets contra providers reais, persistir métricas e bloquear releases via gate automático. |
| F11 — RAG | PARTIAL / R2 LIVE VALIDATION PENDING | Vectorize `nestai-knowledge` criado; filtros/EvidenceRefs e IDs tenant-scoped. O proprietário confirmou a ativação do R2 em 07/10/2026. Branch de implementação adiciona bucket Standard, lifecycle, ledger 50/60/70/80%, reconciliação e persistência degradável da fonte RAG. Falta reprovisionar após merge e executar smoke autenticado de ingest/query/read/delete/reconciliation. |
| F12 — Jobs/Media | PARTIAL | KV, Queues `nestai-jobs`/`nestai-jobs-dlq`, APIs áudio/visão/embedding/imagem, job polling e retry. Falta certificação E2E de DLQ, retries, OCR, arquivos grandes e limites gratuitos. |
| F13 — Migração dos apps | PARTIAL | 8/8 manifests e registro automático; Hub token/App Check integrado. **Ainda não concluída** a troca de chamadas diretas e instalação funcional do SDK em todos os apps. |
| F14 — Hardening | PARTIAL | CI, security tests, simulações de caos, runbooks e smoke release. Faltam carga/soak, red-team, DR/restore testado, canary/rollback exercitado, auditoria WCAG e SLO observado. |

## Critérios de aceite do MVP técnico (§94)

| Requisito | Estado | Evidência/pêndencia |
| --- | --- | --- |
| Domínio público e Worker | DONE | Deploy `production` com smoke no domínio. |
| Auth canônica ES256/JWKS/tenant/app | DONE no core | Testes de assinatura/tenant; validação live app-a-app pendente. |
| Firebase App Check | PARTIAL | reCAPTCHA Enterprise configurado e TTL 7 dias; smoke live de todos os clientes falta. |
| Groq / Workers AI | PARTIAL | Adapters, quotas e policy implementados; modelos reais não certificados por task. |
| Gemini Free restrito | DONE na policy / PARTIAL live | `gemini-3.5-flash-lite` GA cadastrado; P2/P3/P4 continuam proibidos. Falta comprovar `GEMINI_API_KEY` e chamada live P0 autorizada. |
| Mistral adapter | PARTIAL | Adapter + Small 4 revisados; Free mode existe, porém a chave e o estado pay-as-you-go são account-level. Continua bloqueado no FREE_ONLY até confirmação fail-closed. |
| Task/Model/Provider Registries | DONE como contratos | UI de edição versionada pendente. |
| Privacy + router + fallback | DONE no core | Testes P4/cross-tenant; carga e falhas reais pendentes. |
| Streaming SSE | DONE no core | Parser do SDK e stream Worker testados. |
| Structured output | DONE no core | Validação Zod; grounded NestLume em certificação. |
| Circuit breaker / quota / hard lock | DONE no core | Simulações; conciliação com limites externos pendente. |
| Observability sem payload privado | PARTIAL | Logs metadata-only e `collectLog:false`; auditoria de todos os gateways pendente. |
| Mission Control health/usage | DONE como leitura | Alterações administrativas completas pendentes. |
| SDK publicado | DONE v0.1.0 | v0.2.0 e integração real pendentes. |
| App sem provider secret | DONE no registro | 8 registros por OIDC em produção; migração de IA real pendente. |
| D1 / KV / Queues / Vectorize | DONE em provisionamento | Recursos criados e bindings; end-to-end de Vectorize/Queues pendente. |
| R2 | PARTIAL | Ativação da conta confirmada pelo proprietário; guardas/lifecycle/binding preparados. Falta workflow de provisionamento pós-merge e smoke real antes de declarar `DONE`. |
| CI/CD | DONE no release publicado | Nunca promover head vermelho. |

## Aceite de experiência (§95)

**PARTIAL.** Há 12 superfícies premium responsivas com i18n, mas **não** há certificação completa WCAG AA, testes mobile E2E, editor/publish funcional de prompt/routes/policies, fluxos de erro e confirmações críticas finalizados.

## Integração automática (§96)

**PARTIAL.** Auto-registro OIDC **8/8 comprovado** e SDK empacotado/publicado; ainda faltam:
- instalação efetiva e lockfile reproduzível em cada repositório;
- chamada autorizada, chamada negada e teste de privacidade a partir de cada consumidor;
- substituição progressiva de provider-specific code com feature flags e rollback;
- prova de troca de modelo no NestAI sem deploy do app;
- remoção de credenciais de providers mantidas nos apps após cutover comprovado.

## Definition of Done (§97)

**NÃO ATINGIDA.** A conclusão requer evidência conjunta de produção, segurança, custo, experiência, acessibilidade, integração de todos os apps, observabilidade, regressão e recuperação. Bloqueios e testes ausentes são explícitos nesta matriz; não serão convertidos artificialmente em `DONE`.

## Itens futuros (§§89–93)

**FUTURE:** on-device AI, voice agents, monetização de conhecimento por cliente, entitlements pagos e SLAs premium. Devem continuar arquiteturalmente possíveis, mas **não serão habilitados no modo FREE_ONLY** sem aprovação posterior.
