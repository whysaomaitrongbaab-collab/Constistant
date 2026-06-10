/**
 * Entry point for the Drawing Intelligence feature. It wires the extracted
 * upload, Gemini, parser, and UI modules together for the page.
 */

import { qt_onDragOver, qt_onDragLeave, qt_onDrop, qt_onFileChange, qt_setFile, qt_extractPdfPages, qt_showPageModal, qt_closePageModal } from './drawing-upload.js';
import { qt_callGeminiParts } from './drawing-gemini.js';
import { qt_normalizeGeminiResponse } from './drawing-parser.js';
import { qt_renderReview, qt_setStatus, qt_setProgress, qt_showError, qt_hideError, qt_setPhase, qt_goBack, qt_goReview, qt_getActiveChips, qt_toggleChip, qt_toggleCalcChip, qt_getCalcOptions, qt_updateField, qt_setStirrupType, qt_setSecStirrupType, qt_addLengthGroup, qt_removeLengthGroup, qt_addSection, qt_deleteElement, qt_addElement } from './drawing-ui.js';

export async function qt_runRead() {
  const key = (globalThis.qt_API_KEY || document.getElementById('api-key').value).trim();
  if (!key) { qt_showError('กรุณาใส่ Gemini API Key ก่อน'); return; }
  if (!globalThis.qt_selectedFile) { qt_showError('กรุณา upload ไฟล์ก่อน'); return; }
  const elements = [...document.querySelectorAll('#element-chips .chip.active')].map(c => c.dataset.id);
  const note = document.getElementById('extra-note').value.trim();
  if (!elements.length) { qt_showError('เลือก element อย่างน้อย 1 อย่าง'); return; }

  qt_hideError(); qt_setStatus('loading');
  document.getElementById('run-btn').disabled = true;

  try {
    qt_setProgress('กำลังแตกหน้า PDF…');
    if (!globalThis.qt_pdfPageDataUrls.length) globalThis.qt_pdfPageDataUrls = await qt_extractPdfPages(globalThis.qt_selectedFile, 1.2);
    const pages = globalThis.qt_pdfPageDataUrls;
    const isPdf = globalThis.qt_selectedFile.type === 'application/pdf';
    let thumbPages = pages;
    if (isPdf && pages.length > 1) thumbPages = await qt_extractPdfPages(globalThis.qt_selectedFile, 0.5);

    let secPageIdxs = null;
    let layPageIdxs = [];

    if (isPdf && pages.length > 1) {
      qt_setProgress('Pass 0/4 — AI ระบุหน้าแบบ…');
      const thumbParts = thumbPages.map((d, i) => [{ text: `=== Page ${i + 1} ===` }, { inline_data: { mime_type: 'image/jpeg', data: d.split(',')[1] } }]).flat();
      const p0 = `You are a structural engineer. Identify pages from this structural PDF.\nReturn ONLY valid JSON:\n{"section_pages":[20,21],"layout_pages":[16,17],"layout_confident":true}`;
      try {
        const d0 = await qt_callGeminiParts(key, p0, thumbParts);
        if (d0?.section_pages?.length) secPageIdxs = d0.section_pages.map(p => p - 1);
        if (d0?.layout_pages?.length) {
          layPageIdxs = d0.layout_pages.map(p => p - 1);
          if (layPageIdxs.length > 1) {
            qt_setProgress('กรุณาเลือกหน้าผังที่ต้องการ…');
            const chosen = await qt_showPageModal(layPageIdxs, thumbPages);
            if (chosen) layPageIdxs = chosen;
          }
        }
      } catch (e) { console.error('[Pass0] error:', e.message); }
    }

    const secPages = secPageIdxs?.length ? secPageIdxs.map(i => pages[i]) : pages;
    const secParts = secPages.map(d => ({ inline_data: { mime_type: 'image/jpeg', data: d.split(',')[1] } }));
    const layB64s = layPageIdxs.filter(i => i < pages.length).map(i => pages[i].split(',')[1]);

    qt_setProgress('Pass 1/4 — AI อ่าน section detail…');
    const p1 = `You are a structural engineer reading STRUCTURAL SECTION DETAIL drawings.\nELEMENT TYPES TO FIND: ${elements.join(', ')}\n${note ? `\nSPECIAL INSTRUCTIONS — STRICTLY FOLLOW, OVERRIDE EVERYTHING:\n${note}` : 'Extract ALL structural elements shown in the drawing.'}`;
    const pass1Data = await qt_callGeminiParts(key, p1, secParts);
    const normalized = qt_normalizeGeminiResponse(pass1Data);
    let els = normalized.elements || [];
    if (!els.length) throw new Error('ไม่พบ element ในแบบ — ลองอัปโหลดรูปที่ชัดกว่านี้');

    if (!layB64s.length) {
      globalThis.qt_elementsData = els.map(e => ({ ...e }));
      qt_renderReview(pass1Data.warnings || []);
      qt_setPhase(2); qt_setStatus('review'); qt_setProgress('');
      document.getElementById('run-btn').disabled = false;
      return;
    }

    qt_setProgress('Pass 2/4 — AI สำรวจ element IDs ในผัง…');
    const p2 = `You are a structural engineer reading a STRUCTURAL LAYOUT PLAN.\nList ALL structural element IDs visible on this page.\nReturn ONLY valid JSON: {"ids":["B1","B1'","B2","B3"]}`;
    let layoutIds = els.map(e => e.id);
    try {
      const allIds = new Set();
      for (const part of layB64s.map(b => ({ inline_data: { mime_type: 'image/jpeg', data: b } }))) {
        const d2 = await qt_callGeminiParts(key, p2, [part]);
        if (d2?.ids?.length) d2.ids.forEach(id => allIds.add(id));
        await new Promise(r => setTimeout(r, 400));
      }
      if (allIds.size) layoutIds = [...allIds];
    } catch (e) { }

    const countMap = {};
    for (const id of new Set(els.map(e => e.id))) {
      qt_setProgress(`Pass 3/4 — นับ ${id}…`);
      const acc = {};
      for (let pi = 0; pi < layB64s.length; pi++) {
        try {
          const d3 = await qt_callGeminiParts(key, `Count ALL instances of element "${id}" on this page.\nReturn ONLY valid JSON: {"length_groups":[{"length":3.0,"qty":6}]}`, [{ inline_data: { mime_type: 'image/jpeg', data: layB64s[pi] } }]);
          if (d3?.length_groups?.length) {
            d3.length_groups.forEach(g => { if (g.length > 0 && g.qty > 0) { const lk = g.length.toFixed(2); acc[lk] = (acc[lk] || 0) + g.qty; } });
          }
        } catch (e) { console.error(`[Pass3] "${id}" error:`, e.message); }
        await new Promise(r => setTimeout(r, 500));
      }
      const merged = Object.entries(acc).map(([l, q]) => ({ length: parseFloat(l), qty: q }));
      if (merged.length) countMap[id] = merged;
    }

    qt_setProgress('Pass 4/4 — Merge ผลลัพธ์…');
    els = els.map(el => {
      if (countMap[el.id] && countMap[el.id][0]?.length > 0) return { ...el, length_groups: countMap[el.id] };
      return { ...el, estimated: true };
    });
    const warnings = [...(pass1Data.warnings || [])];
    globalThis.qt_elementsData = els.map(e => ({ ...e }));
    qt_renderReview(warnings);
    qt_setPhase(2); qt_setStatus('review'); qt_setProgress('');
    document.getElementById('run-btn').disabled = false;
  } catch (err) {
    qt_showError(err.message || 'เกิดข้อผิดพลาด');
    qt_setProgress('');
    document.getElementById('run-btn').disabled = false;
  }
}

