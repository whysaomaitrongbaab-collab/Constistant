// Overview — project dashboard (RAG status, KPIs, BOQ breakdown, schedule, element summary)
//
// อ่านข้อมูลที่คำนวณแล้ว (จากปุ่ม Calculate Project / js/shared/pipeline.js) ของโปรเจกต์ที่เลือกอยู่
// ถ้ายังไม่เคยกด Calculate Project และเป็นโปรเจกต์สาธิต จะ fallback ไปใช้ข้อมูลตัวอย่างจาก demo-seed.js
// ห้ามสร้าง object เอง — ใช้ข้อมูลจาก factory functions ใน schema.js เสมอ

import { getDemoProject } from '../shared/demo-seed.js';
import {
  getCurrentProjectId,
  getCurrentProject,
  DEMO_PROJECT_ID,
  projectStorageKey,
  getProjectElements,
  PROJECT_EVENT,
} from '../shared/project-store.js';
import { STORAGE_KEYS, PIPELINE_EVENT } from '../shared/pipeline.js';
import { groupTasksByMode } from '../shared/timeline-engine.js';

const ELEMENT_TYPES = ['column', 'beam', 'girder', 'slab', 'footing', 'staircase'];
const ELEMENT_LABEL = { column: 'เสา (Column)', beam: 'คาน (Beam)', girder: 'คานหลัก (Girder)', slab: 'พื้น (Slab)', footing: 'ฐานราก (Footing)', staircase: 'บันได (Staircase)' };
const WORK_CATEGORY_LABEL = { rebar: 'งานเหล็ก', concrete: 'งานคอนกรีต', formwork: 'งานแบบหล่อ' };
const WORK_CATEGORY_COLOR = { rebar: '#2563EB', concrete: '#16A34A', formwork: '#D97706', other: '#9333EA' };
const RAG_COLOR = { red: '#EF4444', yellow: '#F59E0B', green: '#22C55E', gray: '#94A3B8' };
const RAG_LABEL = { red: 'ไม่พร้อม', yellow: 'ต้องติดตาม', green: 'พร้อมดำเนินการ', gray: 'ยังไม่มีข้อมูล' };
const RISK_LABEL = { none: 'ความเสี่ยงต่ำ', low: 'ความเสี่ยงต่ำ', medium: 'ความเสี่ยงปานกลาง', high: 'ความเสี่ยงสูง' };
const RISK_COLOR = { none: '#22C55E', low: '#22C55E', medium: '#F59E0B', high: '#EF4444' };
const BUDGET_REASON_LABEL = {
  extended_schedule: 'ขยายระยะเวลา — เสี่ยงงานล่าช้าจากฝนเพิ่มขึ้น',
  compressed_schedule: 'อัดระยะเวลา — ต้องเพิ่มทีมงาน/ทำงานล่วงเวลา',
};

let charts = { boq: null, schedule: null };

// ─────────────────────────────────────────────
// Data loading (pipeline output -> demo-seed fallback -> empty)
// ─────────────────────────────────────────────

function loadFromStorage(baseKey) {
  try {
    const raw = localStorage.getItem(projectStorageKey(baseKey));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('[overview] failed to load', baseKey, e);
  }
  return null;
}

function loadBOQ(projectId) {
  const stored = loadFromStorage(STORAGE_KEYS.boq);
  if (stored) return stored;
  if (projectId === DEMO_PROJECT_ID) return Object.values(getDemoProject().boq_items);
  return [];
}

function loadSchedule(projectId) {
  const stored = loadFromStorage(STORAGE_KEYS.schedule);
  if (stored) return stored;
  if (projectId === DEMO_PROJECT_ID) return Object.values(getDemoProject().schedule_tasks);
  return [];
}

function loadReadiness(projectId) {
  const stored = loadFromStorage(STORAGE_KEYS.readiness);
  if (stored) return stored;
  if (projectId === DEMO_PROJECT_ID) return Object.values(getDemoProject().readiness_checks);
  return [];
}

