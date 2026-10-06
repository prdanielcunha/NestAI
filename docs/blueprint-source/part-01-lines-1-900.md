
































NestAI — MillionsNest Intelligence Platform


MILLIONSNEST  /  NESTAI
NestAI — MillionsNest Intelligence Platform
Blueprint Mestre de Produto, Arquitetura, UX/UI, Segurança, IA e Implementação
Versão 1.0  •  Proposta canônica para implementação  •  MillionsNest
2026-10-06

Um único cérebro operacional de IA para todo o ecossistema MillionsNest.
O NestAI não é mais um chatbot. É a camada central que autentica, classifica, protege, roteia, executa, observa, mede e evolui toda utilização de inteligência artificial de MusicScale, NestFinance, NestJourney, NestLocal, MillionsNest Connect, NestAffiliate, NestLume, MillionsNest Hub e futuros produtos.

Índice de seções
Mapa rápido das seções que compõem este blueprint mestre. O documento é mantido como especificação viva do NestAI.
	0. Resumo executivo
	35. Data model — control plane
	70. Analytics de produto

	1. Visão do produto
	36. API contract
	71. Privacy-aware analytics

	2. Princípios arquiteturais obrigatórios
	37. Idempotência
	72. UX de transparência para usuário final

	3. Stack estratégica de IA — fase gratuita
	38. Cache
	73. UX para confiança

	4. Cloudflare AI Gateway como infraestrutura inferior
	39. Uso por projeto
	74. Prompt architecture

	5. Domínios e endereços
	40. Background jobs
	75. Localization

	6. Estrutura do repositório
	41. Graceful degradation
	76. Backup e recuperação

	7. Componentes principais
	42. Error UX
	77. Disaster recovery

	8. Autenticação e integração com o Hub
	43. Health system
	78. Runbooks

	9. Integração automática de apps
	44. Feature flags
	79. Alertas

	10. Segurança
	45. CI/CD
	80. Kill switches

	11. Routing Engine
	46. Testes
	81. Admin permissions

	12. Streaming e performance
	47. SLOs e qualidade
	82. Ambientes visuais

	13. Quotas e ZERO COST MODE
	48. Paid readiness sem paid dependency
	83. Console — microinterações importantes

	14. Quando ativar IA paga no futuro
	49. Secret management
	84. Empty states

	15. Storage
	50. AI Gateway logging policy
	85. Onboarding do NestAI

	16. RAG e Knowledge Layer
	51. Guardrails
	86. Setup inicial de credenciais

	17. Structured Output
	52. Human-in-the-loop
	87. Licenças de modelos

	18. Tools e Agent Actions
	53. Explainability operacional
	88. Free plan change defense

	19. Observabilidade
	54. Incidents
	89. Futuro: local/on-device AI

	20. Evaluation Lab
	55. Design responsivo
	90. Futuro: voice agents

	21. UX/UI — direção visual
	56. Acessibilidade
	91. Futuro: customer-specific knowledge

	22. Estrutura de navegação
	57. Command palette
	92. Futuro: paid plan AI entitlements

	23. Tela 1 — Command Center
	58. Environments
	93. Futuro: AI Quality SLAs

	24. Tela 2 — Apps
	59. Config-as-code + UI
	94. Critérios de aceite — MVP técnico

	25. Tela 3 — Task Registry
	60. ADRs
	95. Critérios de aceite — experiência

	26. Tela 4 — Visual Router
	61. Roadmap de implementação
	96. Critérios de aceite — integração automática

	27. Tela 5 — Providers
	62. Migração dos apps atuais
	97. Definition of Done

	28. Tela 6 — Prompt Studio
	63. O que será central x local
	98. Decisão final de arquitetura

	29. Tela 7 — Knowledge
	64. Performance safeguards
	99. Sequência recomendada para começar

	30. Tela 8 — Evaluations
	65. Falhas que o projeto deve prevenir
	100. Research snapshot — 06/10/2026

	31. Tela 9 — Observability
	66. Painel de decisão para modelos
	101. Regra canônica para o futuro

	32. Tela 10 — Policies
	67. Provider review process
	102. North Star

	33. Tela 11 — Cost & Quota
	68. Model deprecations
	

	34. Tela 12 — Audit
	69. Versionamento
	




