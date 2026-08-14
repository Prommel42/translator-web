// app.js — Hauptlogik (Port von ContentView.swift, SettingsView.swift, LanguageSelectorView.swift)

import { LANGUAGES, findLanguage } from "./models.js";
import { lookup, supportsPair, TranslationError } from "./translationService.js";
import { SearchHistoryStore } from "./historyStore.js";
import { renderResults, buildSpinner, buildErrorView } from "./resultView.js";
import { renderHistoryList } from "./historyView.js";
import { ICONS, icon } from "./icons.js";

// ── DOM-Referenzen ─────────────────────────────────────────────

const appEl = document.getElementById("app");
const homePageEl = document.getElementById("home-page");
const searchPageEl = document.getElementById("search-page");
const homeLangSelectorEl = document.getElementById("home-lang-selector");
const searchLangSelectorEl = document.getElementById("search-lang-selector");
const noKeyBannerEl = document.getElementById("no-key-banner");
const homeFakeBarEl = document.getElementById("home-fake-searchbar");
const homeFakeBarTextEl = document.getElementById("home-fake-searchbar-text");
const homeHistoryWrapEl = document.getElementById("home-history-wrap");
const settingsBtnEl = document.getElementById("settings-btn");
const searchInputEl = document.getElementById("search-input");
const clearBtnEl = document.getElementById("clear-btn");
const cancelBtnEl = document.getElementById("cancel-btn");
const navIndicatorEl = document.getElementById("nav-indicator");
const searchContentEl = document.getElementById("search-content");
const edgeLeftEl = document.getElementById("edge-left");
const edgeRightEl = document.getElementById("edge-right");

const settingsModalEl = document.getElementById("settings-modal");
const settingsDoneEl = document.getElementById("settings-done");
const schemeSegmentedEl = document.getElementById("scheme-segmented");
const autoFocusToggleEl = document.getElementById("autofocus-toggle");
const apiKeyInputEl = document.getElementById("api-key-input");

const langPickerModalEl = document.getElementById("lang-picker-modal");
const langPickerTitleEl = document.getElementById("lang-picker-title");
const langPickerDoneEl = document.getElementById("lang-picker-done");
const langPickerListEl = document.getElementById("lang-picker-list");

// Statische Icons direkt als SVG einsetzen (nicht per CSS-Maske – das war über
// mehrere Browser hinweg unzuverlässig und hat teils gar nichts Erkennbares
// gerendert). Gleiche Technik wie überall sonst in der App (resultView.js,
// historyView.js, icons.js#icon()).
settingsBtnEl.innerHTML = ICONS.gear;
clearBtnEl.innerHTML = ICONS.xmarkCircleFilled;
noKeyBannerEl.querySelector(".icon-wrap").innerHTML = ICONS.keySlash;
document.querySelector(".link-row .icon-wrap").innerHTML = ICONS.safari;

// ── Persistenz (Port der @AppStorage-Werte) ─────────────────────

const store = {
  get(key, fallback) {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  },
  set(key, value) { localStorage.setItem(key, value); },
};

const state = {
  colorScheme: store.get("appColorScheme", "system"),
  autoFocus: store.get("autoFocus", "0") === "1",
  sourceLang: store.get("sourceLang", "de"),
  targetLang: store.get("targetLang", "en"),
  ponsApiKey: store.get("ponsApiKey", ""),

  query: "",
  isSearching: false,
  result: null,
  isLoading: false,
  errorMsg: null,
  abortController: null,

  navHistory: [], // {query, result}
  navIndex: -1,
  restoringHistory: false,
  pendingHistoryCommit: false,

  langPickerTarget: null, // 'source' | 'target'
};

const history = new SearchHistoryStore();

// ── Hilfsfunktionen ─────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageWidthPx = () => appEl.clientWidth;
const canGoBack = () => state.navIndex > 0;
const canGoForward = () => state.navIndex < state.navHistory.length - 1;
const canGoHome = () => state.isSearching && state.navIndex <= 0;

function escapeHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Theme ───────────────────────────────────────────────────────

function applyTheme() {
  if (state.colorScheme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", state.colorScheme);
  }
  schemeSegmentedEl.querySelectorAll(".segment").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === state.colorScheme);
  });
}

// ── Sprachauswahl ───────────────────────────────────────────────

function renderLangSelector(container) {
  container.innerHTML = "";
  const src = findLanguage(state.sourceLang);
  const tgt = findLanguage(state.targetLang);

  const srcBtn = document.createElement("button");
  srcBtn.type = "button";
  srcBtn.className = "lang-btn";
  srcBtn.innerHTML = `<span class="flag">${src?.flag ?? "🏳️"}</span><span class="name">${src?.name ?? state.sourceLang.toUpperCase()}</span><span class="icon">${ICONS.chevronDown}</span>`;
  srcBtn.addEventListener("click", () => openLangPicker("source"));

  const swapBtn = document.createElement("button");
  swapBtn.type = "button";
  swapBtn.className = "lang-swap";
  swapBtn.innerHTML = `<span class="icon">${ICONS.swap}</span>`;
  swapBtn.addEventListener("click", () => {
    const tmp = state.sourceLang;
    setLangs(state.targetLang, tmp);
  });

  const tgtBtn = document.createElement("button");
  tgtBtn.type = "button";
  tgtBtn.className = "lang-btn";
  tgtBtn.innerHTML = `<span class="flag">${tgt?.flag ?? "🏳️"}</span><span class="name">${tgt?.name ?? state.targetLang.toUpperCase()}</span><span class="icon">${ICONS.chevronDown}</span>`;
  tgtBtn.addEventListener("click", () => openLangPicker("target"));

  container.append(srcBtn, swapBtn, tgtBtn);
}

function renderBothLangSelectors() {
  renderLangSelector(homeLangSelectorEl);
  renderLangSelector(searchLangSelectorEl);
}

function setLangs(source, target) {
  state.sourceLang = source;
  state.targetLang = target;
  store.set("sourceLang", source);
  store.set("targetLang", target);
  renderBothLangSelectors();
  if (!state.restoringHistory && state.query.trim()) {
    scheduleTranslation(state.query, { pushToStack: false });
  }
}

function openLangPicker(which) {
  state.langPickerTarget = which;
  langPickerTitleEl.textContent = which === "source" ? "Ausgangssprache" : "Zielsprache";
  const excluded = which === "source" ? state.targetLang : state.sourceLang;
  const selected = which === "source" ? state.sourceLang : state.targetLang;

  langPickerListEl.innerHTML = "";
  LANGUAGES.filter((l) => {
    if (l.id === excluded) return false;
    if (!l.available) return true;
    return supportsPair(l.id, excluded);
  }).forEach((lang) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "lang-item" + (lang.available ? "" : " disabled");
    row.innerHTML = `
      <span class="flag">${lang.flag}</span>
      <span class="info">
        <span class="name">${lang.name}</span>
        ${lang.available ? "" : '<span class="soon">Bald verfügbar</span>'}
      </span>
      ${selected === lang.id ? `<span class="icon check">${ICONS.check}</span>` : ""}`;
    if (lang.available) {
      row.addEventListener("click", () => {
        if (which === "source") setLangs(lang.id, state.targetLang);
        else setLangs(state.sourceLang, lang.id);
        closeModal(langPickerModalEl);
      });
    }
    langPickerListEl.appendChild(row);
  });

  openModal(langPickerModalEl);
}

// ── Modals ──────────────────────────────────────────────────────

function openModal(el) { el.classList.remove("hidden"); }
function closeModal(el) { el.classList.add("hidden"); }

settingsDoneEl.addEventListener("click", () => closeModal(settingsModalEl));
settingsModalEl.addEventListener("click", (e) => { if (e.target === settingsModalEl) closeModal(settingsModalEl); });
langPickerDoneEl.addEventListener("click", () => closeModal(langPickerModalEl));
langPickerModalEl.addEventListener("click", (e) => { if (e.target === langPickerModalEl) closeModal(langPickerModalEl); });

