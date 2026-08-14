// models.js — Sprachliste + String-Helfer (Port von Models.swift / TranslationResultView.swift Extensions)

export const LANGUAGES = [
  { id: "de", name: "Deutsch",       flag: "🇩🇪", available: true },
  { id: "en", name: "Englisch",      flag: "🇬🇧", available: true },
  { id: "fr", name: "Französisch",   flag: "🇫🇷", available: true },
  { id: "es", name: "Spanisch",      flag: "🇪🇸", available: true },
  { id: "it", name: "Italienisch",   flag: "🇮🇹", available: true },
  { id: "pt", name: "Portugiesisch", flag: "🇵🇹", available: false },
  { id: "nl", name: "Niederländisch",flag: "🇳🇱", available: true },
  { id: "pl", name: "Polnisch",      flag: "🇵🇱", available: false },
  { id: "ru", name: "Russisch",      flag: "🇷🇺", available: false },
  { id: "ja", name: "Japanisch",     flag: "🇯🇵", available: false },
  { id: "zh", name: "Chinesisch",    flag: "🇨🇳", available: false },
];

export function findLanguage(id) {
  return LANGUAGES.find((l) => l.id === id) || null;
}

export function displayName(id) {
  return findLanguage(id)?.name ?? id.toUpperCase();
}

// MARK: - String-Helfer (Port der String-Extensions aus TranslationResultView.swift)

const HTML_ENTITIES = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function strippingHTML(str) {
  if (!str) return "";
  const noTags = str.replace(/<[^>]+>/g, "").trim();
  return noTags.replace(/&lt;|&gt;|&amp;|&quot;|&#39;|&nbsp;/g, (m) => HTML_ENTITIES[m]);
}

const STYLE_LABELS = "ugs|abw|geh|fam|pej|inf|sl|vulg|iron|hum|euph|obs|dated|no pl";

// Baut HTML mit <span class="dict-muted"> für Genus-Kürzel, Flexionsklammern <...> und
// Stilmarkierungen — Pendant zu styledDictionaryText() in TranslationResultView.swift.
export function styledDictionaryHTML(str) {
  if (!str) return "";
  // Erst escapen, damit kein HTML aus dem Text selbst injiziert wird
  let escaped = str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Flexionsklammern <...> (jetzt als &lt;...&gt; escaped) grau
  escaped = escaped.replace(/&lt;[^&]*?&gt;/g, (m) => `<span class="dict-muted">${m}</span>`);

  // Standalone Genus-Kürzel (m/f/nt/n) grau + unterstrichen
  escaped = escaped.replace(
    /(^|[^\w])(m|f|nt|n)(?=$|[^\w])/g,
    (m, pre, tag) => `${pre}<span class="dict-muted dict-underline">${tag}</span>`
  );

  // Stilmarkierungen grau
  const styleRx = new RegExp(`(^|[^\\w])(${STYLE_LABELS})(?=$|[^\\w])`, "g");
  escaped = escaped.replace(styleRx, (m, pre, tag) => `${pre}<span class="dict-muted">${tag}</span>`);

  return escaped;
}

// Bereinigt einen Wörterbucheintrag für eine erneute Suche — Port von cleanedForSearch().
export function cleanedForSearch(str) {
  let s = str;
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/(^|[^\w])(m|f|nt|n)(?=$|[^\w])/g, "$1");
  const styleRx = new RegExp(`(^|[^\\w])(${STYLE_LABELS})(?=$|[^\\w])`, "g");
  s = s.replace(styleRx, "$1");
  s = s.replace(/\[.*?\]/g, "");
  s = s.replace(/\(.*?\)/g, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}
