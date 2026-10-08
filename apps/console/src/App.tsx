import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { appCheckConfigured, signIn, signOutConsole, watchUser } from "./firebase";
import * as api from "./api";
import { messages, tr, type Locale } from "./i18n";

type NavItem = {
  path: string;
  key: keyof typeof messages["pt-BR"];
  short: string;
};

const navItems: NavItem[] = [
  { path: "/", key: "overview", short: "01" },
  { path: "/apps", key: "apps", short: "02" },
  { path: "/tasks", key: "tasks", short: "03" },
  { path: "/routes", key: "routes", short: "04" },
  { path: "/providers", key: "providers", short: "05" },
  { path: "/prompts", key: "prompts", short: "06" },
  { path: "/knowledge", key: "knowledge", short: "07" },
  { path: "/evals", key: "evals", short: "08" },
  { path: "/observability", key: "observability", short: "09" },
  { path: "/policies", key: "policies", short: "10" },
  { path: "/cost", key: "cost", short: "11" },
  { path: "/audit", key: "audit", short: "12" },
];

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (next: string) => {
    if (next === path) return;
    history.pushState({}, "", next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return { path, navigate };
}

function tone(value: unknown): "good" | "warn" | "bad" | "neutral" {
  const text = String(value ?? "").toLowerCase();
  if (/(ready|healthy|operational|pass|allowed|production|true)/.test(text)) return "good";
  if (/(watch|restricted|review|lab|degraded|conserve|preview)/.test(text)) return "warn";
  if (/(blocked|critical|exhausted|failed|error|false)/.test(text)) return "bad";
  return "neutral";
}

function StatusPill({ children }: { children: unknown }) {
  return <span className={"pill " + tone(children)}>{String(children ?? "—")}</span>;
}

function Card({ title, eyebrow, children, className = "" }: {
  title?: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {(eyebrow || title) && (
        <header className="panel-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return <pre className="json-preview">{JSON.stringify(value, null, 2)}</pre>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-orbit" aria-hidden="true"><span /></div>
      <p>{text}</p>
    </div>
  );
}

function SignInGate({ locale, user, onSignIn }: { locale: Locale; user: User | null; onSignIn: () => void }) {
  if (user && appCheckConfigured) return null;
  return (
    <Card className="access-card">
      <div className="access-copy">
        <div className="eyebrow">SECURE CONTROL PLANE</div>
        <h2>{tr(locale, "adminRequired")}</h2>
        <p>
          {user && !appCheckConfigured
            ? "Firebase App Check ainda precisa de uma site key de produção. O health público permanece disponível; dados administrativos continuam bloqueados."
            : "Entre com a autoridade canônica MillionsNest. O console não cria autenticação paralela e não possui provider keys no navegador."}
        </p>
      </div>
      {!user && <button className="primary" onClick={onSignIn}>{tr(locale, "signIn")}</button>}
    </Card>
  );
}

function OverviewPage({ locale, health, data }: { locale: Locale; health: api.Health | null; data: api.OverviewData | null }) {
  const usage = data?.providerUsage ?? {};
  return (
    <div className="page-grid">
      <div className="hero panel span-12">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">MILLIONSNEST / NESTAI</div>
            <h1>Intelligence Mission Control</h1>
            <p>Auth, policy, privacy, routing, providers, quota e observabilidade em uma única superfície operacional.</p>
          </div>
          <div className="hero-status">
            <span className="pulse" />
            <div>
              <strong>{health?.state === "operational" ? tr(locale, "healthy") : tr(locale, "degraded")}</strong>
              <small>FREE_ONLY · {tr(locale, "production")}</small>
            </div>
          </div>
        </div>
      </div>

      <div className="metrics-grid span-12">
        <Metric label={tr(locale, "requestsToday")} value={data?.requestsToday ?? "—"} sub="provider calls" />
        <Metric label={tr(locale, "privacyRejected")} value={data?.privacyRejected ?? "—"} sub="P4 / policy stops" />
        <Metric label={tr(locale, "rateLimited")} value={data?.rateLimited ?? "—"} sub="burst / abuse control" />
        <Metric label={tr(locale, "appsEnabled")} value={data?.appsEnabled ?? "—"} sub="registered apps" />
      </div>

      <Card title="Infrastructure health" eyebrow="LIVE" className="span-7">
        <div className="status-list">
          {Object.entries(health?.layers ?? {}).map(([key, value]) => (
            <div className="status-row" key={key}>
              <span>{key}</span><StatusPill>{value}</StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Provider readiness" eyebrow="ROUTING" className="span-5">
        <div className="status-list">
          {Object.entries(health?.providers ?? {}).map(([key, value]) => (
            <div className="status-row" key={key}>
              <span>{key}</span><StatusPill>{value}</StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Free capacity" eyebrow="ZERO COST MODE" className="span-12">
        {Object.keys(usage).length === 0
          ? <Empty text={tr(locale, "noData")} />
          : <div className="quota-grid">
              {Object.entries(usage).map(([provider, raw]) => {
                const item = raw;
                const remaining = item.remaining ?? 0;
                const pct = item.hardLimit ? Math.max(0, Math.round((remaining / item.hardLimit) * 100)) : 0;
                return (
                  <div className="quota-card" key={provider}>
                    <div className="quota-top"><strong>{provider}</strong><StatusPill>{item.quotaHealth}</StatusPill></div>
                    <div className="quota-number">{pct}%</div>
                    <div className="bar"><span style={{ width: pct + "%" }} /></div>
                    <small>{item.remaining ?? 0} requests free remaining</small>
                  </div>
                );
              })}
            </div>}
      </Card>
    </div>
  );
}

function AppsPage({ locale, data }: { locale: Locale; data: api.AppsData | null }) {
  const rows = data?.apps ?? [];
  return (
    <div className="page-grid">
      <PageIntro eyebrow="ECOSYSTEM" title="Apps" text="Integrações autorizadas a consumir capabilities do NestAI sem carregar provider secrets." />
      <div className="card-grid span-12">
        {rows.map((app) => (
          <Card key={app.appId}>
            <div className="entity-card">
              <div className="entity-head">
                <div><div className="eyebrow">{app.appId}</div><h3>{app.displayName}</h3></div>
                <StatusPill>{app.enabled ? "healthy" : "disabled"}</StatusPill>
              </div>
              <div className="entity-metrics">
                <span><strong>{app.taskCount}</strong> tasks</span>
                <span><strong>{app.defaultLocale}</strong> locale</span>
              </div>
              <div className="chips">{(app.allowedTasks ?? []).map((task: string) => <span key={task}>{task}</span>)}</div>
              <button className="secondary">Test app integration</button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <Card><Empty text={tr(locale, "noData")} /></Card>}
      </div>
    </div>
  );
}

function TasksPage({ locale, data }: { locale: Locale; data: api.TasksData | null }) {
  const rows = data?.tasks ?? [];
  return (
    <div className="page-grid">
      <PageIntro eyebrow="CANONICAL CAPABILITIES" title="Task Registry" text="Apps pedem intenção. Tasks versionadas definem sensibilidade, modalidade, output e limites." />
      <Card className="span-12">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Task</th><th>App</th><th>Modality</th><th>Sensitivity</th><th>Streaming</th><th>Schema</th><th>Priority</th></tr></thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id}>
                  <td><strong>{task.id}</strong><small>v{task.version}</small></td>
                  <td>{task.app}</td><td>{task.modality}</td><td><StatusPill>{task.defaultSensitivity}</StatusPill></td>
                  <td>{task.streaming ? "Yes" : "No"}</td><td>{task.structuredOutput ? "Validated" : "Text"}</td><td>{task.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty text={tr(locale, "noData")} />}
      </Card>
    </div>
  );
}

function RouterPage({ data }: { data: api.RoutesData | null }) {
  const rows = data?.routes ?? [];
  const selected = rows[0];
  return (
    <div className="page-grid">
      <PageIntro eyebrow="SEMANTIC ROUTING" title="Visual Router" text="Privacy e policy filtram candidatos antes de qualquer decisão de modelo." />
      <Card className="span-8 router-canvas">
        {selected ? (
          <div className="route-flow">
            <Node kind="task" label={selected.task} meta={"route v" + selected.version} />
            <Line />
            <Node kind="policy" label={"Sensitivity=" + selected.sensitivity} meta="classified before routing" />
            <Line />
            <Node kind="policy" label="FREE_ONLY" meta="paid fallback locked" />
            <div className="branch-line" />
            <div className="branch-grid">
              {(selected.candidates ?? []).slice(0, 3).map((candidate, index) => (
                <Node key={candidate.modelId} kind={index === 0 ? "primary" : "fallback"} label={candidate.provider} meta={index === 0 ? "primary" : "fallback"} />
              ))}
            </div>
          </div>
        ) : <Empty text="No routes registered." />}
      </Card>
      <Card title="Routes" eyebrow="VERSIONED" className="span-4">
        <div className="status-list dense">
          {rows.map((route) => <div className="status-row" key={route.id}><span>{route.task}</span><StatusPill>{route.primary?.provider ?? "none"}</StatusPill></div>)}
        </div>
      </Card>
    </div>
  );
}

function ProvidersPage({ data }: { data: api.ProvidersData | null }) {
  const rows = data?.providers ?? [];
  return (
    <div className="page-grid">
      <PageIntro eyebrow="SUPPLY LAYER" title="Providers" text="Eligibility, privacy ceiling, licensing and model inventory are explicit policy inputs." />
      <div className="provider-grid span-12">
        {rows.map((provider) => (
          <Card key={provider.id}>
            <div className="entity-card provider-card">
              <div className="entity-head">
                <div><div className="eyebrow">PROVIDER</div><h3>{provider.id.toUpperCase()}</h3></div>
                <StatusPill>{provider.status}</StatusPill>
              </div>
              <div className="provider-big">{provider.freeEligible ? "Free eligible" : "Paid / lab"}</div>
              <div className="kv"><span>Max sensitivity</span><strong>{provider.maxSensitivity}</strong></div>
              <div className="kv"><span>Data policy</span><strong>{provider.dataPolicy}</strong></div>
              <div className="kv"><span>Terms reviewed</span><strong>{provider.termsReviewedAt}</strong></div>
              <div className="chips">{(provider.models ?? []).map((m) => <span key={m.id}>{m.id}</span>)}</div>
              <div className="secret-row"><span>Secret</span><strong>{provider.id === "cloudflare" ? "Binding" : "Configured •••••••• / runtime"}</strong></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PromptsPage({ data }: { data: api.PromptsData | null }) {
  const rows = data?.prompts ?? [];
  const selected = rows[0];
  return (
    <div className="page-grid">
      <PageIntro eyebrow="VERSIONED PROMPT LAYER" title="Prompt Studio" text="Core prompt, locale, schema e promotion gate vivem no NestAI — não nos apps." />
      <Card className="span-6 prompt-pane">
        <div className="sticky-actions"><button className="secondary">Save Draft</button><button className="secondary">Run Eval</button><button className="primary">Publish</button></div>
        {selected ? <>
          <div className="eyebrow">{selected.taskId} · v{selected.version}</div>
          <h3>System policy</h3>
          <div className="code-panel">{selected.systemPolicyPreview}</div>
          <div className="kv"><span>Locales</span><strong>{(selected.locales ?? []).join(" · ")}</strong></div>
          <div className="kv"><span>Schema</span><strong>{selected.hasStructuredOutput ? "Required" : "Text"}</strong></div>
        </> : <Empty text="No prompts registered." />}
      </Card>
      <Card title="Test" eyebrow="SANITIZED INPUT" className="span-6 prompt-pane">
        <label className="field-label" htmlFor="prompt-test">Input</label>
        <textarea id="prompt-test" className="test-input" placeholder="Synthetic test input…" />
        <div className="test-output"><span className="muted">Output will appear here after an authorized eval run.</span></div>
      </Card>
    </div>
  );
}

function KnowledgePage({ data }: { data: api.KnowledgeData | null }) {
  const sources = data?.sources ?? [];
  const indexes = data?.indexes ?? [];
  const [sourceId, setSourceId] = useState("");
  const [appId, setAppId] = useState("nestlume");
  const [organizationId, setOrganizationId] = useState("");
  const [locale, setLocale] = useState<"pt-BR" | "en" | "es">("pt-BR");
  const [sensitivity, setSensitivity] = useState<"P0_PUBLIC" | "P1_INTERNAL">("P0_PUBLIC");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function ingest() {
    if (!sourceId.trim() || !organizationId.trim() || !text.trim()) {
      setActionStatus("Source ID, organization and text are required.");
      return;
    }
    setBusy(true);
    setActionStatus("");
    try {
      const result = await api.ingestKnowledge({
        sourceId: sourceId.trim(),
        appId,
        organizationId: organizationId.trim(),
        sensitivity,
        locale,
        ...(title.trim() ? { title: title.trim() } : {}),
        text: text.trim(),
      });
      setActionStatus(`Indexed ${result.chunks} chunk(s) · R2 ${result.storage.r2} · ${result.storage.quotaHealth ?? "n/a"}`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-grid">
      <PageIntro eyebrow="RAG / EVIDENCE" title="Knowledge" text="Sources and indexes remain tenant, app, locale and sensitivity scoped." />
      <Card title="Sources" eyebrow="AUTHORIZED" className="span-7">
        {sources.length ? <JsonPreview value={sources} /> : <Empty text="No indexed source yet." />}
      </Card>
      <Card title="Indexes" eyebrow="SAFE REINDEX" className="span-5">
        {indexes.length ? <JsonPreview value={indexes} /> : <Empty text="No production index yet." />}
      </Card>
      <Card title="Ingest / reindex source" eyebrow="ADMIN · P0/P1 ONLY" className="span-12">
        <div className="form-grid">
          <label className="field-label">Source ID<input value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="docs:study-guide:v1" /></label>
          <label className="field-label">Organization<input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="organization id" /></label>
          <label className="field-label">App
            <select value={appId} onChange={(e) => setAppId(e.target.value)}>
              {["millionsnest","musicscale","nestfinance","connect","nestjourney","nestlocal","nestaffiliate","nestlume"].map((id) => <option value={id} key={id}>{id}</option>)}
            </select>
          </label>
          <label className="field-label">Locale
            <select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
              <option value="pt-BR">pt-BR</option><option value="en">en</option><option value="es">es</option>
            </select>
          </label>
          <label className="field-label">Sensitivity
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as typeof sensitivity)}>
              <option value="P0_PUBLIC">P0_PUBLIC</option><option value="P1_INTERNAL">P1_INTERNAL</option>
            </select>
          </label>
          <label className="field-label">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional source title" /></label>
        </div>
        <label className="field-label" htmlFor="knowledge-text">Sanitized source text</label>
        <textarea id="knowledge-text" className="test-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste authorized P0/P1 knowledge…" />
        <div className="sticky-actions">
          <button className="primary" onClick={() => void ingest()} disabled={busy || !sourceId.trim() || !organizationId.trim() || !text.trim()}>
            {busy ? "Indexing…" : "Ingest / reindex"}
          </button>
          {actionStatus && <span className="muted" role="status">{actionStatus}</span>}
        </div>
      </Card>
    </div>
  );
}
function EvaluationsPage({ data }: { data: api.EvaluationsData | null }) {
  const suites = data?.suites ?? [];
  const runs = data?.runs ?? [];
  const [target, setTarget] = useState<api.EvalProbeInput["targetId"]>("cloudflare:bge-m3");
  const [probeResult, setProbeResult] = useState<api.EvalProbeResult | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function runProbe() {
    setBusy(true);
    setStatus("");
    setProbeResult(null);
    try {
      const base = { targetId: target, sanitized: true as const, sensitivity: "P0_PUBLIC" as const };
      const payload: api.EvalProbeInput =
        target === "cloudflare:bge-m3"
          ? { ...base, texts: ["NestAI sanitized multilingual evaluation sample.", "Amostra sanitizada de avaliação do NestAI."] }
          : target === "cloudflare:bge-reranker-base"
            ? { ...base, query: "NestAI zero-cost safe routing", contexts: ["NestAI routes free eligible models.", "Paid fallback stays locked.", "Unrelated synthetic context."] }
            : { ...base, prompt: "Synthetic evaluation only. Reply exactly with OK." };
      const result = await api.runEvalProbe(payload);
      setProbeResult(result);
      setStatus(`Live probe passed · ${result.target} · ${result.latencyMs} ms`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-grid">
      <PageIntro eyebrow="QUALITY GATE" title="Evaluations" text="Golden datasets and regression gates decide promotion — not intuition." />
      <div className="metrics-grid span-12">
        <Metric label="Persisted suites" value={suites.length} sub="D1 evaluation registry" />
        <Metric label="Persisted runs" value={runs.length} sub="auditable live probes" />
        <Metric label="Privacy" value="100" sub="sanitized-only evaluation boundary" />
        <Metric label="Production traffic" value="0" sub="candidate targets are eval-only" />
      </div>
      <Card title="Run sanitized live probe" eyebrow="EVALUATION LAB" className="span-12">
        <label className="field-label">Candidate target
          <select value={target} onChange={(e) => setTarget(e.target.value as api.EvalProbeInput["targetId"])}>
            <option value="cloudflare:bge-m3">Cloudflare · BGE-M3 embedding</option>
            <option value="cloudflare:bge-reranker-base">Cloudflare · BGE reranker</option>
            <option value="groq:gpt-oss-safeguard-20b">Groq · GPT-OSS Safeguard 20B (synthetic safety evaluation)</option>
            <option value="gemini:3.7-flash">Gemini · 3.7 Flash (public synthetic evaluation)</option>
            <option value="groq:qwen3.8-27b">Groq · Qwen 3.8 27B candidate</option>
            <option value="nvidia-nim:gpt-oss-20b-eval">NVIDIA NIM · GPT-OSS 20B eval-only</option>
          </select>
        </label>
        <p className="muted">Only public/synthetic evaluation fixtures are sent. Quotas are enforced and counted, paid fallback is disabled, and candidate models never handle customer traffic.</p>
        <div className="sticky-actions">
          <button className="primary" onClick={() => void runProbe()} disabled={busy}>{busy ? "Running…" : "Run sanitized live probe"}</button>
          {status && <span className="muted" role="status">{status}</span>}
        </div>
        {probeResult && <JsonPreview value={probeResult} />}
      </Card>
      <Card title="Eval suites" className="span-6">{suites.length ? <JsonPreview value={suites} /> : <Empty text="No persisted eval suite yet." />}</Card>
      <Card title="Recent runs" className="span-6">{runs.length ? <JsonPreview value={runs} /> : <Empty text="No persisted eval run yet." />}</Card>
    </div>
  );
}
function ObservabilityPage({ data }: { data: api.ObservabilityData | null }) {
  const providerHealth = data?.providerHealth ?? [];
  const events = data?.events ?? [];
  const traces = data?.traces ?? [];
  const alerts = data?.alerts ?? [];
  const incidents = data?.incidents ?? [];
  const slo = data?.slo;
  const percent = (value: number | undefined) => value === undefined ? "—" : (value * 100).toFixed(2) + "%";
  return (
    <div className="page-grid">
      <PageIntro eyebrow="NO PRIVATE PAYLOADS" title="Observability" text="Request IDs, timings, outcomes, quota and fallback metadata without prompt/output logging." />
      <div className="metrics-grid span-12">
        <Metric label="Requests traced" value={slo?.totalRequests ?? "—"} />
        <Metric label="p95 latency" value={slo?.p95Ms === undefined ? "—" : slo.p95Ms + " ms"} />
        <Metric label="Fallback rate" value={percent(slo?.fallbackRate)} />
        <Metric label="Schema failures" value={percent(slo?.schemaFailureRate)} />
      </div>
      <Card title="Provider health" eyebrow="LAST 100 SAMPLES" className="span-5">
        {providerHealth.length ? <JsonPreview value={providerHealth} /> : <Empty text="Health samples will appear after provider traffic lands." />}
      </Card>
      <Card title="Active alerts & incidents" eyebrow="SLO AUTOMATION" className="span-7">
        {(alerts.length || incidents.length)
          ? <JsonPreview value={{ alerts, incidents }} />
          : <Empty text="No SLO alert or incident is currently recorded." />}
      </Card>
      <Card title="Recent traces" eyebrow="REQUEST ID" className="span-7">
        {traces.length ? <JsonPreview value={traces} /> : <Empty text="No privacy-safe trace has been persisted today." />}
      </Card>
      <Card title="Metadata events" eyebrow="POLICY / RATE" className="span-5">
        {events.length ? <JsonPreview value={events} /> : <Empty text="No metadata events today." />}
      </Card>
    </div>
  );
}

function PoliciesPage({ data }: { data: api.PoliciesData | null }) {
  const policy = data?.policies ?? {};
  return (
    <div className="page-grid">
      <PageIntro eyebrow="EXPLICIT GOVERNANCE" title="Policies" text="Privacy ceilings, billing locks and provider eligibility are visible and versionable." />
      <Card title="Data classes" className="span-7">
        <div className="policy-grid">
          {Object.entries(policy.dataClasses ?? {}).map(([key, value]) => (
            <div className="policy-row" key={key}><strong>{key}</strong><StatusPill>{(value as { external?: string }).external}</StatusPill></div>
          ))}
        </div>
      </Card>
      <Card title="Billing policy" className="span-5">
        <div className="lock-card">
          <div className="lock-mark">0</div>
          <h3>FREE_ONLY</h3>
          <p>Automatic paid fallback is disabled. Paid providers remain locked until explicit future approval.</p>
          <StatusPill>{policy.paidProvidersLocked ? "LOCKED" : "UNLOCKED"}</StatusPill>
        </div>
      </Card>
    </div>
  );
}

function CostPage({ locale, data }: { locale: Locale; data: api.CostData | null }) {
  const usage = data?.usage ?? [];
  const r2 = data?.r2;
  const pct = (value: number | undefined) => value === undefined ? "—" : Math.round(value * 100) + "%";
  const gb = (bytes: number | undefined) => bytes === undefined ? "—" : (bytes / 1_000_000_000).toFixed(2) + " GB";
  return (
    <div className="page-grid">
      <PageIntro eyebrow="ECONOMICS" title="Cost & Quota" text="Capacity is treated as a budget even while actual provider spend is zero." />
      <div className="metrics-grid span-12">
        <Metric label={tr(locale, "actualSpend")} value={"R$ " + Number(data?.actualSpendBrl ?? 0).toFixed(2).replace(".", ",")} />
        <Metric label="R2 safety state" value={r2?.health ?? "—"} sub={"highest usage " + pct(r2?.highestFraction)} />
        <Metric label="R2 storage" value={gb(r2?.storageBytes)} sub={"free-tier use " + pct(r2?.storageFraction)} />
        <Metric label={tr(locale, "paidProviders")} value={tr(locale, "locked")} sub="FREE_ONLY hard lock" />
      </div>
      <Card title="R2 zero-cost guard" eyebrow="50% WATCH · 60% CONSERVE · 70% BLOCK · 80% HARD LOCK" className="span-7">
        <div className="quota-grid">
          <div className="quota-card">
            <div className="quota-top"><strong>Storage</strong><StatusPill>{r2?.health ?? "—"}</StatusPill></div>
            <div className="quota-number">{pct(r2?.storageFraction)}</div>
            <div className="bar"><span style={{ width: Math.min(100, Math.round((r2?.storageFraction ?? 0) * 100)) + "%" }} /></div>
            <small>{gb(r2?.remaining?.storageBytes)} free-tier headroom</small>
          </div>
          <div className="quota-card">
            <div className="quota-top"><strong>Class A</strong><StatusPill>{pct(r2?.classAFraction)}</StatusPill></div>
            <div className="quota-number">{Number(r2?.classAOps ?? 0).toLocaleString()}</div>
            <small>{Number(r2?.remaining?.classAOps ?? 0).toLocaleString()} operations remaining</small>
          </div>
          <div className="quota-card">
            <div className="quota-top"><strong>Class B</strong><StatusPill>{pct(r2?.classBFraction)}</StatusPill></div>
            <div className="quota-number">{Number(r2?.classBOps ?? 0).toLocaleString()}</div>
            <small>{Number(r2?.remaining?.classBOps ?? 0).toLocaleString()} operations remaining</small>
          </div>
        </div>
      </Card>
      <Card title={tr(locale, "autopilot")} eyebrow="FREE_ONLY · READ ONLY · NO PAID FALLBACK" className="span-12">
        <p>{tr(locale, "autopilotIntro")}</p>
        {(data?.freeCapacityAdvisory?.length ?? 0) > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Provider</th><th>{tr(locale, "quotaStatus")}</th><th>{tr(locale, "remainingQuota")}</th><th>{tr(locale, "providerHealth")}</th><th>{tr(locale, "recommendation")}</th></tr></thead>
              <tbody>
                {data?.freeCapacityAdvisory?.map((item) => (
                  <tr key={item.provider}>
                    <td><strong>{item.provider}</strong><small>{item.usageCalls.toLocaleString()} {tr(locale, "callsCount")}</small></td>
                    <td><StatusPill>{item.quota}</StatusPill><small>{tr(locale, "sharedLimit")}: {item.sharedLimit.toLocaleString()}</small></td>
                    <td>{item.remaining.toLocaleString()} / {item.freeHardLimit.toLocaleString()}</td>
                    <td><StatusPill>{item.health}</StatusPill></td>
                    <td><strong>{item.recommendation.replaceAll("_", " ")}</strong><small>{item.reason}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty text={tr(locale, "noHealth")} />}
        <small>{tr(locale, "autopilotNote")}</small>
      </Card>
      <Card title="Provider quota policies" className="span-5"><JsonPreview value={data?.policies ?? {}} /></Card>
      <Card title="Usage dimensions" className="span-12">{usage.length ? <JsonPreview value={usage} /> : <Empty text="No usage rows today." />}</Card>
    </div>
  );
}

function AuditPage({ data }: { data: api.AuditData | null }) {
  const events = data?.events ?? [];
  return (
    <div className="page-grid">
      <PageIntro eyebrow="IMMUTABLE CHANGE TRAIL" title="Audit" text="Critical config, route, prompt, provider and permission changes must be attributable." />
      <Card className="span-12">
        {events.length ? <JsonPreview value={events} /> : <Empty text="No control-plane audit event recorded yet." />}
      </Card>
    </div>
  );
}

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="page-intro span-12">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

function Node({ label, meta, kind }: { label: string; meta: string; kind: string }) {
  return <div className={"route-node " + kind}><strong>{label}</strong><span>{meta}</span></div>;
}
function Line() { return <div className="route-line" aria-hidden="true" />; }

function CommandPalette({ locale, open, onClose, navigate }: {
  locale: Locale; open: boolean; onClose: () => void; navigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => navItems.filter((item) => tr(locale, item.key).toLowerCase().includes(query.toLowerCase())), [locale, query]);
  if (!open) return null;
  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={tr(locale, "command")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input"><span>⌘K</span><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr(locale, "search")} /></div>
        <div className="palette-results">
          {filtered.map((item) => <button key={item.path} onClick={() => { navigate(item.path); onClose(); }}><span>{item.short}</span>{tr(locale, item.key)}</button>)}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const { path, navigate } = usePath();
  const [locale, setLocale] = useState<Locale>((localStorage.getItem("nestai-locale") as Locale) || "pt-BR");
  const [healthData, setHealthData] = useState<api.Health | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [adminData, setAdminData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [palette, setPalette] = useState(false);

  useEffect(() => watchUser(setUser), []);
  useEffect(() => {
    void api.health().then(setHealthData).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setPalette((value) => !value);
      }
      if (event.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const loader = useMemo(() => ({
    "/": api.overview,
    "/apps": api.apps,
    "/tasks": api.tasks,
    "/routes": api.routes,
    "/providers": api.providers,
    "/prompts": api.prompts,
    "/knowledge": api.knowledge,
    "/evals": api.evals,
    "/observability": api.observability,
    "/policies": api.policies,
    "/cost": api.cost,
    "/audit": api.audit,
  } as Record<string, () => Promise<unknown>>)[path] ?? api.overview, [path]);

  useEffect(() => {
    setAdminData(null);
    setError(null);
    if (!user || !appCheckConfigured) return;
    let alive = true;
    setLoading(true);
    void loader().then((value) => { if (alive) setAdminData(value); }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loader, user]);

  const navCurrent = navItems.find((item) => item.path === path) ?? navItems[0]!;
  const content = (() => {
    if (path === "/apps") return <AppsPage locale={locale} data={adminData as api.AppsData | null} />;
    if (path === "/tasks") return <TasksPage locale={locale} data={adminData as api.TasksData | null} />;
    if (path === "/routes") return <RouterPage data={adminData as api.RoutesData | null} />;
    if (path === "/providers") return <ProvidersPage data={adminData as api.ProvidersData | null} />;
    if (path === "/prompts") return <PromptsPage data={adminData as api.PromptsData | null} />;
    if (path === "/knowledge") return <KnowledgePage data={adminData as api.KnowledgeData | null} />;
    if (path === "/evals") return <EvaluationsPage data={adminData as api.EvaluationsData | null} />;
    if (path === "/observability") return <ObservabilityPage data={adminData as api.ObservabilityData | null} />;
    if (path === "/policies") return <PoliciesPage data={adminData as api.PoliciesData | null} />;
    if (path === "/cost") return <CostPage locale={locale} data={adminData as api.CostData | null} />;
    if (path === "/audit") return <AuditPage data={adminData as api.AuditData | null} />;
    return <OverviewPage locale={locale} health={healthData} data={adminData as api.OverviewData | null} />;
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <button className="brand" onClick={() => navigate("/")} aria-label="NestAI home">
          <span className="brand-mark">N</span>
          <span className="brand-copy"><strong>NestAI</strong><small>Intelligence Platform</small></span>
        </button>
        <nav>
          {navItems.map((item) => (
            <button key={item.path} className={path === item.path ? "active" : ""} onClick={() => navigate(item.path)} aria-current={path === item.path ? "page" : undefined}>
              <span className="nav-index">{item.short}</span><span>{tr(locale, item.key)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="env-badge"><span />PRODUCTION</div>
          <div className="version">FREE_ONLY</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="crumb"><span>NestAI</span><b>/</b><strong>{tr(locale, navCurrent.key)}</strong></div>
          <div className="top-actions">
            <button className="search-trigger" onClick={() => setPalette(true)}><span>⌘K</span>{tr(locale, "search")}</button>
            <select value={locale} onChange={(e) => { const next = e.target.value as Locale; setLocale(next); localStorage.setItem("nestai-locale", next); }} aria-label="Language">
              <option value="pt-BR">PT</option><option value="en">EN</option><option value="es">ES</option>
            </select>
            {user ? <button className="user-chip" onClick={() => void signOutConsole()}><span>{(user.displayName || user.email || "U").slice(0,1).toUpperCase()}</span><b>{tr(locale, "signOut")}</b></button>
              : <button className="primary compact" onClick={() => void signIn().catch((e) => setError(String(e)))}>{tr(locale, "signIn")}</button>}
          </div>
        </header>

        <main id="main-content">
          <div className="live-region" aria-live="polite">{loading ? tr(locale, "loading") : error ?? ""}</div>
          <SignInGate locale={locale} user={user} onSignIn={() => void signIn().catch((e) => setError(String(e)))} />
          {error && <div className="error-banner"><strong>Control plane</strong><span>{error}</span></div>}
          {content}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 5).map((item) => (
          <button key={item.path} className={path === item.path ? "active" : ""} onClick={() => navigate(item.path)}>
            <span>{item.short}</span><small>{tr(locale, item.key)}</small>
          </button>
        ))}
        <button onClick={() => setPalette(true)}><span>⌘</span><small>More</small></button>
      </nav>

      <CommandPalette locale={locale} open={palette} onClose={() => setPalette(false)} navigate={navigate} />
    </div>
  );
}