settingsBtnEl.addEventListener("click", () => {
  apiKeyInputEl.value = state.ponsApiKey;
  autoFocusToggleEl.checked = state.autoFocus;
  applyTheme();
  openModal(settingsModalEl);
});

schemeSegmentedEl.querySelectorAll(".segment").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.colorScheme = btn.dataset.value;
    store.set("appColorScheme", state.colorScheme);
    applyTheme();
  });
});

autoFocusToggleEl.addEventListener("change", () => {
  state.autoFocus = autoFocusToggleEl.checked;
  store.set("autoFocus", state.autoFocus ? "1" : "0");
});

apiKeyInputEl.addEventListener("input", () => {
  state.ponsApiKey = apiKeyInputEl.value;
  store.set("ponsApiKey", state.ponsApiKey);
  renderNoKeyBanner();
});

// ── No-Key-Banner ───────────────────────────────────────────────

function renderNoKeyBanner() {
  const empty = state.ponsApiKey.trim() === "";
  noKeyBannerEl.classList.toggle("hidden", !empty);
  renderHomeHistory();
}
noKeyBannerEl.addEventListener("click", () => {
  apiKeyInputEl.value = state.ponsApiKey;
  autoFocusToggleEl.checked = state.autoFocus;
  applyTheme();
  openModal(settingsModalEl);
});

// Icon-Inhalte für die per-CSS-Maske erzeugten Icons einfügen (Gear, Xmark, KeySlash, Safari
// nutzen ::before mit --icon-* CSS-Variablen, siehe style.css).

// ── Home-Verlauf (dynamische Anzahl wie maxVisibleHistoryItems in ContentView.swift) ──

function computeMaxVisibleHistoryItems() {
  const totalHeight = appEl.clientHeight;
  const bottomInset = 0;
  const topClear = 50;
  const logoArea = 162;
  const bannerEmpty = state.ponsApiKey.trim() === "";
  const bannerH = bannerEmpty ? 76 : 0;
  const bannerPad = bannerEmpty ? 8 : 0;
  const searchAreaH = 112;
  const historyHeaderH = 52;
  const bottomPad = 30;
  const rowHeight = 45;

  const usable = totalHeight - bottomInset;
  const fixed = topClear + logoArea + bannerH + bannerPad + searchAreaH + historyHeaderH + bottomPad;
  return Math.max(0, Math.floor((usable - fixed) / rowHeight));
}

function renderHomeHistory() {
  const maxItems = computeMaxVisibleHistoryItems();
  const visible = history.items.slice(0, maxItems);
  if (visible.length === 0) {
    homeHistoryWrapEl.innerHTML = "";
    return;
  }
  homeHistoryWrapEl.innerHTML = "";
  const divider = document.createElement("div");
  divider.className = "divider";
  homeHistoryWrapEl.appendChild(divider);
  const listWrap = document.createElement("div");
  homeHistoryWrapEl.appendChild(listWrap);
  renderHistoryList(listWrap, visible, {
    onSelect: selectHistoryItem,
    onRemove: (item) => history.remove(item),
    onClear: () => history.clear(),
  });
}

function renderSearchHistoryList(container) {
  if (history.items.length === 0) {
    container.innerHTML = "";
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "scroll-area";
  const inner = document.createElement("div");
  wrap.appendChild(inner);
  renderHistoryList(inner, history.items, {
    onSelect: selectHistoryItem,
    onRemove: (item) => history.remove(item),
    onClear: () => history.clear(),
  });
  container.appendChild(wrap);
}

history.addEventListener("change", () => {
  renderHomeHistory();
  if (state.query.trim() === "") renderSearchPageContent();
});

// ── Home-Fake-Suchleiste ────────────────────────────────────────

function updateHomeFakeBarText() {
  if (state.query) {
    homeFakeBarTextEl.textContent = state.query;
    homeFakeBarTextEl.classList.remove("placeholder");
  } else {
    homeFakeBarTextEl.textContent = "Wort oder Ausdruck…";
    homeFakeBarTextEl.classList.add("placeholder");
  }
}

homeFakeBarEl.addEventListener("click", () => {
  openSearch();
});

// ── Suchleiste (Suchseite) ──────────────────────────────────────

searchInputEl.addEventListener("input", () => {
  if (state.restoringHistory) return;
  state.query = searchInputEl.value;
  updateSearchInputUI();
  updateHomeFakeBarText();
  scheduleTranslation(state.query, { pushToStack: false });
});

searchInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submit(); }
});

