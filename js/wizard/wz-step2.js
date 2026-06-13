// wz-step2.js — Onboarding Wizard Step 2: review extracted data
//
// Panel A: element-type count review (editable corrected counts -> project_config.timeline.estimation_basis)
// Panel B: design standard note (confirmed in Step 3)
// Panel C: unknown sheets — label or mark irrelevant
// Falls back to the manual entry table (wz-manual-fallback.js) when extraction found nothing.

import { workTypeFromElementType, WORK_TYPE_HIERARCHY } from '../shared/schema.js';
import { getCurrentProjectId, projectStorageKey, getProjectElements, saveProjectElements } from '../shared/project-store.js';
import { wz_ensureConfig, wz_saveConfig, wz_goToStep, wz_prevStep } from './wz-index.js';
import { wz_renderManualDetailed, wz_saveManualElements } from './wz-manual-detailed.js';

const UPLOADS_KEY = 'constistant_drawing_uploads_v1';

const SHEET_TYPE_LABEL = {
  floor_plan: 'ผังพื้น',
  section_detail: 'รายละเอียดหน้าตัด',
  general_notes: 'หมายเหตุทั่วไป',
  schedule_table: 'ตาราง element',
  unknown: 'ไม่ทราบประเภท',
};

let panelACorrections = {}; // { element_type: correctedCount }

export function wz_renderStep2(root) {
  const projectId = getCurrentProjectId();
  const { elements } = getProjectElements(projectId);
  const manualMode = sessionStorage.getItem('wz_manual_mode') === '1' || elements.length === 0;

  if (manualMode) {
    root.innerHTML = `
      <div class="wz-step">
        <h2 class="wz-step__title">ขั้นตอนที่ 2 — ตรวจสอบข้อมูล</h2>
        <p class="wz-step__desc">ยังไม่พบข้อมูล element จากแบบ — กรอกปริมาณงานโดยประมาณด้านล่าง</p>
        <div id="wz-manual-mount"></div>
        <div class="wz-actions">
          <button type="button" class="fp-btn-secondary" id="wz-step2-back">ย้อนกลับ</button>
          <div class="wz-actions__spacer"></div>
          <button type="button" class="fp-btn-primary" id="wz-step2-next">ถัดไป</button>
        </div>
      </div>
    `;
    wz_renderManualDetailed(root.querySelector('#wz-manual-mount'));
    root.querySelector('#wz-step2-back').addEventListener('click', () => wz_prevStep());
    root.querySelector('#wz-step2-next').addEventListener('click', () => {
      wz_saveManualElements();
      sessionStorage.removeItem('wz_manual_mode');
      wz_goToStep(3);
    });
    return;
  }

  // Panel A — aggregate counts by element_type
  panelACorrections = {};
  const countsByType = {};
  elements.forEach(el => {
    countsByType[el.element_type] = (countsByType[el.element_type] || 0) + (el.count || 0);
  });

  // Panel C — unknown sheets
  const uploads = wz_loadUploads(projectId);
  const unknownSheets = uploads.filter(u => u.sheet_type === 'unknown' && !u.manual_override_note);

  root.innerHTML = `
    <div class="wz-step">
      <h2 class="wz-step__title">ขั้นตอนที่ 2 — ตรวจสอบข้อมูล</h2>
      <p class="wz-step__desc">ตรวจสอบจำนวน element ที่ระบบอ่านได้ และแก้ไขหากไม่ตรงกับแบบจริง</p>

      <div class="wz-panel">
        <h3 class="wz-panel__title">A. จำนวน element ตามประเภท</h3>
        <table class="wz-table">
          <thead><tr><th>ประเภทงาน</th><th>จำนวนที่อ่านได้</th><th>จำนวนที่ถูกต้อง</th></tr></thead>
          <tbody>
            ${Object.entries(countsByType).map(([type, count]) => `
              <tr>
                <td>${ELEMENT_TYPE_LABEL_TH[type] || type}</td>
                <td>${count}</td>
                <td><input type="number" min="0" class="wz-input wz-input--narrow" data-correct="${type}" value="${count}"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="wz-panel">
        <h3 class="wz-panel__title">B. มาตรฐานการออกแบบ</h3>
        <p class="wz-panel__desc">ระบบไม่พบหมายเหตุมาตรฐานออกแบบจากแบบที่อัปโหลด — จะใช้ค่ามาตรฐาน (WSD) เป็นค่าเริ่มต้น คุณสามารถปรับได้ในขั้นตอนที่ 3</p>
      </div>

      ${unknownSheets.length ? `
      <div class="wz-panel">
        <h3 class="wz-panel__title">C. หน้าที่ไม่ทราบประเภท (${unknownSheets.length})</h3>
        <table class="wz-table">
          <thead><tr><th>ไฟล์</th><th>ระบุประเภท</th><th></th></tr></thead>
          <tbody>
            ${unknownSheets.map((u) => `
              <tr data-upload="${u.id}">
                <td>${escapeHtml(u.file_name)}</td>
                <td>
                  <select class="wz-input wz-input--narrow" data-label="${u.id}">
                    ${Object.entries(SHEET_TYPE_LABEL).map(([type, label]) =>
                      `<option value="${type}" ${u.sheet_type === type ? 'selected' : ''}>${label}</option>`).join('')}
                  </select>
                </td>
                <td><button type="button" class="wz-link-btn" data-irrelevant="${u.id}">ไม่เกี่ยวข้อง</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <div class="wz-actions">
        <button type="button" class="fp-btn-secondary" id="wz-step2-back">ย้อนกลับ</button>
        <div class="wz-actions__spacer"></div>
        <button type="button" class="fp-btn-primary" id="wz-step2-next">ถัดไป</button>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-correct]').forEach(input => {
    input.addEventListener('input', (e) => {
      panelACorrections[e.target.dataset.correct] = Math.max(0, parseInt(e.target.value, 10) || 0);
    });
  });

  root.querySelectorAll('[data-label]').forEach(select => {
    select.addEventListener('change', (e) => wz_labelUnknownSheet(projectId, e.target.dataset.label, e.target.value));
  });
  root.querySelectorAll('[data-irrelevant]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      wz_markSheetIrrelevant(projectId, e.target.dataset.irrelevant);
      wz_renderStep2(root);
    });
  });

  root.querySelector('#wz-step2-back').addEventListener('click', () => wz_prevStep());
  root.querySelector('#wz-step2-next').addEventListener('click', () => {
    wz_step2_applyCorrections(projectId, elements, countsByType);
    wz_goToStep(3);
  });
}

