// historyView.js — Port von SearchHistoryListView.swift
// Verlaufsliste mit Swipe-to-Delete (inkl. Full-Swipe) und Sprach-Flaggen.

import { findLanguage } from "./models.js";
import { ICONS } from "./icons.js";

const DELETE_WIDTH = 82;

function makeHistoryRow(item, onSelect, onDelete) {
  const row = document.createElement("div");
  row.className = "history-row";

  const del = document.createElement("div");
  del.className = "history-row-delete";
  del.style.setProperty("--reveal", "0px");
  del.innerHTML = `<div class="del-inner"><span class="icon">${ICONS.trash}</span><span class="del-label">Löschen</span></div>`;
  row.appendChild(del);
  const delInner = del.querySelector(".del-inner");

  const content = document.createElement("div");
  content.className = "history-row-content";
  const srcFlag = findLanguage(item.sourceLang)?.flag ?? item.sourceLang.toUpperCase();
  const tgtFlag = findLanguage(item.targetLang)?.flag ?? item.targetLang.toUpperCase();
  content.innerHTML = `
    <span class="icon hist-search">${ICONS.search}</span>
    <span class="query"></span>
    <span class="langs"><span>${srcFlag}</span><span class="icon">${ICONS.arrowRight}</span><span>${tgtFlag}</span></span>`;
  content.querySelector(".query").textContent = item.query;
  row.appendChild(content);

  let offset = 0;
  let willDelete = false;
  let rowWidth = row.getBoundingClientRect().width || 390;
  let dragging = false;
  let startX = 0, startY = 0, startOffset = 0, deciding = true, isHorizontal = false;

  const fullSwipeThreshold = () => rowWidth * 0.25;

  function applyOffset(animated) {
    content.classList.toggle("animated", animated);
    content.style.setProperty("--off", `${offset}px`);
    del.style.setProperty("--reveal", `${Math.max(0, -offset)}px`);
    const progress = Math.min(1, Math.max(0, -offset) / DELETE_WIDTH);
    delInner.style.setProperty("--del-opacity", progress > 0.22 ? "1" : "0");
    delInner.style.setProperty("--del-scale", willDelete ? "1.15" : String(0.5 + progress * 0.5));
  }

  function reset(animated = true) {
    offset = 0;
    willDelete = false;
    applyOffset(animated);
  }

  function commitDelete() {
    if (navigator.vibrate) navigator.vibrate(15);
    content.classList.add("animated");
    offset = -rowWidth;
    content.style.setProperty("--off", `${offset}px`);
    setTimeout(() => onDelete(), 200);
  }

  content.addEventListener("pointerdown", (e) => {
    rowWidth = row.getBoundingClientRect().width || rowWidth;
    dragging = true;
    deciding = true;
    isHorizontal = false;
    startX = e.clientX;
    startY = e.clientY;
    startOffset = offset;
    content.setPointerCapture(e.pointerId);
  });

  content.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (deciding) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      isHorizontal = Math.abs(dx) > Math.abs(dy);
      deciding = false;
      if (!isHorizontal) { dragging = false; return; }
    }
    if (!isHorizontal) return;
    e.preventDefault();
    let next = startOffset + dx;
    if (next < 0) {
      next = Math.max(next, -rowWidth);
    } else {
      next = Math.min(0, next);
    }
    offset = next;
    const crossing = -offset > fullSwipeThreshold();
    if (crossing && !willDelete && navigator.vibrate) navigator.vibrate(8);
    willDelete = crossing;
    applyOffset(false);
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (!isHorizontal) return;
    const dx = offset - startOffset;
    if (willDelete) {
      commitDelete();
    } else if (offset < -DELETE_WIDTH / 2) {
      offset = -DELETE_WIDTH;
      willDelete = false;
      applyOffset(true);
    } else {
      reset(true);
    }
  }
  content.addEventListener("pointerup", endDrag);
  content.addEventListener("pointercancel", endDrag);

  del.addEventListener("click", commitDelete);

  content.addEventListener("click", () => {
    if (offset < 0) {
      reset(true);
    } else {
      onSelect();
    }
  });

  applyOffset(false);
  return row;
}

// Rendert eine Verlaufsliste (mit Header + „Alles löschen") in `container`.
export function renderHistoryList(container, items, { onSelect, onRemove, onClear }) {
  container.innerHTML = "";
  const header = document.createElement("div");
  header.className = "history-header";
  header.innerHTML = `<span class="icon">${ICONS.clock}</span><span class="label">Verlauf</span>`;
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "clear-all";
  clearBtn.textContent = "Alles löschen";
  clearBtn.addEventListener("click", onClear);
  header.appendChild(clearBtn);
  container.appendChild(header);

  items.forEach((item, i) => {
    container.appendChild(makeHistoryRow(item, () => onSelect(item), () => onRemove(item)));
    if (i < items.length - 1) {
      const div = document.createElement("div");
      div.className = "history-row-divider";
      container.appendChild(div);
    }
  });
}