searchInputEl.addEventListener("focus", () => {
  if (!state.isSearching) {
    openSearch();
  } else {
    // Selbstheilung: Egal ob eine hängengebliebene Wisch-Geste oder ein
    // Browser-Eigenheit-Resize die Seite vorher verschoben hat - sobald
    // tatsächlich getippt wird, erzwingen wir die garantiert korrekte
    // Position. Auch eine evtl. hängende Geste wird hart abgebrochen.
    abortDrag();
    homePageEl.classList.remove("animated");
    searchPageEl.classList.remove("animated");
    setPageOffsets(0);
  }
});

searchInputEl.addEventListener("blur", () => {
  if (state.isSearching && state.query.trim() !== "") {
    const q = state.query.trim();
    history.add(q, state.sourceLang, state.targetLang);
    if (state.result) {
      const alreadyCommitted =
        state.navIndex >= 0 && state.navHistory[state.navIndex].query.toLowerCase() === q.toLowerCase();
      if (!alreadyCommitted) commitResult(q, state.result);
    } else if (state.isLoading) {
      state.pendingHistoryCommit = true;
    }
  }
});

clearBtnEl.addEventListener("click", () => {
  state.query = "";
  searchInputEl.value = "";
  updateSearchInputUI();
  updateHomeFakeBarText();
  searchInputEl.focus();
  scheduleTranslation("", { pushToStack: false });
});

cancelBtnEl.addEventListener("click", cancel);

function updateSearchInputUI() {
  clearBtnEl.classList.toggle("hidden", state.query.length === 0);
  cancelBtnEl.classList.toggle("hidden", !state.isSearching);
}

function submit() {
  const q = state.query.trim();
  if (!q) return;
  history.add(q, state.sourceLang, state.targetLang);
  scheduleTranslation(q, { immediate: true, pushToStack: true });
}

function selectHistoryItem(entry) {
  state.restoringHistory = true;
  state.sourceLang = entry.sourceLang;
  state.targetLang = entry.targetLang;
  store.set("sourceLang", entry.sourceLang);
  store.set("targetLang", entry.targetLang);
  renderBothLangSelectors();
  state.query = entry.query;
  searchInputEl.value = entry.query;
  updateSearchInputUI();
  updateHomeFakeBarText();
  history.add(entry.query, entry.sourceLang, entry.targetLang);
  if (!state.isSearching) openSearch();
  scheduleTranslation(entry.query, { immediate: true, pushToStack: true });
  setTimeout(() => { state.restoringHistory = false; }, 100);
}

function onWordTap(word, lang) {
  state.restoringHistory = true;
  if (lang !== state.sourceLang) {
    const tmp = state.sourceLang;
    state.sourceLang = state.targetLang;
    state.targetLang = tmp;
    store.set("sourceLang", state.sourceLang);
    store.set("targetLang", state.targetLang);
    renderBothLangSelectors();
  }
  state.query = word;
  searchInputEl.value = word;
  updateSearchInputUI();
  updateHomeFakeBarText();
  history.add(word, state.sourceLang, state.targetLang);
  scheduleTranslation(word, { immediate: true, pushToStack: true });
  setTimeout(() => { state.restoringHistory = false; }, 100);
}

// ── Übersetzung ─────────────────────────────────────────────────

