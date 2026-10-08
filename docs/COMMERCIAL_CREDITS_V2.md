# NestAI — Camada comercial multicliente / v2.0 (2026-10-08)

## Fonte, escopo e estado real

Complementa, sem substituir, o blueprint mestre 2026-10-06 e a proposta
`02_NestAI_Creditos_Trial_Pago_Escala_Multicliente.docx` de 2026-10-08.
Estado desta branch: **fundação de dados, APIs e testes implementada em modo desligado**.
**Não publicada, não certificada financeiramente e não habilitada para clientes.**
O lançamento não pode ser inferido apenas de um build verde.

**Autoridade:** Hub = identity, organization, membership, accessState, trialEnd,
plan, subscription, commercial eligibility e Stripe. NestAI = créditos,
reservas, medição técnica, roteamento, orçamentos, auditoria e segurança.
Apps não controlam quotas, chaves ou modelos.

## Decisões adotadas

1. O código já instalado nos oito apps e os direitos comerciais legados ficam intactos.
   `AI_COMMERCIAL_CREDITS_ENABLED=false` por padrão; a proteção atual
   `FREE_ONLY`, `ALLOW_PAID_FALLBACK=false`, `AI_PAID_ENABLED=false`
   **não muda**.
2. O primeiro piloto é exclusivo do NestLocal. Nada de cotas NestLocal
   no MusicScale, Connect, Finance, Journey, Lume, Affiliate ou Hub.
   Futuras verticais usam política, cota e task pricing próprias.
3. O trial do NestLocal é do **Hub**: 7 dias sem cartão; **40 créditos propostos**
   concedidos uma única vez por org/app/trial lógico. Esgotar créditos
   NÃO encerra o uso funcional do aplicativo antes do fim dos sete dias.
   Depois do fim, o Hub aplica a política de leitura/mutações;
   a IA não decide essa transição.
4. Assinaturas Stripe existentes nunca são automaticamente modificadas.
   Trial no Hub não cria assinatura, invoice, cartão nem trial Stripe;
   na compra, Hub cria checkout sem trial adicional e só concede
   créditos após confirmação canônica de pagamento.
5. Planos NestLocal **propostos, não autorizados para venda até o piloto**:
   Essencial 150 créditos / R$59,90 (Founders R$49,90),
   Crescimento 500 / R$129,00 (Founders R$109,90),
   Pro 1.500 / R$199,00 (Founders R$169,90).
   Upsell avulso proposto: 100 / R$19,90; 400 / R$49,90;
   1.200 / R$119,90. O endpoint rejeita avulsos até aprovação de margem.
6. Os créditos comerciais NÃO são tokens. O preço de tarefa é
   contratualmente versionado e o uso real dos provedores é medido
   independentemente. Custos desconhecidos são NULL, não zero.

## Implementação deste conjunto de mudanças

| Item | Estado |
| --- | --- |
| Migration append-only de grants, allocations, reservations e transactions | Código |
| Alocação entre múltiplos grants (ex.: saldo do plano + origem adicional) | Código |
| Reserva e estorno em transação atômica D1 / triggers, sem saldo negativo | Código; requer CI SQL + teste live |
| Idempotência de grants / reservação / liquidação | Código; stress concorrente live pendente |
| Expiração por grant e limpeza de reservas vencidas (cron) | Código; teste E2E pendente |
| Hub claim `aiEntitlement` opcional, fail-closed | NestAI preparado; **Hub ainda deve emitir** |
| Quotes texto NestLocal de 1 crédito, version 1 | Código, **preço experimental** |
| Quotes de OCR 3/print, áudio 2/min iniciado, import 10/100 msgs | Pricing preparado, execução **não certificada** |
| APIs `/v1/credits/quote` e `/v1/credits/balance` | Implementadas, desabilitadas |
| `/v1/credits/grants` com token service Hub assinado | Implementado, desabilitado |
| SDK `quoteCredits`, `creditBalance`, idempotency-key | Código, sem publicar nova versão |
| `/v1/run` NestLocal com reserva → provider → validação → settle/release | Behind flag, texto apenas |
| Fluxos de streaming/áudio/print/jobs NestLocal | **Bloqueados** no modo comercial até terem ledger E2E |
| Tabela por provider/model de custo técnico (unknown != free) | Schema e registro; reconciliação externa pendente |
| Janela de orçamento real multi-scope | Schema; reserva financeira e precificação real pendentes |
| Paid provider | **Não ativado** / não permitido |
| Simulação de 10/100/500/1000 tenants e 5-10 prestadores reais | **Pendente** |

