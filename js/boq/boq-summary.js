// BOQ Summary — standalone page reading boq_items (Tier 3, js/shared/schema.js)
//
// Data source priority:
//   1. Pipeline output for the current project (constistant_boq_items_v1__<projectId>,
//      written by "Calculate Project" — see js/shared/pipeline.js)
//   2. Demo data: getDemoDataByEngine('quantitake').expected_boq
//
// ห้ามสร้าง field ใหม่ใน boq_items — ใช้ตามที่ประกาศใน createBOQItem() (schema.js) เท่านั้น
// ยกเว้น `price_source` ซึ่งเป็น field ชั่วคราวสำหรับแสดงผลหน้านี้เท่านั้น (ไม่ persist กลับ)

import { getDemoDataByEngine, getDemoProject } from '../shared/demo-seed.js';
import {
  getCurrentProject,
  getCurrentProjectId,
  DEMO_PROJECT_ID,
  projectStorageKey,
  getProjectElements,
} from '../shared/project-store.js';
import { STORAGE_KEYS } from '../shared/pipeline.js';
import { loadMaterialPrices } from '../catalog/material-catalog.js';
import { exportToCSV, downloadCSV } from '../catalog/csv-utils.js';
import { exportBOQToHTML } from './boq-export.js';

const CSV_COLUMNS = [
  'item_code', 'description', 'work_category', 'unit', 'quantity',
  'unit_rate_thb', 'amount_thb', 'floor_level', 'element_type',
];

// หมวดงาน BOQ — หมวด 1 (โครงสร้าง) แบ่งย่อยตาม work_category, หมวด 2/3 เป็น placeholder
const CATEGORY_GROUPS = [
  {
    key: 'structural',
    label: 'หมวด 1: งานโครงสร้าง (Structural)',
    subgroups: [
      { key: 'concrete', label: 'คอนกรีต (Concrete)' },
      { key: 'rebar', label: 'เหล็กเสริม (Rebar)' },
      { key: 'formwork', label: 'แบบหล่อ (Formwork)' },
    ],
  },
  {
    key: 'architectural',
    label: 'หมวด 2: งานสถาปัตยกรรม (Architectural)',
    subgroups: [],
    placeholder: true,
  },
  {
    key: 'mep',
    label: 'หมวด 3: งานระบบ (MEP)',
    subgroups: [],
    placeholder: true,
  },
];

let boqItems = [];
let resourceItems = [];

// ─────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────

function loadFromStorage(baseKey) {
  try {
    const raw = localStorage.getItem(projectStorageKey(baseKey));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('[boq-summary] failed to load', baseKey, e);
  }
  return null;
}

function loadBOQItems(projectId) {
  const stored = loadFromStorage(STORAGE_KEYS.boq);
  if (stored) return stored;
  if (projectId === DEMO_PROJECT_ID) return getDemoDataByEngine('quantitake').expected_boq;
  return [];
}