let debounceTimer = null;

function scheduleTranslation(text, { immediate = false, pushToStack = false } = {}) {
  clearTimeout(debounceTimer);
  abortSearch();
  state.result = null;
  state.errorMsg = null;

  if (text.trim() === "") {
    state.isLoading = false;
    renderSearchPageContent();
    return;
  }

  state.isLoading = true;
  renderSearchPageContent();

  const run = () => doTranslate(text, pushToStack);
  if (immediate) run();
  else debounceTimer = setTimeout(run, 450);
}

function abortSearch() {
  clearTimeout(debounceTimer);
  state.abortController?.abort();
  state.abortController = null;
}

async function doTranslate(text, pushToStack) {
  const controller = new AbortController();
  state.abortController = controller;
  const startTime = Date.now();

  try {
    const r = await lookup(text, state.sourceLang, state.targetLang, state.ponsApiKey, { signal: controller.signal });
    if (controller.signal.aborted) return;

    const entry = { query: text, result: r };
    const sameWord = state.navIndex >= 0 && state.navHistory[state.navIndex].query.toLowerCase() === text.toLowerCase();
    const shouldPush = pushToStack || state.pendingHistoryCommit;
    state.pendingHistoryCommit = false;

    state.result = r;
    state.errorMsg = null;
    if (shouldPush) {
      if (sameWord && state.navIndex >= 0) {
        state.navHistory[state.navIndex] = entry;
      } else {
        state.navHistory = state.navHistory.slice(0, state.navIndex + 1);
        state.navHistory.push(entry);
        state.navIndex = state.navHistory.length - 1;
      }
    }
    state.isLoading = false;
    renderSearchPageContent();
    updateGestureZones();
  } catch (err) {
    if (err.name === "AbortError") return;
    const elapsed = Date.now() - startTime;
    const remaining = 5000 - elapsed;
    if (remaining > 0) await sleep(remaining);
    if (controller.signal.aborted) return;
    state.errorMsg = err instanceof TranslationError ? err.message : "Unbekannter Fehler.";
    state.isLoading = false;
    renderSearchPageContent();
  }
}

function commitResult(query, result) {
  const entry = { query, result };
  state.navHistory = state.navHistory.slice(0, state.navIndex + 1);
  state.navHistory.push(entry);
  state.navIndex = state.navHistory.length - 1;
  updateGestureZones();
}

// ── Such-Seiteninhalt (Nav-Indicator + Carousel/Verlauf) ─────────

function renderNavIndicator() {
  const show = canGoBack() || canGoForward() || canGoHome();
  navIndicatorEl.classList.toggle("hidden", !show);
  if (!show) { navIndicatorEl.innerHTML = ""; return; }

  navIndicatorEl.innerHTML = "";
  if (canGoHome()) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "nav-chip";
    chip.innerHTML = `${icon("chevronLeft")}${icon("house")}`;
    chip.addEventListener("click", () => goHome());
    navIndicatorEl.appendChild(chip);
  } else if (canGoBack()) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "nav-chip";
    chip.innerHTML = `${icon("chevronLeft")}<span>${escapeHTML(state.navHistory[state.navIndex - 1].query)}</span>`;
    chip.addEventListener("click", () => swipeNavigateCommit(1));
    navIndicatorEl.appendChild(chip);
  }
  if (canGoForward()) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "nav-chip spacer-fill";
    chip.innerHTML = `<span>${escapeHTML(state.navHistory[state.navIndex + 1].query)}</span>${icon("chevronRight")}`;
    chip.addEventListener("click", () => swipeNavigateCommit(-1));
    navIndicatorEl.appendChild(chip);
  }
}

function buildSlotContent(kind, entry) {
  const wrap = document.createElement("div");
  if (kind === "loading") {
    wrap.appendChild(buildSpinner());
  } else if (kind === "error") {
    wrap.appendChild(buildErrorView(state.errorMsg, () => submit()));
  } else if (kind === "result") {
    renderResults(wrap, entry.result, entry.query, state.sourceLang, state.targetLang, onWordTap);
  }
  return wrap;
}