### Contratos HTTP

Todos os endpoints NestLocal exigem Hub JWT ES256, app/tenant corretos,
capability e App Check (exceto identidade de serviço). Nunca confiar no
`appId`, `organizationId` ou plano isolados do corpo da requisição.

`POST /v1/credits/quote`: aceita `{task,context:{organizationId}}`;
apenas tasks já registradas. Responde `quote:{creditsEstimate,maxCharge,
priceVersion,requiresConfirmation,description}` e `balance`.

`GET /v1/credits/balance`: requer headers de app/org autenticados;
responde saldos agregados ativos. Informações de grants históricos e data
de validade deverão alimentar a UI na fase de cliente.

`POST /v1/credits/grants`: apenas token assinado do Hub com
`tokenType=service`, capability `ai:credits.grant`, scope
`credits:grant`, e vínculo ao mesmo org/app. Hub envia `source`,
`sourceRef` estável (nunca usar webhook event ID aleatório como ciclo de
assinatura), `grantVersion`, `amount`, `beginsAt`, `expiresAt`.
Reenvio idêntico é no-op; payload diferente com referência já usada falha.

`POST /v1/run`: durante piloto, somente NestLocal, tasks de texto
autorizadas, flag ligada, Hub `aiEntitlement` válido e
`idempotency-key` estável. Mesmo idempotency-key não reexecuta provider.
O app deve persistir o resultado canônico sob sua própria chave.
O backend contabiliza 1 crédito por resultado estruturado validado;
falha técnica ou parse sem resultado: libera reserva.

### Erros / UI

- `AI_TRIAL_CREDITS_EXHAUSTED` ou `AI_MONTHLY_CREDITS_EXHAUSTED`:
  preservar dados, operações manuais e mostrar opções válidas de compra,
  nunca checkout automático.
- `AI_CREDIT_REQUEST_IN_PROGRESS` / `AI_CREDIT_IDEMPOTENT_REPLAY`:
  consultar resultado gravado no app por request, não cobrar novamente.
- `AI_PROVIDER_UNAVAILABLE`: liberar reserva, permitir retry seguro.
- `AI_GLOBAL_BUDGET_REACHED`: suspensão técnica de novas tasks pagas,
  claramente distinta de créditos pessoais esgotados.
- `TRIAL_EXPIRED`: Hub bloqueia operações conforme a política do produto.
- Preço de arquivo/batch deve ser cotado **antes** do upload/processamento
  e confirmado quando ultrapassar os limiares configurados.
- UI mobile deve mostrar saldo, expirations, histórico, 80%/100%,
  rótulos de crédito incluído/adicional, mensagem humanizada e opção
  de continuar manualmente, com i18n PT/EN/ES.

## Melhorias adicionais obrigatórias antes do lançamento

**A. Autoridade / Stripe / legados.**
Hub deve emitir access claims curtos e, para mudanças de assinatura,
notificar NestAI idempotentemente. `sourceRef` deve refletir ciclo de
cobrança estável, ex.: subscriptionId + billingPeriodStart + billingPeriodEnd.
Webhooks atrasados/duplicados, cancelamento, estorno, troca de plano,
reativação e mudança de data devem ter reconciliation job; nenhuma
concessão de plano sem entitlement comercial confirmado. Nunca migrar
ou resetar assinaturas/organizações MusicScale em produção.

**B. Resiliente a escala.**
Orçamentos reais devem reservar o pior custo permitido por tarefa
(inclusive retries/fallbacks/embedding/media), antes do provider,
com fechamento de todos os escopos (global, provider, task, ambiente,
app, org, usuário e trial). Usar contador transacional, não KV
eventualmente consistente como autoridade de gasto. Se todo o orçamento
é desconhecido, tráfego pago fica bloqueado. Limites de fornecedor
gratuito são compartilhados por conta, não multiplicáveis por tenant.
Separar compromisso comercial de capacidade free disponível.