function loadResourceItems(projectId) {
  const stored = loadFromStorage(STORAGE_KEYS.resources);
  if (stored) return stored;
  if (projectId === DEMO_PROJECT_ID) return Object.values(getDemoProject().resource_items);
  return [];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatTHB(n) {
  if (n === null || n === undefined) return null;
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNum(n, digits = 2) {
  if (n === null || n === undefined) return '-';
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function unitRateCell(item) {
  if (item.unit_rate_thb === null || item.unit_rate_thb === undefined) {
    return '<span class="boq-no-price">— ยังไม่ระบุราคา</span>';
  }
  const sourceTag = item.price_source === 'catalog' ? ' <span class="boq-source-tag">(catalog)</span>' : '';
  return `<span class="mc-mono">฿${formatTHB(item.unit_rate_thb)}</span>${sourceTag}`;
}

function amountCell(item) {
  if (item.amount_thb === null || item.amount_thb === undefined) {
    return '<span class="boq-no-price">— ยังไม่ระบุราคา</span>';
  }
  return `<span class="mc-mono">฿${formatTHB(item.amount_thb)}</span>`;
}

function confidenceBadge(avgConfidence) {
  if (avgConfidence == null) return { label: '-', color: '#94A3B8' };
  if (avgConfidence >= 0.85) return { label: 'HIGH', color: '#22C55E' };
  if (avgConfidence >= 0.70) return { label: 'MED', color: '#F59E0B' };
  return { label: 'LOW', color: '#EF4444' };
}

// ─────────────────────────────────────────────
// Integration: link BOQ items to material_prices catalog
// ─────────────────────────────────────────────

/**
 * Enrich boqItems with unit_rate_thb / amount_thb from the material price catalog
 * when the BOQ item itself has no price yet (unit_rate_thb is null).
 *
 * Match rule: boq.work_category === catalog.material_type AND boq.unit === catalog.unit
 * (latest price_date wins when multiple catalog rows match).
 *
 * Returns a new array — does not mutate the input. Adds a transient `price_source`
 * field ('catalog') on enriched rows for display only; not part of the boq_items schema.
 *
 * @param {Array<Object>} items - boq_items (schema.js Tier 3 shape)
 * @param {Array<Object>} catalogItems - material_prices rows
 * @returns {Array<Object>}
 */
export function linkCatalogPrices(items, catalogItems) {
  return items.map(item => {
    if (item.unit_rate_thb !== null && item.unit_rate_thb !== undefined) return { ...item };

    const matches = catalogItems.filter(c =>
      c.material_type === item.work_category && c.unit === item.unit && c.unit_price !== null
    );
    if (matches.length === 0) return { ...item };

    const best = matches.reduce((latest, c) =>
      (!latest || (c.price_date || '') > (latest.price_date || '')) ? c : latest, null);

    const unit_rate_thb = best.unit_price;
    const amount_thb = item.quantity != null ? item.quantity * unit_rate_thb : null;

    return { ...item, unit_rate_thb, amount_thb, price_source: 'catalog' };
  });
}

// ─────────────────────────────────────────────
// Compute
// ─────────────────────────────────────────────

function computeTotals(items) {
  const materialCost = items.reduce((sum, i) => sum + (i.amount_thb || 0), 0);
  const laborCost = resourceItems
    .filter(r => r.resource_type === 'manpower')
    .reduce((sum, r) => sum + (r.total_cost_thb || 0), 0);

  return {
    materialCost,
    laborCost,
    grandTotal: materialCost + laborCost,
    itemCount: items.length,
  };
}

function groupItems(items, total) {
  return CATEGORY_GROUPS.map(group => {
    if (group.placeholder) {
      return { ...group, rows: [], subtotal: 0, pct: 0 };
    }
    const subgroupData = group.subgroups.map(sub => {
      const rows = items.filter(i => i.work_category === sub.key);
      const subtotal = rows.reduce((sum, r) => sum + (r.amount_thb || 0), 0);
      return { ...sub, rows, subtotal, pct: total > 0 ? (subtotal / total) * 100 : 0 };
    });
    const subtotal = subgroupData.reduce((sum, s) => sum + s.subtotal, 0);
    return { ...group, subgroups: subgroupData, subtotal, pct: total > 0 ? (subtotal / total) * 100 : 0 };
  });
}

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────

function render() {
  const root = document.getElementById('boq-summary-app');
  if (!root) return;

  const project = getCurrentProject();
  const projectId = getCurrentProjectId();
  const { elements } = getProjectElements(projectId);

  const avgConfidence = elements.length > 0
    ? elements.reduce((s, e) => s + (e.confidence_score ?? 0), 0) / elements.length
    : null;
  const badge = confidenceBadge(avgConfidence);

  let drawingRef = '-';
  if (projectId === DEMO_PROJECT_ID) {
    const drawings = getDemoProject().drawings || {};
    drawingRef = drawings.floor_plan?.file_name || drawings.section?.file_name || '-';
  }

  const totals = computeTotals(boqItems);
  const groups = groupItems(boqItems, totals.materialCost);

  root.innerHTML = `
    <div class="fp-header">
      <h1>📋 BOQ Summary</h1>
      <p>${escapeHtml(project?.name || 'โปรเจกต์')}</p>
    </div>

    <div class="fp-card boq-project-header">
      <div class="boq-project-info">
        <div><span class="boq-label">โครงการ:</span> ${escapeHtml(project?.name || '-')}</div>
        <div><span class="boq-label">แบบอ้างอิง (Drawing Ref):</span> ${escapeHtml(drawingRef)}</div>
        <div><span class="boq-label">วันที่สร้างรายงาน:</span> ${new Date().toLocaleDateString('th-TH')}</div>
        <div><span class="boq-label">เจ้าของ/ผู้ติดต่อ:</span> ${escapeHtml(project?.client_name || '-')}</div>
      </div>
      <div class="ov-conf-badge" style="background:${badge.color}22;color:${badge.color};font-size:13px;padding:6px 14px;align-self:flex-start">
        Confidence: ${badge.label}${avgConfidence != null ? ` (${(avgConfidence * 100).toFixed(0)}%)` : ''}
      </div>
    </div>

    <div class="ov-kpi-grid">
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">Total Material Cost (THB)</div>
        <div class="ov-kpi-value mc-mono">฿${formatTHB(totals.materialCost)}</div>
      </div>
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">Total Labor Cost (THB)</div>
        <div class="ov-kpi-value mc-mono">${totals.laborCost > 0 ? `฿${formatTHB(totals.laborCost)}` : '-'}</div>
      </div>
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">Grand Total (THB)</div>
        <div class="ov-kpi-value mc-mono">฿${formatTHB(totals.grandTotal)}</div>
      </div>
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">Item Count</div>
        <div class="ov-kpi-value mc-mono">${totals.itemCount}</div>
      </div>
    </div>

    <div class="fp-card">
      <h2>สรุปต้นทุนแยกตามหมวดงาน</h2>
      ${boqItems.length === 0 ? '<p class="fp-empty">ยังไม่มีข้อมูล BOQ — กด Calculate Project ในหน้าหลัก</p>' : groups.map(renderGroup).join('')}
    </div>

    <div class="fp-card boq-export-controls">
      <h2>ส่งออก / เชื่อมต่อข้อมูล</h2>
      <div class="mc-toolbar-actions">
        <button class="fp-btn-primary" onclick="boqSummary.exportPDF()">🖨️ Export as PDF</button>
        <button class="fp-btn-secondary" onclick="boqSummary.exportCSV()">⬇️ Export as CSV</button>
        <a class="fp-btn-secondary" href="material-catalog.html" style="text-decoration:none;display:inline-flex;align-items:center">🔗 Link to Material Prices</a>
      </div>
    </div>
  `;
}

function renderGroup(group) {
  if (group.placeholder) {
    return `
      <div class="boq-group">
        <div class="boq-group-head">
          <h3>${escapeHtml(group.label)}</h3>
          <span class="fp-empty" style="padding:0">— ยังไม่มีข้อมูล (placeholder)</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="boq-group">
      <div class="boq-group-head">
        <h3>${escapeHtml(group.label)}</h3>
        <span class="mc-mono">฿${formatTHB(group.subtotal)} (${group.pct.toFixed(1)}%)</span>
      </div>
      ${group.subgroups.map(renderSubgroup).join('')}
    </div>
  `;
}

function renderSubgroup(sub) {
  if (sub.rows.length === 0) {
    return `
      <div class="boq-subgroup">
        <div class="boq-subgroup-head">${escapeHtml(sub.label)}</div>
        <p class="fp-empty">ไม่มีรายการ</p>
      </div>
    `;
  }

  return `
    <div class="boq-subgroup">
      <div class="boq-subgroup-head">${escapeHtml(sub.label)}</div>
      <table class="ov-table mc-table">
        <thead>
          <tr>
            <th>รหัส</th>
            <th>รายการ</th>
            <th>ชั้น</th>
            <th class="ov-num">ปริมาณ</th>
            <th>หน่วย</th>
            <th class="ov-num">ราคา/หน่วย</th>
            <th class="ov-num">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          ${sub.rows.map(item => `
            <tr>
              <td>${escapeHtml(item.item_code || '-')}</td>
              <td>${escapeHtml(item.description || '-')}</td>
              <td>${escapeHtml(item.floor_level || '-')}</td>
              <td class="ov-num mc-mono">${formatNum(item.quantity)}</td>
              <td class="mc-mono">${escapeHtml(item.unit || '-')}</td>
              <td class="ov-num">${unitRateCell(item)}</td>
              <td class="ov-num">${amountCell(item)}</td>
            </tr>
          `).join('')}
          <tr class="rh-total-row">
            <td colspan="6">รวม ${escapeHtml(sub.label)}</td>
            <td class="ov-num mc-mono">฿${formatTHB(sub.subtotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────
// Public API (window.boqSummary)
// ─────────────────────────────────────────────

async function init() {
  const projectId = getCurrentProjectId();
  boqItems = loadBOQItems(projectId);
  resourceItems = loadResourceItems(projectId);

  // ลองเชื่อมราคาจาก Material Catalog สำหรับรายการที่ยังไม่มีราคา
  try {
    const catalogItems = await loadMaterialPrices();
    boqItems = linkCatalogPrices(boqItems, catalogItems);
  } catch (e) {
    console.error('[boq-summary] failed to link catalog prices', e);
  }

  render();
}

function refresh() {
  return init();
}

function exportCSV() {
  const csv = exportToCSV(boqItems, CSV_COLUMNS);
  downloadCSV(csv, `boq_items_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportPDF() {
  exportBOQToHTML(getCurrentProjectId());
}

export const boqSummary = { init, refresh, exportCSV, exportPDF, linkCatalogPrices };
window.boqSummary = boqSummary;

document.addEventListener('DOMContentLoaded', init);