function renderSearchPageContent() {
  renderNavIndicator();
  searchContentEl.innerHTML = "";

  if (state.query !== "") {
    const carousel = document.createElement("div");
    carousel.className = "page-carousel";
    carousel.id = "carousel";

    if (canGoBack()) {
      const prev = document.createElement("div");
      prev.className = "carousel-slot adjacent";
      prev.style.transform = "translateX(-100%)";
      prev.appendChild(buildSlotContent("result", state.navHistory[state.navIndex - 1]));
      carousel.appendChild(prev);
    }

    const current = document.createElement("div");
    current.className = "carousel-slot";
    current.id = "carousel-current";
    if (state.isLoading) current.appendChild(buildSlotContent("loading"));
    else if (state.result) current.appendChild(buildSlotContent("result", { query: state.query, result: state.result }));
    else if (state.errorMsg) current.appendChild(buildSlotContent("error"));
    carousel.appendChild(current);

    if (canGoForward()) {
      const next = document.createElement("div");
      next.className = "carousel-slot adjacent";
      next.style.transform = "translateX(100%)";
      next.appendChild(buildSlotContent("result", state.navHistory[state.navIndex + 1]));
      carousel.appendChild(next);
    }

    searchContentEl.appendChild(carousel);
  } else if (history.items.length > 0) {
    renderSearchHistoryList(searchContentEl);
  }
}

// ── Seitenübergänge (Home ↔ Suche) ───────────────────────────────

function setPageOffsets(dragPx = 0) {
  const pw = pageWidthPx();
  const homeX = (state.isSearching ? -pw : 0) + dragPx;
  const searchX = (state.isSearching ? 0 : pw) + dragPx;
  homePageEl.style.transform = `translate3d(${homeX}px,0,0)`;
  searchPageEl.style.transform = `translate3d(${searchX}px,0,0)`;
  homePageEl.style.pointerEvents = state.isSearching ? "none" : "auto";
  searchPageEl.style.pointerEvents = state.isSearching ? "auto" : "none";
}

function withPageAnimation(fn) {
  homePageEl.classList.add("animated");
  searchPageEl.classList.add("animated");
  fn();
  setTimeout(() => {
    homePageEl.classList.remove("animated");
    searchPageEl.classList.remove("animated");
  }, 340);
}

function openSearch() {
  withPageAnimation(() => {
    state.isSearching = true;
    setPageOffsets(0);
    renderSearchPageContent();
    updateGestureZones();
  });
  // Fokus MUSS synchron im User-Gesture-Handler passieren, sonst blockiert
  // mobile Safari/Chrome das automatische Einblenden der Bildschirmtastatur
  // (ein setTimeout davor bricht die "trusted event"-Kette).
  searchInputEl.focus();
}

function performGoHome() {
  abortSearch();
  state.isLoading = false;
  state.pendingHistoryCommit = false;
  state.result = null;
  searchInputEl.blur();
  state.navIndex = -1;
  state.query = "";
  searchInputEl.value = "";
  state.errorMsg = null;
  state.isSearching = false;
  updateSearchInputUI();
  updateHomeFakeBarText();
  renderSearchPageContent();
  updateGestureZones();
}

function goHome() {
  if (navigator.vibrate) navigator.vibrate(10);
  withPageAnimation(() => {
    performGoHome();
    setPageOffsets(0);
  });
}

function cancel() {
  abortSearch();
  state.result = null;
  searchInputEl.blur();
  state.pendingHistoryCommit = false;
  withPageAnimation(() => {
    performGoHome();
    state.navHistory = [];
    setPageOffsets(0);
    updateGestureZones();
  });
}

function resetPagesVisual() {
  withPageAnimation(() => setPageOffsets(0));
}

// ── Nav-Stack-Swipe (zwischen Suchergebnis-Seiten) ───────────────

