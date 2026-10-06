export type Locale = "pt-BR" | "en" | "es";

const messages: Record<Locale, Record<string, string>> = {
  "pt-BR": {
    "health.ok": "NestAI operacional",
    "error.rateLimited": "Limite temporário atingido. Tente novamente em instantes.",
    "error.unavailable": "A IA está temporariamente indisponível.",
  },
  en: {
    "health.ok": "NestAI operational",
    "error.rateLimited": "Temporary limit reached. Please try again shortly.",
    "error.unavailable": "AI is temporarily unavailable.",
  },
  es: {
    "health.ok": "NestAI operativo",
    "error.rateLimited": "Se alcanzó el límite temporal. Inténtalo de nuevo en unos instantes.",
    "error.unavailable": "La IA no está disponible temporalmente.",
  },
};

export function t(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages["pt-BR"][key] ?? key;
}
