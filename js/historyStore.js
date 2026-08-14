// historyStore.js — Port von SearchHistoryStore.swift (jetzt via localStorage statt UserDefaults)

const KEY = "v2.search_history";
const LIMIT = 25;

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export class SearchHistoryStore extends EventTarget {
  constructor() {
    super();
    this.items = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.items = JSON.parse(raw);
    } catch {
      this.items = [];
    }
  }

  add(query, sourceLang, targetLang) {
    const q = query.trim();
    if (!q) return;
    this.items = this.items.filter(
      (it) =>
        !(
          it.query.toLowerCase() === q.toLowerCase() &&
          it.sourceLang === sourceLang &&
          it.targetLang === targetLang
        )
    );
    this.items.unshift({ id: uuid(), query: q, sourceLang, targetLang });
    if (this.items.length > LIMIT) this.items = this.items.slice(0, LIMIT);
    this._save();
  }

  remove(entry) {
    this.items = this.items.filter((it) => it.id !== entry.id);
    this._save();
  }

  clear() {
    this.items = [];
    this._save();
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* Speicher voll o.ä. — stillschweigend ignorieren, wie im Original */
    }
    this.dispatchEvent(new Event("change"));
  }
}
