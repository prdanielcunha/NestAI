export type Locale = "pt-BR" | "en" | "es";

export const messages = {
  "pt-BR": {
    overview:"Visão geral", apps:"Apps", tasks:"Tasks", routes:"Router", providers:"Providers",
    prompts:"Prompt Studio", knowledge:"Knowledge", evals:"Evaluations", observability:"Observability",
    policies:"Policies", cost:"Cost & Quota", audit:"Audit", healthy:"Operacional", degraded:"Degradado",
    production:"Produção", search:"Buscar task, request, provider…", actualSpend:"Gasto real",
    freeCapacity:"Capacidade gratuita", autopilot:"Piloto automático de capacidade gratuita",
    autopilotIntro:"Análise de cotas e saúde dos provedores, sem enviar conteúdo de clientes ou efetuar chamadas de IA.",
    autopilotNote:"Apenas recomendações. Sem alteração automática de provedor ou uso de serviços pagos.",
    quotaStatus:"Cota gratuita", remainingQuota:"Restante", providerHealth:"Saúde", recommendation:"Recomendação",
    callsCount:"chamadas registradas", sharedLimit:"Limite compartilhado", noHealth:"Sem dados de capacidade.",
    paidProviders:"Providers pagos", locked:"BLOQUEADOS",
    requestsToday:"Chamadas hoje", privacyRejected:"Bloqueios de privacidade", rateLimited:"Rate limits",
    appsEnabled:"Apps habilitados", signIn:"Entrar com Google", signOut:"Sair", adminRequired:"Acesso administrativo necessário",
    loading:"Carregando", noData:"Ainda não há dados para este painel.", command:"Command Palette",
  },
  en: {
    overview:"Overview", apps:"Apps", tasks:"Tasks", routes:"Router", providers:"Providers",
    prompts:"Prompt Studio", knowledge:"Knowledge", evals:"Evaluations", observability:"Observability",
    policies:"Policies", cost:"Cost & Quota", audit:"Audit", healthy:"Operational", degraded:"Degraded",
    production:"Production", search:"Search task, request, provider…", actualSpend:"Actual spend",
    freeCapacity:"Free capacity", autopilot:"Free capacity autopilot",
    autopilotIntro:"Live quota and provider health analysis without submitting customer content or generating AI calls.",
    autopilotNote:"Recommendations only. No automatic provider switching or paid service usage.",
    quotaStatus:"Free quota", remainingQuota:"Remaining", providerHealth:"Health", recommendation:"Recommendation",
    callsCount:"calls recorded", sharedLimit:"Shared allowance", noHealth:"No capacity data yet.",
    paidProviders:"Paid providers", locked:"LOCKED",
    requestsToday:"Requests today", privacyRejected:"Privacy rejections", rateLimited:"Rate limits",
    appsEnabled:"Apps enabled", signIn:"Continue with Google", signOut:"Sign out", adminRequired:"Administrative access required",
    loading:"Loading", noData:"There is no data for this panel yet.", command:"Command Palette",
  },
  es: {
    overview:"Resumen", apps:"Apps", tasks:"Tasks", routes:"Router", providers:"Providers",
    prompts:"Prompt Studio", knowledge:"Knowledge", evals:"Evaluations", observability:"Observability",
    policies:"Policies", cost:"Cost & Quota", audit:"Audit", healthy:"Operativo", degraded:"Degradado",
    production:"Producción", search:"Buscar task, request, provider…", actualSpend:"Gasto real",
    freeCapacity:"Capacidad gratuita", autopilot:"Piloto automático de capacidad gratuita",
    autopilotIntro:"Análisis de cuotas y salud de proveedores sin enviar datos de clientes ni hacer llamadas de IA.",
    autopilotNote:"Solo recomendaciones. Sin cambiar proveedores automáticamente ni usar servicios pagos.",
    quotaStatus:"Cuota gratuita", remainingQuota:"Restante", providerHealth:"Salud", recommendation:"Recomendación",
    callsCount:"llamadas registradas", sharedLimit:"Límite compartido", noHealth:"Sin datos de capacidad.",
    paidProviders:"Proveedores pagos", locked:"BLOQUEADOS",
    requestsToday:"Solicitudes hoy", privacyRejected:"Bloqueos de privacidad", rateLimited:"Rate limits",
    appsEnabled:"Apps habilitadas", signIn:"Continuar con Google", signOut:"Salir", adminRequired:"Se requiere acceso administrativo",
    loading:"Cargando", noData:"Todavía no hay datos para este panel.", command:"Command Palette",
  }
} satisfies Record<Locale, Record<string,string>>;

export function tr(locale:Locale,key:keyof typeof messages["pt-BR"]):string {
  return messages[locale][key] ?? messages["pt-BR"][key];
}
