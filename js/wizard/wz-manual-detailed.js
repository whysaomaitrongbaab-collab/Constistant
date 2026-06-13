/**
 * wz-manual-detailed.js — Advanced manual structural element entry
 *
 * Replaces wz-manual-fallback.js with detailed per-element forms:
 * - Floor-based grouping (F1, F2, RF, etc.)
 * - Element-specific inputs (Column: width/height/bars, Beam: span/depth, etc.)
 * - Real-time calculation (dimensions → quantities → costs)
 * - Price integration from price-config.js
 */

import { createDrawingElement, createBeamLibraryEntry, REBAR_UNIT_WEIGHT, calcRebarWeight } from '../shared/schema.js';
import { getCurrentProjectId, getProjectElements, saveProjectElements } from '../shared/project-store.js';
import { getConcretePrice, getRebarPrice, getFormworkPrice } from '../shared/price-config.js';

const ELEMENT_TYPE_LABEL = {
  column: 'เสา',
  beam: 'คาน',
  slab: 'พื้น',
  footing: 'ฐานราก',
  staircase: 'บันได',
};

const STEEL_GRADES = ['SR24', 'SD30', 'SD40'];
const CONCRETE_GRADES = ['M200', 'M240', 'M280', 'M320', 'M350'];
const REBAR_DIAMETERS = [6, 9, 10, 12, 16, 19, 20, 25, 28, 32, 40];

// Default dimensions per element type
const DEFAULT_DIMENSIONS = {
  column: { width_mm: 300, height_mm: 300, length_m: 3.0, main_bar_count: 8, main_bar_dia_mm: 16, stirrup_dia_mm: 6, stirrup_spacing_mm: 150, concrete_grade: 'M240', steel_grade: 'SD40' },
  beam: { width_mm: 200, height_mm: 400, length_m: 5.0, main_bar_count: 4, main_bar_dia_mm: 16, stirrup_dia_mm: 6, stirrup_spacing_mm: 150, concrete_grade: 'M240', steel_grade: 'SD40' },
  slab: { length_m: 5.0, width_m: 4.0, thickness_mm: 120, bar_dia_mm: 10, bar_spacing_mm: 200, concrete_grade: 'M240', steel_grade: 'SD30' },
  footing: { length_m: 1.2, width_m: 1.2, height_mm: 500, main_bar_count: 10, main_bar_dia_mm: 16, stirrup_dia_mm: 9, stirrup_spacing_mm: 200, concrete_grade: 'M240', steel_grade: 'SD40' },
  staircase: { length_m: 3.0, width_m: 1.0, height_mm: 150, main_bar_count: 6, main_bar_dia_mm: 12, concrete_grade: 'M240', steel_grade: 'SD30' },
};

let floors = ['F1', 'F2', 'RF'];
let elementsByFloor = {
  F1: [],
  F2: [],
  RF: [],
};

export function wz_renderManualDetailed(container) {
  container.innerHTML = `
    <div class="wz-panel">
      <h3 class="wz-panel__title">กรอกข้อมูลโครงสร้าง (รายละเอียดแบบเต็ม)</h3>
      <p class="wz-panel__desc">เลือกชั้นแล้วเพิ่มรายการโครงสร้าง — ระบบจะคำนวณปริมาณคอนกรีต เหล็กเสริม และแบบหล่อโดยอัตโนมัติ</p>

      <div class="wz-floor-tabs" id="wz-floor-tabs">
        ${floors.map(floor => `
          <button type="button" class="wz-floor-tab" data-floor="${floor}">
            ${floor}
            <span class="wz-floor-count" data-floor="${floor}"></span>
          </button>
        `).join('')}
        <button type="button" class="wz-icon-btn" id="wz-add-floor" title="เพิ่มชั้น">+ ชั้น</button>
      </div>

      <div class="wz-floor-content" id="wz-floor-content"></div>

      <div class="wz-actions">
        <button type="button" class="fp-btn-secondary" id="wz-manual-cancel">ยกเลิก</button>
        <div class="wz-actions__spacer"></div>
        <button type="button" class="fp-btn-primary" id="wz-manual-save">บันทึกและดำเนินการต่อ</button>
      </div>
    </div>
  `;

  // Floor tab selection
  container.querySelectorAll('[data-floor]').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.wz-floor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderFloorContent(container, tab.dataset.floor);
    });
  });

  // Add new floor
  container.querySelector('#wz-add-floor').addEventListener('click', () => {
    const newFloor = prompt('ชื่อชั้นใหม่ (เช่น F3, B1)', 'F' + (floors.length + 1));
    if (newFloor && !floors.includes(newFloor)) {
      floors.push(newFloor);
      elementsByFloor[newFloor] = [];
      wz_renderManualDetailed(container);
    }
  });

  // Save
  container.querySelector('#wz-manual-save').addEventListener('click', () => {
    wz_saveManualElements();
  });

  // Initialize first floor
  container.querySelector(`[data-floor="${floors[0]}"]`).click();
  updateFloorCounts(container);
}