function loadProjectConfig(projectId) {
  const stored = loadFromStorage(STORAGE_KEYS.projectConfig);
  if (stored) return stored;
  if (projectId === DEMO_PROJECT_ID) return getDemoProject().project_config;
  return null;
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
  return (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNum(n, digits = 2) {
  return (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function confidenceBadge(avgConfidence) {
  if (avgConfidence == null) return { label: '-', color: '#94A3B8' };
  if (avgConfidence >= 0.85) return { label: 'HIGH', color: '#22C55E' };
  if (avgConfidence >= 0.70) return { label: 'MED', color: '#F59E0B' };
  return { label: 'LOW', color: '#EF4444' };
}

// ─────────────────────────────────────────────
// Compute
// ─────────────────────────────────────────────

function computeOverallRag(readiness) {
  const counts = { red: 0, yellow: 0, green: 0 };
  readiness.forEach(c => { if (counts[c.status] != null) counts[c.status]++; });
  let overall = 'gray';
  if (readiness.length > 0) {
    overall = counts.red > 0 ? 'red' : counts.yellow > 0 ? 'yellow' : 'green';
  }
  return { overall, counts };
}

function computeKPIs(boq) {
  const sumBy = (cat) => boq.filter(b => b.work_category === cat).reduce((s, b) => s + (b.quantity || 0), 0);
  return {
    rebarKg: sumBy('rebar'),
    concreteM3: sumBy('concrete'),
    formworkM2: sumBy('formwork'),
    totalCost: boq.reduce((s, b) => s + (b.amount_thb || 0), 0),
  };
}

function computeBOQBreakdown(boq) {
  const totals = { rebar: 0, concrete: 0, formwork: 0, other: 0 };
  boq.forEach(b => {
    const key = totals[b.work_category] != null ? b.work_category : 'other';
    totals[key] += b.amount_thb || 0;
  });
  return totals;
}

function computeScheduleByFloor(schedule) {
  const byFloor = {};
  schedule.forEach(t => {
    const floor = t.floor_level || 'ไม่ระบุชั้น';
    byFloor[floor] = (byFloor[floor] || 0) + (t.adjusted_duration_days ?? t.base_duration_days ?? 0);
  });
  return byFloor;
}

function computeWorkBreakdown(schedule) {
  if (!schedule.length) return [];
  return groupTasksByMode(schedule, 'work_type').map(group => ({
    label: group.label,
    taskCount: group.tasks.length,
    totalDays: group.tasks.reduce((s, t) => s + (t.adjusted_duration_days ?? t.base_duration_days ?? 0), 0),
    totalCost: group.tasks.reduce((s, t) => s + (t.task_cost_estimate || 0), 0),
  }));
}

function computeElementSummary(elements, boq) {
  return ELEMENT_TYPES.map(type => {
    const els = elements.filter(e => e.element_type === type);
    if (els.length === 0) return null;

    const count = els.reduce((s, e) => s + (e.count || 0), 0);
    const avgConfidence = els.reduce((s, e) => s + (e.confidence_score ?? 0), 0) / els.length;

    const rebarKg = boq
      .filter(b => b.element_type === type && b.work_category === 'rebar')
      .reduce((s, b) => s + (b.quantity || 0), 0);
    const concreteM3 = boq
      .filter(b => b.element_type === type && b.work_category === 'concrete')
      .reduce((s, b) => s + (b.quantity || 0), 0);

    return { type, count, avgConfidence, rebarKg, concreteM3 };
  }).filter(Boolean);
}

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────

function render() {
  const root = document.getElementById('overview-app');
  if (!root) return;

  const project = getCurrentProject();
  const projectId = getCurrentProjectId();
  const { elements } = getProjectElements(projectId);
  const boq = loadBOQ(projectId);
  const schedule = loadSchedule(projectId);
  const readiness = loadReadiness(projectId);
  const projectConfig = loadProjectConfig(projectId);

  const rag = computeOverallRag(readiness);
  const kpis = computeKPIs(boq);
  const breakdown = computeBOQBreakdown(boq);
  const scheduleByFloor = computeScheduleByFloor(schedule);
  const elementSummary = computeElementSummary(elements, boq);
  const workBreakdown = computeWorkBreakdown(schedule);

  const ragColor = RAG_COLOR[rag.overall];
  const lastUpdated = readiness.reduce((latest, c) => {
    const t = c.checked_at || c.created_at;
    return t && (!latest || t > latest) ? t : latest;
  }, null);

  root.innerHTML = `
    <div class="fp-header">
      <h1>📊 Overview</h1>
      <p>${escapeHtml(project?.name || 'โปรเจกต์')} — ภาพรวมความพร้อม ปริมาณงาน และแผนงานก่อสร้าง</p>
    </div>

    <div class="ov-rag-card">
      <div class="ov-rag-badge" style="background:${ragColor}">${rag.overall === 'green' ? '✓' : rag.overall === 'gray' ? '–' : '!'}</div>
      <div class="ov-rag-text">
        <h2>สถานะความพร้อมโดยรวม: <span style="color:${ragColor}">${RAG_LABEL[rag.overall]}</span></h2>
        <p>🔴 ${rag.counts.red} ไม่พร้อม &nbsp;|&nbsp; 🟡 ${rag.counts.yellow} ต้องติดตาม &nbsp;|&nbsp; 🟢 ${rag.counts.green} พร้อม</p>
        <p>${lastUpdated ? `อัปเดตล่าสุด: ${new Date(lastUpdated).toLocaleString('th-TH')}` : 'ยังไม่มีข้อมูล Readiness Check — กด Calculate Project'}</p>
      </div>
    </div>

    <div class="ov-kpi-grid">
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">เหล็กเสริมรวม (kg)</div>
        <div class="ov-kpi-value">${formatNum(kpis.rebarKg, 1)}</div>
      </div>
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">คอนกรีตรวม (m³)</div>
        <div class="ov-kpi-value">${formatNum(kpis.concreteM3, 2)}</div>
      </div>
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">แบบหล่อรวม (m²)</div>
        <div class="ov-kpi-value">${formatNum(kpis.formworkM2, 2)}</div>
      </div>
      <div class="ov-kpi-card">
        <div class="ov-kpi-label">ประมาณการต้นทุน (฿)</div>
        <div class="ov-kpi-value">฿${formatTHB(kpis.totalCost)}</div>
      </div>
    </div>

    ${renderBudgetCard(projectConfig)}

    <div class="ov-charts-grid">
      <div class="ov-chart-card">
        <h2>สัดส่วนมูลค่า BOQ ตามประเภทงาน</h2>
        ${boq.length === 0 ? '<p class="fp-empty">ยังไม่มีข้อมูล BOQ — กด Calculate Project</p>' : '<canvas id="ov-boq-chart"></canvas>'}
      </div>
      <div class="ov-chart-card">
        <h2>ระยะเวลางานรวมตามชั้น (วัน)</h2>
        ${schedule.length === 0 ? '<p class="fp-empty">ยังไม่มีตารางงาน — กด Calculate Project</p>' : '<canvas id="ov-schedule-chart"></canvas>'}
      </div>
    </div>

    <div class="fp-card">
      <h2>สรุปจำนวน Element แยกตามประเภท</h2>
      ${elementSummary.length === 0 ? '<p class="fp-empty">ยังไม่มีข้อมูล Drawing Elements</p>' : `
      <table class="ov-table">
        <thead>
          <tr>
            <th>ประเภท</th>
            <th class="ov-num">จำนวน</th>
            <th class="ov-num">เหล็กรวม (kg)</th>
            <th class="ov-num">คอนกรีตรวม (m³)</th>
            <th class="ov-num">Confidence เฉลี่ย</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${elementSummary.map(renderElementRow).join('')}
        </tbody>
      </table>
      `}
    </div>

    <div class="fp-card">
      <h2>สรุปงานตามหมวดงาน (Work Breakdown)</h2>
      ${workBreakdown.length === 0 ? '<p class="fp-empty">ยังไม่มีแผนงาน — กด Calculate Project</p>' : `
      <table class="ov-table">
        <thead>
          <tr>
            <th>หมวดงาน</th>
            <th class="ov-num">จำนวนงาน</th>
            <th class="ov-num">ระยะเวลารวม (วัน)</th>
            <th class="ov-num">ประมาณการต้นทุน (฿)</th>
          </tr>
        </thead>
        <tbody>
          ${workBreakdown.map(row => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td class="ov-num">${row.taskCount}</td>
              <td class="ov-num">${formatNum(row.totalDays, 1)}</td>
              <td class="ov-num">฿${formatTHB(row.totalCost)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      `}
    </div>
  `;

  renderCharts(breakdown, scheduleByFloor);
}

// ผลกระทบต่องบประมาณจากไทม์ไลน์ (จาก project_config.budget_impact — อัปเดตเมื่อแก้วันที่ใน Planner)
function renderBudgetCard(config) {
  const bi = config?.budget_impact;
  if (!bi || bi.baseline_cost_estimate == null) return '';

  const delta = bi.delta_cost || 0;
  const deltaColor = delta > 0 ? '#EF4444' : delta < 0 ? '#22C55E' : '#64748B';
  const deltaSign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const risk = bi.risk_level || 'none';
  const reason = bi.delta_reason
    ? (BUDGET_REASON_LABEL[bi.delta_reason] || bi.delta_reason)
    : 'ตรงตามประมาณการฐาน';

  const metaBits = [];
  if (bi.extra_crew_needed) metaBits.push(`ต้องเพิ่มทีมงาน ~${bi.extra_crew_needed} ทีม`);
  if (bi.rain_risk_extra_days) metaBits.push(`เผื่อความเสี่ยงฝน ~${bi.rain_risk_extra_days} วัน`);
  const timeline = config.timeline || {};
  if (timeline.user_duration_days) {
    metaBits.push(`ระยะเวลาที่ใช้ ${timeline.user_duration_days} วัน (แนะนำ ${timeline.estimated_recommended_days ?? '-'} วัน)`);
  }

  return `
    <div class="fp-card">
      <h2>ผลกระทบต่องบประมาณจากไทม์ไลน์ (Budget Impact)</h2>
      <div class="ov-budget-grid">
        <div class="ov-budget-cell">
          <div class="ov-budget__label">ประมาณการฐาน (Baseline)</div>
          <div class="ov-budget__value">฿${formatTHB(bi.baseline_cost_estimate)}</div>
        </div>
        <div class="ov-budget-cell">
          <div class="ov-budget__label">ประมาณการปัจจุบัน</div>
          <div class="ov-budget__value">฿${formatTHB(bi.current_cost_estimate)}</div>
        </div>
        <div class="ov-budget-cell">
          <div class="ov-budget__label">ส่วนต่าง</div>
          <div class="ov-budget__value" style="color:${deltaColor}">${deltaSign}฿${formatTHB(Math.abs(delta))}</div>
        </div>
        <div class="ov-budget-cell">
          <div class="ov-budget__label">ระดับความเสี่ยง</div>
          <div><span class="ov-conf-badge" style="background:${RISK_COLOR[risk]}22;color:${RISK_COLOR[risk]}">${RISK_LABEL[risk] || risk}</span></div>
        </div>
      </div>
      <p class="ov-budget__reason">${escapeHtml(reason)}${metaBits.length ? ' · ' + escapeHtml(metaBits.join(' · ')) : ''}</p>
    </div>
  `;
}

function renderElementRow(row) {
  const badge = confidenceBadge(row.avgConfidence);
  return `
    <tr>
      <td>${ELEMENT_LABEL[row.type] || row.type}</td>
      <td class="ov-num">${row.count}</td>
      <td class="ov-num">${formatNum(row.rebarKg, 1)}</td>
      <td class="ov-num">${formatNum(row.concreteM3, 2)}</td>
      <td class="ov-num">${(row.avgConfidence * 100).toFixed(0)}%</td>
      <td><span class="ov-conf-badge" style="background:${badge.color}22;color:${badge.color}">${badge.label}</span></td>
    </tr>
  `;
}

function destroyCharts() {
  Object.keys(charts).forEach(key => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });
}

function renderCharts(breakdown, scheduleByFloor) {
  destroyCharts();
  if (typeof Chart === 'undefined') return;

  const boqCanvas = document.getElementById('ov-boq-chart');
  if (boqCanvas) {
    const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
    charts.boq = new Chart(boqCanvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => WORK_CATEGORY_LABEL[k] || 'อื่นๆ'),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map(([k]) => WORK_CATEGORY_COLOR[k] || WORK_CATEGORY_COLOR.other),
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ฿${formatTHB(ctx.raw)}` } },
        },
      },
    });
  }

  const scheduleCanvas = document.getElementById('ov-schedule-chart');
  if (scheduleCanvas) {
    const floors = Object.keys(scheduleByFloor).sort();
    charts.schedule = new Chart(scheduleCanvas, {
      type: 'bar',
      data: {
        labels: floors,
        datasets: [{
          label: 'ระยะเวลารวม (วัน)',
          data: floors.map(f => parseFloat(scheduleByFloor[f].toFixed(1))),
          backgroundColor: '#2563EB',
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      },
    });
  }
}

// ─────────────────────────────────────────────
// Wiring
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  render();
  // Chart.js ต้องการให้ canvas มองเห็นได้ (มีขนาด) ตอนสร้างกราฟ
  // re-render เมื่อผู้ใช้คลิกแท็บ Overview เพื่อให้กราฟวาดขนาดถูกต้อง
  document.querySelectorAll('.tab').forEach(tab => {
    if (tab.dataset.module === 'Overview') {
      tab.addEventListener('click', () => setTimeout(render, 0));
    }
  });
});

window.addEventListener(PIPELINE_EVENT, render);
window.addEventListener(PROJECT_EVENT, render);