function swipeNavigateCommit(direction) {
  abortSearch();
  state.isLoading = false;
  const newIndex = direction > 0 ? state.navIndex - 1 : state.navIndex + 1;
  const carouselEl = document.getElementById("carousel");
  if (newIndex < 0 || newIndex >= state.navHistory.length) {
    if (carouselEl) {
      carouselEl.classList.add("animated");
      carouselEl.style.transform = "translate3d(0,0,0)";
    }
    return;
  }
  if (navigator.vibrate) navigator.vibrate(10);
  const pw = pageWidthPx();
  const target = direction > 0 ? pw : -pw;
  if (carouselEl) {
    carouselEl.classList.add("animated");
    carouselEl.style.transform = `translate3d(${target}px,0,0)`;
  }
  setTimeout(() => {
    state.restoringHistory = true;
    state.navIndex = newIndex;
    const entry = state.navHistory[newIndex];
    state.query = entry.query;
    searchInputEl.value = entry.query;
    updateSearchInputUI();
    updateHomeFakeBarText();
    state.result = entry.result;
    state.errorMsg = null;
    state.isLoading = false;
    renderSearchPageContent();
    updateGestureZones();
    setTimeout(() => { state.restoringHistory = false; }, 100);
  }, 240);
}

function resetCarouselVisual() {
  const carouselEl = document.getElementById("carousel");
  if (carouselEl) {
    carouselEl.classList.add("animated");
    carouselEl.style.transform = "translate3d(0,0,0)";
  }
}

// ── Gesten-Zonen (Edge-Swipe, Port von makeEdgeGesture/makeHomeGesture) ──

function updateGestureZones() {
  if (!state.isSearching) {
    edgeLeftEl.classList.add("hidden");
    edgeRightEl.classList.remove("hidden");
  } else {
    edgeLeftEl.classList.toggle("hidden", !(canGoHome() || canGoBack()));
    edgeRightEl.classList.toggle("hidden", !canGoForward());
  }
}

function determineMode(side) {
  if (!state.isSearching) return side === "right" ? "open-search" : null;
  if (side === "left") return canGoHome() ? "home" : canGoBack() ? "back" : null;
  if (side === "right") return canGoForward() ? "forward" : null;
  return null;
}

let drag = null;
let dragWatchdog = null;

// Bricht eine hängende Geste sicher ab (keine Aktion auslösen, nur die
// Optik zurücksetzen). Wird von cancel/lostpointercapture UND dem
// Watchdog-Timer benutzt - beides Fälle, in denen wir kein "up" bekommen
// haben und daher NIE committen dürfen.
function abortDrag() {
  if (!drag) return;
  const { mode } = drag;
  drag = null;
  clearTimeout(dragWatchdog);
  if (mode === "home" || mode === "open-search") resetPagesVisual();
  else resetCarouselVisual();
}