function renderFloorContent(container, floor) {
  const content = container.querySelector('#wz-floor-content');
  const elements = elementsByFloor[floor] || [];

  content.innerHTML = `
    <div class="wz-floor-panel">
      <h4 class="wz-floor-title">ชั้น ${floor}</h4>

      <div class="wz-elements-list" id="wz-elements-list">
        ${elements.length === 0 ? '<p class="wz-empty">ยังไม่มีรายการ</p>' : elements.map((el, idx) => renderElementRow(floor, idx, el)).join('')}
      </div>

      <div class="wz-add-element">
        <label>เพิ่มรายการใหม่:</label>
        <select id="wz-element-type-select">
          <option value="">-- เลือกประเภท --</option>
          ${Object.entries(ELEMENT_TYPE_LABEL).map(([type, label]) => `<option value="${type}">${label}</option>`).join('')}
        </select>
        <button type="button" class="fp-btn-secondary" id="wz-add-element-btn">เพิ่ม</button>
      </div>

      <div id="wz-element-form" class="wz-element-form" hidden></div>
    </div>
  `;

  const selectEl = content.querySelector('#wz-element-type-select');
  const addBtn = content.querySelector('#wz-add-element-btn');

  addBtn.addEventListener('click', () => {
    const type = selectEl.value;
    if (!type) {
      alert('เลือกประเภทรายการก่อน');
      return;
    }
    const newEl = { ...DEFAULT_DIMENSIONS[type], element_type: type, count: 1, element_id: `${type.toUpperCase()}-${elements.length + 1}` };
    elements.push(newEl);
    selectEl.value = '';
    renderFloorContent(container, floor);
    updateFloorCounts(container);
    setTimeout(() => scrollToElement(container, elements.length - 1), 100);
  });

  // Edit/delete element handlers
  content.querySelectorAll('[data-edit-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.editIdx;
      showElementForm(container, floor, idx);
    });
  });

  content.querySelectorAll('[data-delete-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.deleteIdx;
      if (confirm('ลบรายการนี้?')) {
        elements.splice(idx, 1);
        renderFloorContent(container, floor);
        updateFloorCounts(container);
      }
    });
  });
}

function renderElementRow(floor, idx, el) {
  const concreteM3 = calculateConcreteVolume(el);
  const rebarKg = calculateRebarWeight(el);
  const formworkM2 = calculateFormworkArea(el);
  const concretePrice = getConcretePrice(240);
  const rebarPrice = getRebarPrice(el.steel_grade || 'SD40', el.main_bar_dia_mm || el.bar_dia_mm || 16);
  const formworkPrice = getFormworkPrice(el.element_type);

  const concreteCost = concreteM3 * (concretePrice?.price || 2470);
  const rebarCost = rebarKg * (rebarPrice?.price || 18.5);
  const formworkCost = formworkM2 * (formworkPrice?.price || 280);
  const totalCost = concreteCost + rebarCost + formworkCost;

  return `
    <div class="wz-element-card">
      <div class="wz-element-header">
        <span class="wz-element-title">${ELEMENT_TYPE_LABEL[el.element_type]} (${el.element_id})</span>
        <span class="wz-element-count">× ${el.count}</span>
        <button type="button" class="wz-icon-btn" data-edit-idx="${idx}" title="แก้ไข">✏️</button>
        <button type="button" class="wz-icon-btn" data-delete-idx="${idx}" title="ลบ">✕</button>
      </div>
      <div class="wz-element-summary">
        <div class="wz-summary-item"><span>คอนกรีต:</span> <strong>${concreteM3.toFixed(2)} ม³</strong> (฿${concreteCost.toLocaleString('th-TH')})</div>
        <div class="wz-summary-item"><span>เหล็ก:</span> <strong>${rebarKg.toFixed(2)} กก.</strong> (฿${rebarCost.toLocaleString('th-TH')})</div>
        <div class="wz-summary-item"><span>แบบหล่อ:</span> <strong>${formworkM2.toFixed(2)} ม²</strong> (฿${formworkCost.toLocaleString('th-TH')})</div>
        <div class="wz-summary-total"><strong>รวม: ฿${totalCost.toLocaleString('th-TH')}</strong></div>
      </div>
    </div>
  `;
}