0. Resumo executivo
0.1 Nome recomendado
Nome de produto: NestAI
Nome formal: NestAI — MillionsNest Intelligence Platform
Projeto no ChatGPT: MillionsNest AI Platform
Repositório GitHub: millionsnest-ai
Domínio canônico: ai.millionsnest.com
Pacote/SDK: @millionsnest/ai
Worker/API: millionsnest-ai-gateway
ID sugerido do Cloudflare AI Gateway: millionsnest-ai
O domínio curto ai.millionsnest.com é preferível a nestai.millionsnest.com porque esta plataforma é infraestrutura oficial de todo o ecossistema, não apenas mais um produto final.
0.2 Objetivo
Construir uma plataforma central que permita que qualquer aplicativo MillionsNest peça uma capacidade de IA sem conhecer:
· o provedor;
· o modelo;
· a API key;
· a cota;
· o fallback;
· a política de privacidade;
· o prompt de sistema;
· o esquema de saída;
· o custo;
· a estratégia de cache;
· o mecanismo de RAG;
· as regras de segurança.
O aplicativo declara o que precisa. O NestAI decide como executar.
Exemplo:
const result = await ai.run("customer.reply", {
  conversationId,
  organizationId,
});
O MusicScale, Connect ou NestLocal não deve conter algo como:
model: "openai/gpt-oss-120b"
apiKey: process.env.GROQ_API_KEY
A escolha do modelo pertence à plataforma.
0.3 Princípio central
Apps descrevem intenção. NestAI resolve execução. MillionsNest continua resolvendo autoridade.
O NestAI não substitui:
· autenticação;
· organização;
· membership;
· billing;
· entitlement;
· RBAC;
· regras financeiras;
· regras de escala;
· agenda;
· autorização administrativa.
A fórmula canônica de acesso do ecossistema continua sendo autoridade do MillionsNest Hub:
identidade válida + organização válida + membership ativo + app instalado/habilitado + entitlement válido + acesso individual + capability + scope + políticas adicionais.
O NestAI apenas recebe uma prova confiável dessa autorização e executa a capacidade de IA permitida.

1. Visão do produto
1.1 O problema que o NestAI resolve
Sem uma plataforma central, cada produto tenderia a criar:
· sua própria integração com Groq;
· sua própria integração com Gemini;
· sua própria API key;
· prompts duplicados;
· políticas de privacidade diferentes;
· tratamento de erro diferente;
· observabilidade fragmentada;
· modelos desatualizados espalhados pelo código;
· custos imprevisíveis;
· segurança inconsistente;
· retrabalho toda vez que um modelo é substituído.
Isso não escala.
O NestAI transforma o ecossistema em:
flowchart LR
    MS[MusicScale]
    NF[NestFinance]
    NJ[NestJourney]
    NL[NestLocal]
    CN[MillionsNest Connect]
    NA[NestAffiliate]
    LU[NestLume]
    HUB[MillionsNest Hub]
    FUT[Futuros Apps]

    AI[NestAI]

    MS --> AI
    NF --> AI
    NJ --> AI
    NL --> AI
    CN --> AI
    NA --> AI
    LU --> AI
    HUB --> AI
    FUT --> AI

    AI --> G[Groq]
    AI --> CF[Cloudflare Workers AI]
    AI --> GEM[Gemini]
    AI --> MIS[Mistral]
    AI -. futuro .-> PAID[OpenAI / Anthropic / outros]
1.2 O que o NestAI será
1. AI Gateway proprietário do ecossistema
1. AI Router semântico
1. Policy Engine
1. Privacy Firewall
1. Prompt Registry
1. Model Registry
1. Provider Registry
1. RAG / Knowledge Layer
1. Evaluation Lab
1. Quota & Cost Controller
1. Observability Center
1. AI SDK
1. App Registry
1. Job Engine para tarefas assíncronas
1. Painel administrativo visual
1. Camada pronta para modelos pagos futuros
1.3 O que ele não será
Não será:
· um segundo Hub;
· um segundo sistema de permissões;
· um banco paralelo de membros;
· um lugar para armazenar indiscriminadamente conversas pastorais;
· um executor autônomo de ações financeiras;
· um agente com acesso administrativo irrestrito;
· uma dependência rígida de um único provedor;
· uma desculpa para transformar regras determinísticas em prompts.

