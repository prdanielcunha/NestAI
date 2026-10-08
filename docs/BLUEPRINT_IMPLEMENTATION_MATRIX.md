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
| F13 — Migração dos apps | PARTIAL | Verificação de fonte em 07/10: **8/8 manifests** em production; os oito repositórios contêm dependência imutável `@millionsnest/ai` e caminho de execução de SDK (Hub, Connect, Local, MusicScale, Finance, Journey, Affiliate, Lume). Isso **não** certifica E2E real, retirada de todas as chamadas diretas, privacidade ou rollback. Sete repositórios estão sincronizados main/production; MusicScale não. |
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
- confirmar instalação reproduzível/lockfile e execução correta do SDK em CI e ambiente publicado de cada repositório (dependência e imports identificados em fonte, ainda não equivalem a E2E);
- chamada autorizada, chamada negada e teste de privacidade a partir de cada consumidor;
- auditar e eliminar rotas diretas remanescentes de providers com feature flags e rollback;
- prova de troca de modelo no NestAI sem deploy do app;
- remoção de credenciais de providers mantidas nos apps após cutover comprovado.

## Definition of Done (§97)

**NÃO ATINGIDA.** A conclusão requer evidência conjunta de produção, segurança, custo, experiência, acessibilidade, integração de todos os apps, observabilidade, regressão e recuperação. Bloqueios e testes ausentes são explícitos nesta matriz; não serão convertidos artificialmente em `DONE`.

## Itens futuros (§§89–93)

**FUTURE:** on-device AI, voice agents, monetização de conhecimento por cliente, entitlements pagos e SLAs premium. Devem continuar arquiteturalmente possíveis, mas **não serão habilitados no modo FREE_ONLY** sem aprovação posterior.

## Revisão de 07/10/2026 — rastreabilidade da migração em código

Consulta direta aos oito repositórios em GitHub (branches `main` e `production`). Escopo: manifests, dependência SDK, pontos de chamada e commits. **Não representa validação de APIs autenticadas ou teste de uso dos aplicativos publicados.**

| App | Comprovação de integração em fonte | Igualdade main/production | Pendente mais importante |
| --- | --- | --- | --- |
| MillionsNest Hub | SDK e serviço MusicScale Live no backend, além de emissão de token | Igual | Certificar autorização Hub por consumidor e fluxo real |
| MillionsNest Connect | `connectNestAiClient.ts` com run/stream/transcribe; Inbox integrado | Igual | Classificação, resposta e áudio E2E com revisão humana |
| NestLocal | `src/nestai.mjs` e exchange de sessão com Hub | Igual | Serviço publicado, sessão real e preços/agenda determinísticos |
| MusicScale | Proxy `services/server/nestAiProxy.ts` e rotas IA com SDK | **Divergente: seis commits em main** | Testar mudanças recentes das regras/versão antes de promover; validar cliente afetado |
| NestFinance | Proxy de IA sensível com token/App Check e providers migrados | Igual | OCR real, emulador, isolamento e qualidade de extração |
| NestJourney | `src/nestAi.ts` e intake de imagem com revisão humana | Igual | E2E OCR, regras Firestore, retorno ao manual e aceite |
| NestAffiliate | `apps/web/src/services/nestAiClient.ts` para copy, análise e imagem | Igual | E2E de geração real, revisão de criativos, origem dos dados |
| NestLume | `src/lib/nestai-client.ts` para estudo com evidência e guest | Igual | Resposta fundamentada E2E, App Check e privacidade de texto colado |

**Automatização adicionada em branch de revisão:** `scripts/audit-ecosystem-cutover.mjs` + `tests/audit-ecosystem-cutover.test.mjs` + workflow manual `audit-ecosystem-cutover.yml`. O script compara manifests de produção, tarefas/ownership, SDK imutável e divergência de branches sem executar IA ou modificar dados. Ele sempre apresenta `liveE2E: NOT_CERTIFIED_BY_THIS_AUDIT`. A promoção exige QA e smoke autenticado separado.


## 08/10/2026 — Extensão comercial v2 (branch em review, sem produção)

**Fonte:** `02_NestAI_Creditos_Trial_Pago_Escala_Multicliente.docx`.
**Decisões e gates:** `docs/COMMERCIAL_CREDITS_V2.md`.
**PR:** https://github.com/prdanielcunha/NestAI/pull/20 (draft).

