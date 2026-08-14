// resultView.js — Port von TranslationResultView.swift
// Baut die Ergebnisdarstellung (ROM-Sektionen → Arab-Gruppen → Übersetzungszeilen)
// inkl. Long-Press-Copy (CopyCoordinator) und Wort-Tap.

import { strippingHTML, styledDictionaryHTML, cleanedForSearch } from "./models.js";
import { ICONS } from "./icons.js";

const LONG_PRESS_MS = 400;

// Eine gemeinsame "CopyCoordinator"-Instanz pro gerendertem Ergebnis-Container:
// neues Copy löscht sofort den Haken der vorherigen Zeile (wie im Original).
function createCopyCoordinator() {
  let activeEl = null;
  let clearTimer = null;
  return {
    copy(text, el) {
      writeClipboard(text);
      if (activeEl && activeEl !== el) activeEl.classList.remove("copied");
      el.classList.add("copied");
      activeEl = el;
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        el.classList.remove("copied");
        if (activeEl === el) activeEl = null;
      }, 5000);
    },
  };
}

function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
  if (navigator.vibrate) navigator.vibrate(10);
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch { /* ignore */ }
  document.body.removeChild(ta);
}

function makeWordCell(rawText, lang, coordinator, onWordTap) {
  const text = strippingHTML(rawText);
  const cell = document.createElement("div");
  cell.className = "word-cell";
  const textSpan = document.createElement("span");
  textSpan.innerHTML = styledDictionaryHTML(text);
  cell.appendChild(textSpan);
  const check = document.createElement("span");
  check.className = "copied-check icon";
  check.innerHTML = ICONS.checkCircleFilled;
  cell.appendChild(check);

  let timer = null;
  let fired = false;
  let startX = 0, startY = 0;
  let moved = false;

  const clear = () => { clearTimeout(timer); timer = null; };

  cell.addEventListener("pointerdown", (e) => {
    fired = false;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      fired = true;
      coordinator.copy(text, cell);
    }, LONG_PRESS_MS);
  });
  cell.addEventListener("pointermove", (e) => {
    if (!timer) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) {
      moved = true;
      clear();
    }
  });
  const endHandler = () => {
    clear();
    if (!fired && !moved) {
      onWordTap(cleanedForSearch(text), lang);
    }
  };
  cell.addEventListener("pointerup", endHandler);
  cell.addEventListener("pointercancel", clear);

  return cell;
}

function buildEmptyView(query) {
  const wrap = document.createElement("div");
  wrap.className = "empty-view";
  wrap.innerHTML = `
    <span class="icon">${ICONS.textMagnifyingglass}</span>
    <p>Kein Ergebnis für „${escapeHTML(query)}“</p>`;
  return wrap;
}

function escapeHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// results: PONSResult[] — flatten zu roms wie im Original
function flattenRoms(results) {
  const roms = [];
  for (const r of results ?? []) {
    for (const hit of r.hits ?? []) {
      for (const rom of hit.roms ?? []) roms.push(rom);
    }
  }
  return roms;
}

// Rendert Übersetzungsergebnisse in `container` (wird vorher geleert).
export function renderResults(container, results, query, sourceLang, targetLang, onWordTap) {
  container.innerHTML = "";
  const roms = flattenRoms(results);
  if (roms.length === 0) {
    container.appendChild(buildEmptyView(query));
    return;
  }

  const coordinator = createCopyCoordinator();
  const list = document.createElement("div");
  list.className = "result-list";

  roms.forEach((rom, i) => {
    if (i > 0) {
      const divider = document.createElement("div");
      divider.className = "rom-divider";
      list.appendChild(divider);
    }

    let lastRowEl = null;
    const section = document.createElement("div");
    section.className = "rom-section";

    const header = document.createElement("div");
    header.className = "rom-header";
    const hw = rom.headword ? strippingHTML(rom.headword) : "";
    if (hw) {
      const hwEl = document.createElement("span");
      hwEl.className = "rom-headword";
      hwEl.textContent = hw;
      header.appendChild(hwEl);
    }
    const wc = rom.wordclass ? strippingHTML(rom.wordclass) : "";
    if (wc) {
      const wcEl = document.createElement("span");
      wcEl.className = "rom-wordclass";
      wcEl.textContent = wc;
      header.appendChild(wcEl);
    }
    section.appendChild(header);

    (rom.arabs ?? []).forEach((arab) => {
      const group = document.createElement("div");
      group.className = "arab-group";
      const head = arab.header ? strippingHTML(arab.header) : "";
      if (head) {
        const headEl = document.createElement("div");
        headEl.className = "arab-header";
        headEl.textContent = head;
        group.appendChild(headEl);
      }
      (arab.translations ?? []).forEach((t) => {
        const row = document.createElement("div");
        row.className = "translation-row";
        const inner = document.createElement("div");
        inner.className = "translation-row-inner";

        inner.appendChild(makeWordCell(t.source, sourceLang, coordinator, onWordTap));
        const arrow = document.createElement("span");
        arrow.className = "row-arrow icon";
        arrow.innerHTML = ICONS.arrowRight;
        inner.appendChild(arrow);
        inner.appendChild(makeWordCell(t.target, targetLang, coordinator, onWordTap));

        row.appendChild(inner);
        group.appendChild(row);
        lastRowEl = row;
      });
      section.appendChild(group);
    });

    // Die letzte Zeile hat schon ihre eigene Trennlinie (border-bottom) –
    // wenn direkt danach noch ein .rom-divider für den nächsten Eintrag
    // folgt, würde das zwei Linien übereinander ergeben ("Doppelstrich").
    if (i < roms.length - 1 && lastRowEl) {
      lastRowEl.classList.add("no-divider");
    }

    list.appendChild(section);
  });

  container.appendChild(list);
}

export function buildSpinner() {
  const wrap = document.createElement("div");
  wrap.className = "spinner-view";
  wrap.innerHTML = `<div class="spinner-ring"><span class="icon">${ICONS.search}</span></div>`;
  return wrap;
}

export function buildErrorView(message, onRetry) {
  const wrap = document.createElement("div");
  wrap.className = "error-view";
  wrap.innerHTML = `<span class="icon">${ICONS.wifiExclamation}</span><p>${escapeHTML(message)}</p>`;
  const btn = document.createElement("button");
  btn.className = "retry-btn";
  btn.type = "button";
  btn.textContent = "Erneut versuchen";
  btn.addEventListener("click", onRetry);
  wrap.appendChild(btn);
  return wrap;
}