2. Princípios arquiteturais obrigatórios
2.1 IA interpreta; o sistema decide
LLMs podem:
· interpretar;
· resumir;
· classificar;
· extrair;
· redigir;
· sugerir;
· explicar;
· comparar;
· recuperar contexto;
· propor uma próxima ação.
LLMs não são autoridade final para:
· dinheiro;
· saldo;
· conciliação;
· permissões;
· assinatura;
· entitlement;
· agenda real;
· disponibilidade real;
· criação de usuário;
· alteração de cargo;
· exclusão de dados;
· envio irreversível;
· lançamento financeiro;
· decisões pastorais sensíveis.
2.2 Privacy before routing
A classificação de sensibilidade ocorre antes da escolha do provedor.
Nunca:
escolher Gemini
→ depois descobrir que o conteúdo era sensível
Sempre:
classificar dado
→ aplicar política
→ selecionar provedores permitidos
→ executar
2.3 Zero-cost first
O estado inicial da plataforma será:
AI_BILLING_MODE=FREE_ONLY
ALLOW_PAID_FALLBACK=false
AUTO_UPGRADE_PROVIDER=false
Nenhum limite gratuito poderá gerar cobrança silenciosa.
2.4 Provider-agnostic
Todo recurso deve usar contratos internos do NestAI.
Trocar:
GPT-OSS 120B
por:
modelo futuro melhor
não deve exigir deploy dos aplicativos consumidores.
2.5 Evidence-first
Respostas baseadas em documentos, Bíblia, políticas, preços ou dados organizacionais devem carregar referências rastreáveis (evidenceRefs).
2.6 Multi-tenant by construction
Organização é parte estrutural de:
· autorização;
· logs;
· quotas;
· cache;
· RAG;
· embeddings;
· arquivos;
· ferramentas;
· métricas;
· políticas.
Nunca confiar em organizationId enviado pelo cliente como autoridade isolada.
2.7 Mobile First + Desktop Excellent
O console administrativo será prioritariamente desktop por sua natureza operacional, porém todas as telas devem funcionar integralmente em celular.
2.8 i18n desde o primeiro commit
Idiomas obrigatórios:
· pt-BR
· en
· es
Prompts, templates, interface, datas, números, moeda e mensagens devem ser localizáveis.

3. Stack estratégica de IA — fase gratuita
3.1 Camada principal
Groq
Uso principal:
· texto operacional;
· classificação;
· extração estruturada;
· raciocínio;
· resumo;
· respostas;
· transcrição.
Modelos iniciais preferenciais:
· openai/gpt-oss-120b
· openai/gpt-oss-20b
· whisper-large-v3-turbo
· whisper-large-v3
Snapshot pesquisado em 06/10/2026:
	Modelo
	RPM Free
	RPD Free
	TPM Free
	TPD Free

	GPT-OSS 120B
	30
	1.000
	8.000
	200.000

	GPT-OSS 20B
	30
	1.000
	8.000
	200.000

	Whisper Large V3
	20
	2.000
	—
	28.800 s/dia

	Whisper Large V3 Turbo
	20
	2.000
	—
	28.800 s/dia


A plataforma não deve hard-code esses números. Eles entram no Provider Registry como configuração atualizável.
3.2 Cloudflare Workers AI
Funções:
· fallback;
· visão;
· embeddings;
· texto;
· imagem;
· transcrição;
· execução próxima ao gateway.
Modelos iniciais candidatos:
· @cf/zai-org/glm-4.7-flash
· @cf/google/gemma-4-26b-a4b-it
· @cf/qwen/qwen3-embedding-0.6b
· @cf/openai/whisper-large-v3-turbo ou equivalente disponível no catálogo atual
· @cf/black-forest-labs/flux-1-schnell
· @cf/black-forest-labs/flux-2-klein-4b
Snapshot atual:
· Workers AI: 10.000 Neurons/dia gratuitos
· acima disso, no plano Free, novas operações falham em vez de gerar cobrança;
· alguns modelos específicos exigem Workers Paid, portanto todo modelo possui flag freeEligible.
3.3 Gemini API Free
Uso permitido inicialmente:
· conteúdo público;
· materiais de marketing;
· análise multimodal não sensível;
· ferramentas internas sem dados privados.
Não usar no Free Tier para:
· dados financeiros;
· contato de clientes;
· conversas privadas;
· acompanhamento pastoral;
· dados religiosos identificáveis;
· comprovantes;
· informações confidenciais;
· fluxos de apps provavelmente acessados por menores quando os termos aplicáveis não permitirem.
O Provider Policy deve conseguir bloquear Gemini por:
· sensibilidade;
· app;
· feature;
· faixa etária/uso provável;
· região;
· tenant.
3.4 Mistral
Uso inicial:
· laboratório;
· fallback controlado;
· OCR/visão quando apropriado;
· benchmark de modelos;
· testes de qualidade.
Nenhum dado sensível deve ser encaminhado simplesmente porque o provedor principal falhou.
3.5 Camada paga futura
Preparar adapters para:
· OpenAI;
· Anthropic;
· Google pago;
· Groq Developer;
· Cloudflare Workers Paid;
· Mistral pago;
· outros providers compatíveis com HTTPS/OpenAI format.
Entretanto:
paidAllowed = false
por padrão.

