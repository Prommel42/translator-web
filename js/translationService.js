// translationService.js — Port von TranslationService.swift (PONS Dictionary API)

const BASE = "https://api.pons.com/v1/dictionary";

const PAIR_CODES = {
  "de-en": "deen", "en-de": "deen",
  "de-fr": "defr", "fr-de": "defr",
  "de-es": "dees", "es-de": "dees",
  "de-it": "deit", "it-de": "deit",
  "de-pl": "depl", "pl-de": "depl",
  "de-ru": "deru", "ru-de": "deru",
  "de-nl": "denl", "nl-de": "denl",
  "de-pt": "dept", "pt-de": "dept",
  "en-fr": "enfr", "fr-en": "enfr",
  "en-es": "enes", "es-en": "enes",
  "en-it": "enit", "it-en": "enit",
  "en-nl": "ennl", "nl-en": "ennl",
};

export class TranslationError extends Error {
  constructor(kind, detail) {
    const messages = {
      invalidURL: "Ungültige URL.",
      network: "Netzwerkfehler. Bitte Verbindung prüfen.",
      decoding: "Antwort konnte nicht verarbeitet werden.",
      server: `Serverfehler (${detail}). Bitte später erneut versuchen.`,
      noInternet: "Keine Internetverbindung.",
      missingKey: "Kein API-Key. Bitte in den Einstellungen eintragen.",
      invalidKey: "Ungültiger API-Key. Bitte in den Einstellungen prüfen.",
    };
    super(messages[kind] ?? "Unbekannter Fehler.");
    this.kind = kind;
    this.detail = detail;
  }
}

export function supportsPair(source, target) {
  return Boolean(PAIR_CODES[`${source}-${target}`]);
}

// query, from, to, apiKey, { signal } -> Promise<PONSResult[]>
export async function lookup(query, from, to, apiKey, { signal } = {}) {
  if (!apiKey || !apiKey.trim()) {
    throw new TranslationError("missingKey");
  }
  const pair = PAIR_CODES[`${from}-${to}`];
  if (!pair) {
    throw new TranslationError("invalidURL");
  }

  const url = new URL(BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("l", pair);
  url.searchParams.set("in", from);
  url.searchParams.set("language", "de");

  let response;
  try {
    response = await fetch(url.toString(), {
      headers: { "X-Secret": apiKey },
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    if (!navigator.onLine) throw new TranslationError("noInternet");
    throw new TranslationError("network", err);
  }

  if (response.status === 204) return [];
  if (response.status === 401 || response.status === 403) {
    throw new TranslationError("invalidKey");
  }
  if (!response.ok) {
    throw new TranslationError("server", response.status);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new TranslationError("decoding");
  }
}