| Camada | Estado | Prova / restante |
| --- | --- | --- |
| Entidades D1 de grants/ledger/custo e triggers de reserva | IMPLEMENTED IN PR ONLY | `migrations/0008_commercial_credits.sql`; script SQLite de invariantes |
| API quote/balance/grant e SDK | IMPLEMENTED IN PR ONLY | Flag desligada; validação CI/contratos |
| NestLocal texto metered com settle/refund | IMPLEMENTED IN PR ONLY | Hub claim e testes E2E pendentes |
| Hub trial sem cartão e Stripe sem trial | BLOCKED | Hub PR https://github.com/prdanielcunha/millionsnest/pull/287; onboarding/checkout/webhooks pendentes |
| OCR/áudio/import/jobs/streaming metered | BLOCKED | Preço comercial testável existe, E2E e budgets pendentes |
| Custo real e paid provider financeiro com hard stop | BLOCKED | Schema D1; reserva e reconciliação USD ainda não implementadas |
| MusicScale/7 outros apps preservados | NOT MODIFIED | Testes live/legado e migração progressiva pendentes |
| Publicação/cobrança Founders | NOT AUTHORIZED | COGS, preço, simulação 1k tenants, flags e canary |

Não alterar `DONE` das fases antigas por causa deste PR: esse trabalho
adiciona fundação comercial desligada e não é comprovação de rollout real.


## Verificação complementar de 08/10/2026 — estado de produção e camada financeira

A antiga anotação "implementado somente em PR" na seção comercial anterior é um
**registro histórico**, não o estado mais recente. A implementação principal
foi incorporada e parte da infraestrutura está publicada **com as flags OFF**:

- NestAI PR #20 incorporado à main; schema 0008 de grants, reservas e ledger
  e schema 0009 de revogação foram aplicados no D1 remoto em releases isolados.
  CI/deploy/readiness públicos aprovados. Não houve ativação de consumo comercial.
- Hub PR #287 incorporado; trial sem cartão, entitlement, concessão mediante
  outbox, checkout sem segundo trial para coortes e regras de acesso preparados.
  Hub PR #293 implantou no backend o outbox de invoice paga, ainda OFF.
- NestLocal PR #111 incorporado e promovido sob flags desligadas.
  MusicScale PR #395 incorporado à main; não implica certificação E2E do trial
  de 14 dias ou migração de dados em production.
- NestAI PR #27 incorporado à main: controle transacional de *dinheiro* por
  pior caso de custo, distinto do saldo de créditos; janelas por global,
  ambiente, modelo/provedor, tarefa, app, organização e opcional user/trial.
  PR #28 prepara port isolado para production com flags OFF, sujeito a CI e
  sucesso comprovado de D1 remoto.
- Hub PR #304 incorporado à main: transporte restrito e desativado por padrão
  para futuras revogações por refund/dispute. **Ainda não é uma integração
  certificada ao webhook Stripe**, e não permite reversões a pedido do cliente.

### Evidências versus gates

| Critério | Estado na verificação |
| --- | --- |
| Worker/API, FREE_ONLY, JWT/JWKS, App Check, R2, D1, domínio, CI | Produção validada por smoke/readiness público |
| 8 consumidores registrados, SDK e tasks mapeadas em fonte | Source audit PASS 8/8; NÃO comprova E2E |
| Cobrança comercial NestLocal e saldo para cliente real | **OFF**, não validado |
| Trial Hub sem cartão | Implementado no código, gate de coorte OFF |
| Créditos após invoice.paid e reversão por refund | Infraestrutura/transportes em fases diferentes; fluxo Stripe→Hub→NestAI E2E não certificado |
| Orçamentos reais por provider/tenant e custos observados | Ledger/budget schema preparados; NÃO vinculados a chamadas de providers |
| OCR, áudio, importação, streaming e jobs medidos em créditos | NÃO certificado |
| 8 apps com autenticação/app-check/provider live | PENDENTE de smoke autenticado e testes de interface |
| Stripe sandbox, cancelamento, retry, upgrade, estorno e múltiplos ciclos | PENDENTE de suite real completa de efeitos no Hub/Firestore |
| Teste de 10,100,500,1000 clientes, WCAG/mobile, restore/rollback | PENDENTE |

### Regras imutáveis de conclusão

1. Não marcar como 100%, DONE ou pronto para cobrar só porque houve deploy ou
   aprovação de testes unitários. É necessária prova **do cliente ao provedor
   e de volta** para cada aplicativo e para os ciclos financeiros.
2. Não alterar assinatura, plano, organograma, escala, registro Firestore
   histórico ou cobrança de MusicScale/usuários legados durante a certificação.
3. Não ligar AI_COMMERCIAL_CREDITS_ENABLED, AI_PAID_ENABLED, trial público ou
   NESTAI_GRANTS_SYNC_ENABLED até validar isolamento, limites monetários,
   Firestore e Stripe E2E em coorte explícita, com plano de reversão.
4. Se um teste requer token efêmero/autorização de serviços e esse recurso não
   está disponível no CI, registrar BLOQUEADO em vez de PASS.
5. Preços de plano e créditos são propostas até a certificação de custo,
   compatibilidade com catálogo Hub e validação das regras Founders.

Documentos-fonte: Blueprint v1.0 de 06/10/2026 e
`02_NestAI_Creditos_Trial_Pago_Escala_Multicliente.docx` de 08/10/2026.