const ELEMENT_TYPE_LABEL_TH = {
  column: 'เสา',
  beam: 'คาน',
  girder: 'คานหลัก',
  slab: 'พื้น',
  footing: 'ฐานราก',
  staircase: 'บันได',
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function wz_step2_applyCorrections(projectId, elements, countsByType) {
  const hasCorrections = Object.entries(panelACorrections).some(([type, corrected]) => corrected !== countsByType[type]);

  if (Object.keys(panelACorrections).length) {
    const { beamLibraryById } = getProjectElements(projectId);
    const updatedElements = elements.map(el => {
      if (!(el.element_type in panelACorrections)) return el;
      return { ...el, user_verified: true };
    });
    saveProjectElements(projectId, updatedElements, beamLibraryById);
  }

  if (hasCorrections) {
    const config = wz_ensureConfig(projectId);
    const elementCounts = config.timeline.estimation_basis.element_counts || {};
    Object.entries(panelACorrections).forEach(([elementType, corrected]) => {
      const workType = workTypeFromElementType(elementType);
      const extracted = countsByType[elementType] || 0;
      elementCounts[workType] = { extracted, corrected: corrected !== extracted ? corrected : null };
    });
    config.timeline.estimation_basis.element_counts = elementCounts;
    wz_saveConfig(config, projectId);
  }
}

function wz_loadUploads(projectId) {
  try {
    const raw = localStorage.getItem(projectStorageKey(UPLOADS_KEY, projectId));
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('[wizard] failed to load drawing_uploads', e); }
  return [];
}

function wz_saveUploads(projectId, uploads) {
  localStorage.setItem(projectStorageKey(UPLOADS_KEY, projectId), JSON.stringify(uploads));
}

export function wz_labelUnknownSheet(projectId, uploadId, sheetType) {
  const uploads = wz_loadUploads(projectId);
  const upload = uploads.find(u => u.id === uploadId);
  if (upload) upload.sheet_type = sheetType;
  wz_saveUploads(projectId, uploads);
}

export function wz_markSheetIrrelevant(projectId, uploadId) {
  const uploads = wz_loadUploads(projectId);
  const upload = uploads.find(u => u.id === uploadId);
  if (upload) upload.manual_override_note = 'marked_irrelevant';
  wz_saveUploads(projectId, uploads);
}

window.wz_labelUnknownSheet = wz_labelUnknownSheet;
window.wz_markSheetIrrelevant = wz_markSheetIrrelevant;