**C. Custos e preços.**
Para cada rota guardar preço versão, unidade input/output, tokens
de raciocínio/cache quando informados, imagens, áudio, cambial USD/BRL,
custo medido e custo estimado. Separar custo de IA, infraestrutura,
storage, mensageria/WhatsApp, Stripe, impostos e suporte.
Definir break-even e margem por coorte incluindo P95 de utilização,
não apenas média. O console deve distinguir custo não medido de zero.
Não lançar pacotes de créditos adicionais sem definir expiração,
consumo FIFO e termo comercial/legal.

**D. Privacidade.**
Classificar P0-P4 antes de escolha de provider, sem enviar dados
privados a free tiers incompatíveis. Cache e hashes isolados por
org/app/task/versão; PII não entra no ledger nem logs.
Sanitização anti prompt-injection e guardas contra MIME falso, ZIP bomb,
payloads grandes e conteúdo adversarial em conversas importadas.

**E. Qualidade.**
A regra de 1 crédito = texto contextual é experimental:
definir limites de tokens, contexto e resposta. Na falta de grounding
ou schema válido, nenhuma cobrança. Cache tenant-safe deve ser
gratuito ou cobrança explícita. Confirmar aprovação humana para ações
que enviam mensagens, agendam, alteram preços ou dados financeiros.

**F. Fairness.**
Rate limits por tenant e usuário, controle por prioridade e planejamento
de capacidade: 10, 100, 500 e 1.000 empresas, picos e cargas
heterogêneas, incluindo médias, P95 e pior caso. Não fazer overbooking
de crédito comercial com provider free insuficiente.

**G. Retenção, resiliência e reconciliação.**
Manter log append-only auditável; reconciliar somas de grants,
reservas, allocations, settlements/refunds diariamente. Expiração
do grant nunca apaga a trilha. DR/backup e restore de D1 testado.
Ações de charge/settle não poderão ficar indefinidamente pendentes
após falhas entre provider e persistência.

## Como cada produto consome NestAI

| Produto | Autorização/comercial | Observação de produto |
| --- | --- | --- |
| NestLocal | Primeira implantação de créditos por org/app | Orçamentos, lead follow-up, print/áudio/import sob confirmação; WhatsApp opcional; custo de mensagens separado |
| MusicScale | **Preservar planos/benefícios legados** | IA de músicas/comunicação opt-in em fase posterior; calendário/escalas/metrônomo determinísticos |
| NestFinance | Futuro tier próprio, nunca herdar crédito Local | Dados P3, OCR com revisão, saldo e fechamento determinísticos |
| MillionsNest Connect | Futuro tier e mensageria por uso | IA de respostas e transcrição; custo WhatsApp/provider separado; não enviar sem autorização |
| NestJourney | Futuro tier próprio, sensibilidade religiosa P3 | Acolhimento e OCR com consentimento/revisão; não monetizar dado pastoral indiscriminadamente |
| NestAffiliate | Custos unitários de imagem muito variáveis | Precificar criativo separado de texto; confirmação de publicação |
| NestLume | Cota guest separada das organizações pagas | RAG com evidências, versões bíblicas licenciadas, defesa anti-abuso |
| Hub | **Não compra créditos como segundo checkout** | Identidade, subscription, trial, grant source e auditoria comercial |
| Futuros apps | Manifest + tasks + políticas por produto | Reutilizam ledger, provider router e budgets globais sem herdar preço NestLocal |

## Gates de ativação (NÃO contornar)

1. PR aprovado e CI com lint/typecheck/test/build/SQL/Worker dry-run verdes;
   executar migração 0008 em staging com backup e plano de rollback.
2. Hub com JWT `aiEntitlement` real, emissão service-to-service de grants
   assinados, replay de webhooks e janela de trial cronológica testados.
3. Certificar 5–10 prestadores NestLocal: prints, áudio, texto, importação,
   cache, concorrência, estorno, indisponibilidade e orçamento real.
4. Provar que MusicScale legado e demais sete apps não mudaram em
   contratação, execução, permissão ou histórico.
5. Simular concorrência e exaustão (crédito individual, cota global
   FREE_ONLY e possível gasto pago). Medir margem e capacidade do pior caso.
6. Aprovar preços e cota definitivos somente depois de COGS;
   CEO deve autorizar explicitamente cada habilitação de provider pago.
7. Canary org-by-org + monitoramento + rollback e revisão legal/LGPD.

**Importante:** o simples flip de `AI_COMMERCIAL_CREDITS_ENABLED`
não é um procedimento de lançamento. Os itens pendentes acima devem
ser integrados e certificados antes de habilitá-la.