export function qt_toggleKey() {
  const input = document.getElementById('api-key');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  const btn = document.getElementById('key-toggle');
  if (btn) btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

window.qt_runRead = qt_runRead;
window.qt_onFileChange = qt_onFileChange;
window.qt_onDrop = qt_onDrop;
window.qt_onDragOver = qt_onDragOver;
window.qt_onDragLeave = qt_onDragLeave;
window.qt_setFile = qt_setFile;
window.qt_extractPdfPages = qt_extractPdfPages;
window.qt_showPageModal = qt_showPageModal;
window.qt_closePageModal = qt_closePageModal;
window.qt_toggleKey = qt_toggleKey;

globalThis.qt_runRead = qt_runRead;
globalThis.qt_onFileChange = qt_onFileChange;
globalThis.qt_onDrop = qt_onDrop;
globalThis.qt_onDragOver = qt_onDragOver;
globalThis.qt_onDragLeave = qt_onDragLeave;
globalThis.qt_setFile = qt_setFile;
globalThis.qt_extractPdfPages = qt_extractPdfPages;
globalThis.qt_showPageModal = qt_showPageModal;
globalThis.qt_closePageModal = qt_closePageModal;
globalThis.qt_toggleKey = qt_toggleKey;
window.qt_setPhase = qt_setPhase;
window.qt_goBack = qt_goBack;
window.qt_goReview = qt_goReview;
window.qt_setStatus = qt_setStatus;
window.qt_showError = qt_showError;
window.qt_hideError = qt_hideError;
window.qt_setProgress = qt_setProgress;
window.qt_getActiveChips = qt_getActiveChips;
window.qt_toggleChip = qt_toggleChip;
window.qt_toggleCalcChip = qt_toggleCalcChip;
window.qt_getCalcOptions = qt_getCalcOptions;
window.qt_renderReview = qt_renderReview;
window.qt_updateField = qt_updateField;
window.qt_setStirrupType = qt_setStirrupType;
window.qt_setSecStirrupType = qt_setSecStirrupType;
window.qt_addLengthGroup = qt_addLengthGroup;
window.qt_removeLengthGroup = qt_removeLengthGroup;
window.qt_addSection = qt_addSection;
window.qt_deleteElement = qt_deleteElement;
window.qt_addElement = qt_addElement;

globalThis.qt_setPhase = qt_setPhase;
globalThis.qt_goBack = qt_goBack;
globalThis.qt_goReview = qt_goReview;
globalThis.qt_setStatus = qt_setStatus;
globalThis.qt_showError = qt_showError;
globalThis.qt_hideError = qt_hideError;
globalThis.qt_setProgress = qt_setProgress;
globalThis.qt_getActiveChips = qt_getActiveChips;
globalThis.qt_toggleChip = qt_toggleChip;
globalThis.qt_toggleCalcChip = qt_toggleCalcChip;
globalThis.qt_getCalcOptions = qt_getCalcOptions;
globalThis.qt_renderReview = qt_renderReview;
globalThis.qt_updateField = qt_updateField;
globalThis.qt_setStirrupType = qt_setStirrupType;
globalThis.qt_setSecStirrupType = qt_setSecStirrupType;
globalThis.qt_addLengthGroup = qt_addLengthGroup;
globalThis.qt_removeLengthGroup = qt_removeLengthGroup;
globalThis.qt_addSection = qt_addSection;
globalThis.qt_deleteElement = qt_deleteElement;
globalThis.qt_addElement = qt_addElement;

if (typeof document !== 'undefined') {
  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.addEventListener('change', (e) => qt_onFileChange(e));
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', qt_onDragOver);
    dropZone.addEventListener('dragleave', qt_onDragLeave);
    dropZone.addEventListener('drop', qt_onDrop);
  }
  const runBtn = document.getElementById('run-btn');
  if (runBtn) runBtn.addEventListener('click', () => qt_runRead());
  const keyToggle = document.getElementById('key-toggle');
  if (keyToggle) keyToggle.addEventListener('click', () => { const i = document.getElementById('api-key'); i.type = i.type === 'password' ? 'text' : 'password'; keyToggle.textContent = i.type === 'password' ? '👁' : '🙈'; });
}