function showElementForm(container, floor, idx) {
  const el = elementsByFloor[floor][idx];
  if (!el) return;

  const formDiv = container.querySelector('#wz-element-form');
  formDiv.hidden = false;

  let formHTML = `
    <div class="wz-form">
      <h4>แก้ไข: ${ELEMENT_TYPE_LABEL[el.element_type]}</h4>

      <div class="wz-form-row">
        <label>ID: <input type="text" class="wz-input" id="wz-form-element_id" value="${el.element_id}"></label>
        <label>จำนวน: <input type="number" min="1" class="wz-input" id="wz-form-count" value="${el.count}"></label>
      </div>

      <div class="wz-form-row">
        <label>เกรดเหล็ก: <select class="wz-input" id="wz-form-steel_grade">${STEEL_GRADES.map(g => `<option ${el.steel_grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label>เกรดคอนกรีต: <select class="wz-input" id="wz-form-concrete_grade">${CONCRETE_GRADES.map(g => `<option ${el.concrete_grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      </div>
  `;

  if (el.element_type === 'column' || el.element_type === 'beam' || el.element_type === 'footing') {
    formHTML += `
      <fieldset class="wz-form-section">
        <legend>มิติหน้าตัด</legend>
        <div class="wz-form-row">
          <label>กว้าง (mm): <input type="number" class="wz-input" id="wz-form-width_mm" value="${el.width_mm || ''}"></label>
          <label>สูง (mm): <input type="number" class="wz-input" id="wz-form-height_mm" value="${el.height_mm || ''}"></label>
        </div>
      </fieldset>

      <fieldset class="wz-form-section">
        <legend>ความยาว/ช่วง</legend>
        <div class="wz-form-row">
          <label>ความยาว (ม.): <input type="number" step="0.1" class="wz-input" id="wz-form-length_m" value="${el.length_m || el.span_length_m || 3.0}"></label>
        </div>
      </fieldset>

      <fieldset class="wz-form-section">
        <legend>เหล็กแกน (Main Bar)</legend>
        <div class="wz-form-row">
          <label>จำนวน: <input type="number" class="wz-input" id="wz-form-main_bar_count" value="${el.main_bar_count || ''}"></label>
          <label>เส้นผ่าน (mm): <select class="wz-input" id="wz-form-main_bar_dia_mm">${REBAR_DIAMETERS.map(d => `<option ${el.main_bar_dia_mm === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        </div>
      </fieldset>

      <fieldset class="wz-form-section">
        <legend>เหล็กปลอก (Stirrups)</legend>
        <div class="wz-form-row">
          <label>เส้นผ่าน (mm): <select class="wz-input" id="wz-form-stirrup_dia_mm">${REBAR_DIAMETERS.map(d => `<option ${el.stirrup_dia_mm === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <label>ระยะห่าง (mm): <input type="number" class="wz-input" id="wz-form-stirrup_spacing_mm" value="${el.stirrup_spacing_mm || 150}"></label>
        </div>
      </fieldset>
    `;
  } else if (el.element_type === 'slab') {
    formHTML += `
      <fieldset class="wz-form-section">
        <legend>มิติพื้น</legend>
        <div class="wz-form-row">
          <label>ความยาว (ม.): <input type="number" step="0.1" class="wz-input" id="wz-form-length_m" value="${el.length_m || 5}"></label>
          <label>ความกว้าง (ม.): <input type="number" step="0.1" class="wz-input" id="wz-form-width_m" value="${el.width_m || 4}"></label>
          <label>ความหนา (mm): <input type="number" class="wz-input" id="wz-form-thickness_mm" value="${el.thickness_mm || 120}"></label>
        </div>
      </fieldset>

      <fieldset class="wz-form-section">
        <legend>เหล็กเสริม (ทั้งสองทิศทาง)</legend>
        <div class="wz-form-row">
          <label>เส้นผ่าน (mm): <select class="wz-input" id="wz-form-bar_dia_mm">${REBAR_DIAMETERS.map(d => `<option ${el.bar_dia_mm === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <label>ระยะห่าง (mm): <input type="number" class="wz-input" id="wz-form-bar_spacing_mm" value="${el.bar_spacing_mm || 200}"></label>
        </div>
      </fieldset>
    `;
  }

  formHTML += `
    <div class="wz-form-actions">
      <button type="button" class="fp-btn-secondary" id="wz-form-cancel">ยกเลิก</button>
      <button type="button" class="fp-btn-primary" id="wz-form-save">บันทึก</button>
    </div>
  `;

  formDiv.innerHTML = formHTML;

  // Save form
  formDiv.querySelector('#wz-form-save').addEventListener('click', () => {
    const updated = {
      ...el,
      element_id: formDiv.querySelector('#wz-form-element_id')?.value || el.element_id,
      count: +formDiv.querySelector('#wz-form-count')?.value || 1,
      steel_grade: formDiv.querySelector('#wz-form-steel_grade')?.value || el.steel_grade,
      concrete_grade: formDiv.querySelector('#wz-form-concrete_grade')?.value || el.concrete_grade,
    };

    // Capture dimension fields
    const fields = ['width_mm', 'height_mm', 'length_m', 'span_length_m', 'width_m', 'thickness_mm', 'main_bar_count', 'main_bar_dia_mm', 'stirrup_dia_mm', 'stirrup_spacing_mm', 'bar_dia_mm', 'bar_spacing_mm'];
    fields.forEach(field => {
      const input = formDiv.querySelector(`#wz-form-${field}`);
      if (input) updated[field] = isNaN(parseFloat(input.value)) ? input.value : parseFloat(input.value);
    });

    elementsByFloor[floor][idx] = updated;
    formDiv.hidden = true;
    renderFloorContent(container, floor);
    updateFloorCounts(container);
  });

  formDiv.querySelector('#wz-form-cancel').addEventListener('click', () => {
    formDiv.hidden = true;
  });
}

// ─────────────────────────────────────────────
// CALCULATIONS
// ─────────────────────────────────────────────

function calculateConcreteVolume(el) {
  const count = el.count || 1;

  if (el.element_type === 'column' || el.element_type === 'beam' || el.element_type === 'footing') {
    const wM = (el.width_mm || 0) / 1000;
    const hM = (el.height_mm || 0) / 1000;
    const lM = el.length_m || el.span_length_m || 3.0;
    return count * wM * hM * lM;
  } else if (el.element_type === 'slab') {
    const lM = el.length_m || 5;
    const wM = el.width_m || 4;
    const tM = (el.thickness_mm || 120) / 1000;
    return count * lM * wM * tM;
  } else if (el.element_type === 'staircase') {
    const lM = el.length_m || 3;
    const wM = el.width_m || 1;
    const tM = (el.height_mm || 150) / 1000;
    return count * lM * wM * tM;
  }
  return 0;
}

function calculateFormworkArea(el) {
  const count = el.count || 1;

  if (el.element_type === 'column') {
    const wM = (el.width_mm || 0) / 1000;
    const hM = (el.height_mm || 0) / 1000;
    const lM = el.length_m || 3.0;
    return count * 2 * (wM + hM) * lM; // 4 sides
  } else if (el.element_type === 'beam') {
    const wM = (el.width_mm || 0) / 1000;
    const hM = (el.height_mm || 0) / 1000;
    const lM = el.length_m || 5.0;
    return count * (2 * hM + wM) * lM; // 2 sides + bottom
  } else if (el.element_type === 'slab') {
    const lM = el.length_m || 5;
    const wM = el.width_m || 4;
    return count * lM * wM; // soffit only
  } else if (el.element_type === 'footing') {
    const lM = el.length_m || 1.2;
    const wM = el.width_m || 1.2;
    return count * 2 * (lM + wM); // perimeter only (top may not need formwork)
  }
  return 0;
}

function calculateRebarWeight(el) {
  const count = el.count || 1;

  if (el.element_type === 'column' || el.element_type === 'beam' || el.element_type === 'footing') {
    const dia = el.main_bar_dia_mm || 16;
    const barCount = el.main_bar_count || 4;
    const lM = el.length_m || el.span_length_m || 3.0;
    const totalLengthM = count * barCount * lM;
    return calcRebarWeight(dia, totalLengthM) || 0;
  } else if (el.element_type === 'slab') {
    // 2 directions, each with bar count = length / spacing
    const dia = el.bar_dia_mm || 10;
    const lM = el.length_m || 5;
    const wM = el.width_m || 4;
    const spacing = el.bar_spacing_mm || 200;
    const barsLong = Math.ceil(wM * 1000 / spacing);
    const barsShort = Math.ceil(lM * 1000 / spacing);
    const totalLengthM = count * (barsLong * lM + barsShort * wM);
    return calcRebarWeight(dia, totalLengthM) || 0;
  }
  return 0;
}

function updateFloorCounts(container) {
  floors.forEach(floor => {
    const countEl = container.querySelector(`[data-floor="${floor}"] .wz-floor-count`);
    if (countEl) {
      const count = (elementsByFloor[floor] || []).length;
      countEl.textContent = count > 0 ? ` (${count})` : '';
    }
  });
}

function scrollToElement(container, idx) {
  const cards = container.querySelectorAll('.wz-element-card');
  if (cards[idx]) cards[idx].scrollIntoView({ behavior: 'smooth' });
}

export function wz_saveManualElements() {
  const projectId = getCurrentProjectId();
  const { elements: existingElements, beamLibraryById: existingLibrary } = getProjectElements(projectId);

  const elements = [...existingElements];
  const beamLibraryById = { ...existingLibrary };

  // Flatten all elements from all floors
  Object.entries(elementsByFloor).forEach(([floor, floorElements]) => {
    floorElements.forEach((el, idx) => {
      const elementId = el.element_id || `${el.element_type.toUpperCase()}-${floor}-${idx}`;
      const libId = `lib-${elementId}`;

      // Create/update library entry
      beamLibraryById[libId] = createBeamLibraryEntry({
        id: libId,
        project_id: projectId,
        element_id: elementId,
        element_type: el.element_type,
        width_mm: el.width_mm || null,
        height_mm: el.height_mm || null,
        main_bar_count: el.main_bar_count || null,
        main_bar_dia_mm: el.main_bar_dia_mm || el.bar_dia_mm || 16,
        stirrup_dia_mm: el.stirrup_dia_mm || null,
        stirrup_spacing_mm: el.stirrup_spacing_mm || el.bar_spacing_mm || 200,
        steel_grade: el.steel_grade || 'SD40',
        concrete_grade: el.concrete_grade || 'M240',
        confidence_score: 1.0,
      });

      // Create drawing element
      elements.push(createDrawingElement({
        id: `elem-${elementId}`,
        project_id: projectId,
        beam_library_id: libId,
        floor_level: floor,
        element_id: elementId,
        element_type: el.element_type,
        count: el.count || 1,
        span_length_m: el.length_m || el.span_length_m || 3.0,
        floor_area_sqm: el.length_m && el.width_m ? el.length_m * el.width_m : null,
        confidence_score: 1.0,
        source: 'manual',
        user_verified: true,
      }));
    });
  });

  saveProjectElements(projectId, elements, beamLibraryById);
  alert('บันทึกสำเร็จ!');
  // Trigger next wizard step or close
  window.dispatchEvent(new CustomEvent('wz-manual-complete'));
}

if (typeof window !== 'undefined') {
  window.wz_renderManualDetailed = wz_renderManualDetailed;
  window.wz_saveManualElements = wz_saveManualElements;
}