4. Cloudflare AI Gateway como infraestrutura inferior
O NestAI não deve reinventar recursos já maduros.
Usaremos Cloudflare AI Gateway como camada de transporte/observabilidade quando apropriado porque atualmente oferece:
· analytics;
· caching;
· rate limiting;
· observabilidade;
· integração nativa com Groq;
· Google AI Studio;
· Mistral;
· Workers AI;
· OpenAI;
· Anthropic;
· vários outros provedores;
· custom providers;
· fallback;
· Dynamic Routing;
· custom metadata;
· guardrails;
· DLP;
· cost tracking.
4.1 O que continua sendo responsabilidade do NestAI
Cloudflare AI Gateway não substitui:
· autorização MillionsNest;
· tenant isolation;
· taxonomia de tarefas;
· sensibilidade de dados;
· decisão de negócio;
· Prompt Registry;
· RAG por domínio;
· evidências;
· entitlement;
· políticas por produto;
· consentimento;
· tool authorization;
· avaliação de qualidade;
· rollout de prompts;
· governança interna.
Arquitetura:
flowchart TD
    APP[App MillionsNest]
    SDK[@millionsnest/ai]
    EDGE[NestAI Edge API]
    AUTH[Auth + Policy + Tenant]
    ROUTER[NestAI Semantic Router]
    CFG[Task / Prompt / Model Registry]
    AIG[Cloudflare AI Gateway]
    PROVIDERS[Providers de IA]

    APP --> SDK
    SDK --> EDGE
    EDGE --> AUTH
    AUTH --> ROUTER
    ROUTER --> CFG
    ROUTER --> AIG
    AIG --> PROVIDERS

5. Domínios e endereços
5.1 Domínio canônico
https://ai.millionsnest.com
Uso:
· Console administrativo;
· API;
· documentação autenticada;
· health/status interno.
Rotas:
https://ai.millionsnest.com/
https://ai.millionsnest.com/apps
https://ai.millionsnest.com/tasks
https://ai.millionsnest.com/providers
https://ai.millionsnest.com/routes
https://ai.millionsnest.com/prompts
https://ai.millionsnest.com/knowledge
https://ai.millionsnest.com/evals
https://ai.millionsnest.com/observability
https://ai.millionsnest.com/policies
https://ai.millionsnest.com/audit

https://ai.millionsnest.com/v1/run
https://ai.millionsnest.com/v1/chat/stream
https://ai.millionsnest.com/v1/transcribe
https://ai.millionsnest.com/v1/vision
https://ai.millionsnest.com/v1/embeddings
https://ai.millionsnest.com/v1/image
https://ai.millionsnest.com/v1/rag/query
https://ai.millionsnest.com/v1/jobs
https://ai.millionsnest.com/v1/health
5.2 Alias futuro
Se operacionalmente útil:
gateway.ai.millionsnest.com
Não é necessário no MVP.

6. Estrutura do repositório
6.1 Repositório
prdanielcunha/millionsnest-ai
ou organização GitHub da MillionsNest quando consolidada.
6.2 Monorepo recomendado
millionsnest-ai/
├── apps/
│   ├── console/
│   │   ├── src/
│   │   ├── public/
│   │   └── ...
│   │
│   └── gateway/
│       ├── src/
│       │   ├── auth/
│       │   ├── routing/
│       │   ├── policy/
│       │   ├── providers/
│       │   ├── prompts/
│       │   ├── rag/
│       │   ├── tools/
│       │   ├── quotas/
│       │   ├── jobs/
│       │   ├── observability/
│       │   └── api/
│       └── wrangler.jsonc
│
├── packages/
│   ├── ai-client/
│   ├── contracts/
│   ├── task-registry/
│   ├── model-registry/
│   ├── policy-engine/
│   ├── prompt-core/
│   ├── eval-core/
│   ├── telemetry/
│   └── shared/
│
├── configs/
│   ├── apps/
│   ├── tasks/
│   ├── providers/
│   ├── routes/
│   ├── policies/
│   └── prompts/
│
├── evals/
│   ├── datasets/
│   ├── graders/
│   └── reports/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── PRIVACY.md
│   ├── PROVIDERS.md
│   ├── TASKS.md
│   ├── APP_ONBOARDING.md
│   ├── RAG.md
│   ├── RUNBOOK.md
│   └── ADR/
│
├── scripts/
│   ├── bootstrap/
│   ├── migrate/
│   ├── register-app/
│   └── verify/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-main.yml
│       ├── deploy-production.yml
│       ├── eval-regression.yml
│       └── security.yml
│
├── millionsnest.ai.json
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── AGENTS.md
6.3 Linguagem
TypeScript end-to-end.
Motivos:
· compatibilidade com o ecossistema;
· excelente suporte no Cloudflare Workers;
· contratos compartilhados entre SDK e gateway;
· validação de tipos;
· menor complexidade operacional.
6.4 Runtime
Gateway:
· Cloudflare Workers;
· TypeScript;
· APIs web padrão;
· streaming SSE;
· WebSocket somente onde realmente necessário futuramente.
Console:
· React;
· Vite;
· TypeScript;
· Tailwind;
· design system compartilhado;
· PWA apenas se trouxer benefício real.
Node para tooling:
· Node 20+ ou versão canônica do ecossistema enquanto houver compatibilidade.