function bindEdgeZone(el, side) {
  el.addEventListener("pointerdown", (e) => {
    const mode = determineMode(side);
    if (!mode) return;
    drag = {
      side, mode, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      deciding: true, horizontal: false, curPx: 0,
      lastX: e.clientX, lastT: performance.now(), velocity: 0,
    };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // Sicherheitsnetz: kommt aus irgendeinem Grund nie ein up/cancel/
    // lostpointercapture (z. B. weil das Keyboard-UI das Event schluckt),
    // wird die Geste nach 1s zwangsweise sauber zurückgesetzt statt die
    // Seite dauerhaft in einer verschobenen Zwischenposition hängen zu
    // lassen.
    clearTimeout(dragWatchdog);
    dragWatchdog = setTimeout(abortDrag, 1000);
  });

  el.addEventListener("pointermove", (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.deciding) {
      // Etwas höherer Schwellwert als beim Original (8→12px) - ein
      // normaler Fingertipp hat immer minimale Bewegung, das soll nicht
      // versehentlich als Wisch-Geste über der Suchleiste/dem Verlauf
      // hängen bleiben, wenn die Randzone zufällig mit angetippt wird.
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      drag.horizontal = Math.abs(dx) > Math.abs(dy) * 2;
      drag.deciding = false;
      if (!drag.horizontal) { drag = null; clearTimeout(dragWatchdog); return; }
    }
    const expectSign = drag.mode === "home" || drag.mode === "back" ? 1 : -1;
    if ((expectSign > 0 && dx <= 0) || (expectSign < 0 && dx >= 0)) {
      drag.curPx = 0;
      applyDragVisual(drag.mode, 0);
      return;
    }
    e.preventDefault();
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientX - drag.lastX) / dt;
    drag.lastX = e.clientX;
    drag.lastT = now;
    drag.curPx = dx;
    applyDragVisual(drag.mode, dx);
  });

  const end = (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const { mode, curPx, velocity } = drag;
    drag = null;
    clearTimeout(dragWatchdog);
    const predicted = curPx + velocity * 120;
    switch (mode) {
      case "open-search":
        if (curPx < -60 || predicted < -150) openSearch(); else resetPagesVisual();
        break;
      case "home":
        if (curPx > 60 || predicted > 150) goHome(); else resetPagesVisual();
        break;
      case "back":
        if (curPx > 60 || predicted > 150) swipeNavigateCommit(1); else resetCarouselVisual();
        break;
      case "forward":
        if (curPx < -60 || predicted < -150) swipeNavigateCommit(-1); else resetCarouselVisual();
        break;
    }
  };
  // pointerup = Geste bewusst beendet → ggf. committen.
  el.addEventListener("pointerup", end);
  // cancel/lostpointercapture = Geste wurde UNTERBROCHEN (Systemgeste,
  // Tastatur, Tab-Wechsel …) → NIE committen, nur sauber zurücksetzen.
  el.addEventListener("pointercancel", abortDrag);
  el.addEventListener("lostpointercapture", (e) => {
    if (drag && drag.pointerId === e.pointerId) abortDrag();
  });
}

function applyDragVisual(mode, px) {
  if (mode === "home" || mode === "open-search") {
    setPageOffsets(px);
  } else {
    const carouselEl = document.getElementById("carousel");
    if (carouselEl) {
      carouselEl.classList.remove("animated");
      carouselEl.style.transform = `translate3d(${px}px,0,0)`;
    }
  }
}

bindEdgeZone(edgeLeftEl, "left");
bindEdgeZone(edgeRightEl, "right");

// ── Init ────────────────────────────────────────────────────────

function init() {
  applyTheme();
  renderBothLangSelectors();
  renderNoKeyBanner();
  updateHomeFakeBarText();
  updateSearchInputUI();
  renderHomeHistory();
  renderSearchPageContent();
  setPageOffsets(0);
  updateGestureZones();

  // Nur bei echter Breitenänderung (Rotation/Fenstergröße) neu positionieren.
  // Das Öffnen der Bildschirmtastatur löst auf vielen Mobilbrowsern ebenfalls
  // ein resize-Event aus (Höhe ändert sich) - das darf die horizontale
  // Seiten-Position nicht anfassen, sonst verrutscht das Layout.
  let lastWidth = pageWidthPx();
  window.addEventListener("resize", () => {
    const w = pageWidthPx();
    if (w !== lastWidth) {
      lastWidth = w;
      setPageOffsets(0);
    }
    renderHomeHistory();
  });

  // Weiteres Sicherheitsnetz: beim Zurückkehren zur App (Tab-/App-Wechsel,
  // Bildschirm gesperrt & wieder entsperrt …) Position + Gesten-Status
  // hart korrigieren, statt eine evtl. veraltete/verschobene Ansicht zu
  // riskieren.
  const healOnReturn = () => {
    if (document.hidden) return;
    abortDrag();
    setPageOffsets(0);
  };
  document.addEventListener("visibilitychange", healOnReturn);
  window.addEventListener("pageshow", healOnReturn);

  if (state.autoFocus) {
    setTimeout(() => openSearch(), 500);
  }
}

init();