7. Componentes principais
7.1 Edge API
Responsável por:
· receber requisição;
· validar tamanho/formato;
· gerar requestId;
· autenticar;
· identificar app;
· identificar tenant;
· verificar entitlement/capability;
· validar App Check;
· aplicar limites;
· chamar Policy Engine;
· iniciar streaming;
· devolver resposta padronizada.
7.2 Semantic Router
O Router não deve usar um LLM para decidir o modelo na maioria dos casos.
Roteamento deve ser determinístico e rápido.
Entrada:
type AIRouteRequest = {
  taskId: string;
  appId: string;
  organizationId: string;
  userId?: string;

  modality: "text" | "vision" | "audio" | "image" | "embedding";
  sensitivity: "public" | "internal" | "personal" | "sensitive" | "restricted";
  quality: "fast" | "balanced" | "high";
  latency: "interactive" | "background";
  locale: "pt-BR" | "en" | "es";

  streaming?: boolean;
};
Saída:
type AIRouteDecision = {
  routeId: string;
  provider: string;
  model: string;
  fallbackChain: string[];
  cachePolicy: string;
  retentionPolicy: string;
  timeoutMs: number;
  reasonCode: string;
};
7.3 Task Registry
Nenhum app chama “um modelo”.
Ele chama uma tarefa.
Exemplos:
connect.message.classify
connect.reply.suggest
connect.audio.transcribe

nestlocal.request.extract
nestlocal.quote.compose
nestlocal.followup.compose

journey.form.extract
journey.followup.summarize

finance.receipt.extract
finance.report.explain

musicscale.song.structure
musicscale.team.message.compose

nestlume.study.answer
nestlume.entity.explain

affiliate.product.analyze
affiliate.pin.copy
affiliate.creative.generate
Cada tarefa define:
id: connect.reply.suggest
version: 1
owner: millionsnest-connect

modality: text
defaultQuality: high
defaultSensitivity: personal
streaming: true

allowedProviders:
  - groq
  - cloudflare

blockedProviders:
  - gemini-free

output:
  type: text

tools:
  - customer_context.read
  - company_policy.read

cache:
  mode: disabled

retention:
  payloadLogs: false

approval:
  requiredForToolWrites: true
7.4 Model Registry
Schema:
id: groq:gpt-oss-120b
provider: groq
providerModelId: openai/gpt-oss-120b

status: production
freeEligible: true
paidRequired: false

capabilities:
  text: true
  vision: false
  audioIn: false
  imageOut: false
  tools: true
  structuredOutput: true
  reasoning: true

privacy:
  maxSensitivity: sensitive
  requiresZdr: true

limits:
  rpm: 30
  rpd: 1000
  tpm: 8000
  tpd: 200000

health:
  enabled: true

routing:
  qualityScore: 0.92
  speedScore: 0.80
  costScore: 1.00
Esses valores são operacionais e devem ser atualizáveis sem redeploy dos apps.
7.5 Provider Registry
Cada provider define:
· status;
· credencial armazenada;
· free/pago;
· limites;
· privacidade;
· retenção;
· regiões;
· capabilities;
· modelos;
· circuit breaker;
· timeout;
· health checks;
· política de logs;
· data training;
· termos especiais;
· data de revisão dos termos.
7.6 Prompt Registry
Cada prompt possui:
· promptId;
· versão;
· idioma;
· task;
· sistema;
· instruções;
· schema;
· exemplos;
· variáveis;
· changelog;
· autor;
· status;
· dataset de regressão;
· score;
· data de publicação.
Estados:
draft
→ testing
→ canary
→ production
→ deprecated
→ archived
Nunca editar silenciosamente um prompt de produção.
7.7 Policy Engine
Avalia:
· usuário;
· organização;
· app;
· task;
· capability;
· entitlement;
· modalidade;
· sensibilidade;
· provedor permitido;
· ferramenta permitida;
· quota;
· retenção;
· região;
· cache;
· billing mode.
Resultado: