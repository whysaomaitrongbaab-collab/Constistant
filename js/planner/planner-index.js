// Planner — construction schedule (Gantt-style task list)
//
// ทำงานแบบ standalone (localStorage) ก่อน ค่อยสลับไปต่อ Supabase ทีหลัง
// โครงสร้าง object ของแต่ละรายการ = createScheduleTask() จาก ../shared/schema.js
// ห้ามสร้าง object เองตรงๆ — ใช้ factory function เสมอ ตามกติกาของ schema.js

import { createScheduleTask, calcAdjustedDuration, createTimelineViewState, WORK_TYPE_HIERARCHY } from '../shared/schema.js';
import { getDemoDataByEngine, getDemoProject } from '../shared/demo-seed.js';
import { projectStorageKey, getCurrentProjectId, DEMO_PROJECT_ID, PROJECT_EVENT } from '../shared/project-store.js';
import { STORAGE_KEYS, PIPELINE_EVENT } from '../shared/pipeline.js';
import { groupTasksByMode, shiftDependents, calculateBudgetImpact, computeEVM } from '../shared/timeline-engine.js';

const STORAGE_KEY = STORAGE_KEYS.schedule;

const GROUPING_LABEL = {
  time: '📅 ตามช่วงเวลา',
  work_type: '🏗️ ตามหมวดงาน',
  resource: '👥 ตามทีมงาน',
};

let diffChip = null; // { text, timer } — transient banner after a reactive date edit

const WORK_CATEGORIES = [
  { value: 'structural', label: '🏗️ โครงสร้าง' },
  { value: 'architectural', label: '🏠 สถาปัตยกรรม' },
  { value: 'mep', label: '🔧 งานระบบ (MEP)' },
  { value: 'finishing', label: '🎨 งานตกแต่ง' },
];

const WORK_TYPE_COLORS = {
  foundation: '#92400e', structure: '#1d4ed8', roof: '#7c3aed',
  mep: '#0891b2', finishing: '#16a34a', other: '#64748b',
};

const WEATHER_RISK_LABEL = { none: 'ปกติ', low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง (ฤดูฝน)' };

let tasks = [];
let viewState = null;
let openDetailId = null; // task id ที่เปิด detail modal อยู่ (null = ปิด)

function perfColor(v) {
  if (v == null) return '#94a3b8';
  if (v >= 1) return '#10b981';
  if (v >= 0.9) return '#f59e0b';
  return '#ef4444';
}
function perfTone(v) {
  if (v == null) return '-';
  if (v >= 1) return 'ดีกว่าแผน';
  if (v >= 0.9) return 'เฝ้าระวัง';
  return 'ต่ำกว่าแผน';
}
function hexToRgba(hex, a) {
  const h = (hex || '#94a3b8').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function formatThaiDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(projectStorageKey(STORAGE_KEY));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('[planner] failed to load from localStorage', e);
  }
  return seedTasks();
}

// ค่าเริ่มต้น: เฉพาะโปรเจกต์สาธิต ดึงจาก demo-seed.js
// (โปรเจกต์ใหม่ที่ผู้ใช้สร้างเองเริ่มต้นแบบว่างเปล่า)
function seedTasks() {
  if (getCurrentProjectId() !== DEMO_PROJECT_ID) {
    saveTasks([]);
    return [];
  }
  const { expected_tasks } = getDemoDataByEngine('planner');
  const seed = expected_tasks.map(t => createScheduleTask({ ...t }));
  saveTasks(seed);
  return seed;
}

function saveTasks(list) {
  localStorage.setItem(projectStorageKey(STORAGE_KEY), JSON.stringify(list));
}

function loadViewState() {
  try {
    const raw = localStorage.getItem(projectStorageKey(STORAGE_KEYS.timelineViewState));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('[planner] failed to load timeline view state', e);
  }
  return createTimelineViewState({ id: crypto.randomUUID(), project_id: getCurrentProjectId(), grouping_mode: 'time' });
}

function saveViewState(state) {
  state.updated_at = new Date().toISOString();
  localStorage.setItem(projectStorageKey(STORAGE_KEYS.timelineViewState), JSON.stringify(state));
}

function loadProjectConfig() {
  try {
    const raw = localStorage.getItem(projectStorageKey(STORAGE_KEYS.projectConfig));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('[planner] failed to load project_config', e);
  }
  // โปรเจกต์สาธิต: ใช้ config จาก demo-seed (มี rainy_season_months/timeline สำหรับ overlay)
  if (getCurrentProjectId() === DEMO_PROJECT_ID) return getDemoProject().project_config;
  return null;
}

function saveProjectConfig(config) {
  localStorage.setItem(projectStorageKey(STORAGE_KEYS.projectConfig), JSON.stringify(config));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function categoryMeta(category) {
  return WORK_CATEGORIES.find(c => c.value === category) || { label: category || '-' };
}

function render() {
  const root = document.getElementById('planner-app');
  if (!root) return;

  const criticalCount = tasks.filter(t => t.is_critical || t.is_critical_path).length;
  const totalDays = tasks.reduce((sum, t) => sum + (t.adjusted_duration_days ?? t.base_duration_days ?? 0), 0);
  const projectConfig = loadProjectConfig();
  const groups = tasks.length ? groupTasksByMode(tasks, viewState.grouping_mode, projectConfig) : [];
  const evm = computeEVM(tasks);
  const projectEnd = tasks.reduce((m, t) => (t.end_date && (!m || t.end_date > m) ? t.end_date : m), null);
  const showEvm = evm && !evm.not_started;

  root.innerHTML = `
    <div class="fp-header">
      <h1>📅 Planner</h1>
      <p>ภาพรวมงานก่อสร้างสำหรับวิศวกรสนาม — คลิกที่แถบงานในไทม์ไลน์เพื่อดูรายละเอียด</p>
      <div class="fp-summary">
        <span class="fp-pill" style="background:#3b82f622;color:#3b82f6">📋 ${tasks.length} กิจกรรม</span>
        <span class="fp-pill" style="background:#ef444422;color:#ef4444">🔥 ${criticalCount} critical</span>
        <span class="fp-pill" style="background:#10b98122;color:#10b981">⏱️ รวม ${totalDays.toFixed(1)} วัน</span>
        ${projectEnd ? `<span class="fp-pill" style="background:#64748b22;color:#475569">🏁 เสร็จ ${formatThaiDate(projectEnd)}</span>` : ''}
        ${showEvm ? `
          <span class="fp-pill" style="background:${perfColor(evm.spi)}22;color:${perfColor(evm.spi)}" title="Schedule Performance Index — เทียบมูลค่างานที่ทำได้กับแผน">SPI ${evm.spi} · ${perfTone(evm.spi)}</span>
          <span class="fp-pill" style="background:${perfColor(evm.cpi)}22;color:${perfColor(evm.cpi)}" title="Cost Performance Index — เทียบมูลค่างานที่ทำได้กับเงินที่จ่ายจริง">CPI ${evm.cpi} · ${perfTone(evm.cpi)}</span>
        ` : ''}
      </div>
      ${showEvm ? `
      <div class="pl-progress-overall" title="ความคืบหน้าโครงการตามมูลค่างาน (Earned Value)">
        <div class="pl-progress-overall__head"><span>ความคืบหน้าโครงการ (ตามมูลค่างาน)</span><strong>${evm.percent_complete}%</strong></div>
        <div class="pl-progress-overall__bar"><span style="width:${Math.min(100, evm.percent_complete)}%"></span></div>
      </div>` : ''}
    </div>

    ${diffChip ? `<div class="pl-diff-chip">${escapeHtml(diffChip)}</div>` : ''}

    ${tasks.length === 0 ? `
    <div class="fp-card"><p class="fp-empty">ยังไม่มีกิจกรรม — เพิ่มกิจกรรมด้านล่าง หรือกด "Calculate Project" เพื่อให้ระบบสร้างแผนงานจากแบบก่อสร้าง</p></div>` : `
    <div class="fp-card">
      <h2>📊 ไทม์ไลน์งาน (Gantt) — คลิกที่แถบงานเพื่อดูรายละเอียด</h2>
      ${renderGantt(tasks, projectConfig)}
      ${renderGanttLegend(projectConfig)}
    </div>

    <div class="fp-card">
      <div class="pl-card-header">
        <h2>ตารางงาน (แก้ไขรายละเอียด)</h2>
        <div class="pl-grouping-toggle">
          ${Object.entries(GROUPING_LABEL).map(([mode, label]) => `
            <button type="button" class="fp-btn-secondary pl-grouping-btn${viewState.grouping_mode === mode ? ' pl-grouping-btn--active' : ''}" onclick="pl_setGrouping('${mode}')">${label}</button>
          `).join('')}
        </div>
      </div>
      ${groups.map(renderGroupTable).join('')}
    </div>`}

    <div class="fp-card">
      <h2>เพิ่มกิจกรรม</h2>
      <div class="fp-form-grid">
        <label>WBS Code
          <input type="text" id="pl-input-wbs" placeholder="เช่น 2.1.1" />
        </label>
        <label>ชื่อกิจกรรม
          <input type="text" id="pl-input-name" placeholder="เช่น Column Rebar — F1" />
        </label>
        <label>หมวดงาน
          <select id="pl-input-category">
            ${WORK_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
        </label>
        <label>ชั้น
          <input type="text" id="pl-input-floor" placeholder="F1, F2, ..." />
        </label>
        <label>วันที่เริ่ม
          <input type="date" id="pl-input-start" />
        </label>
        <label>วันที่สิ้นสุด
          <input type="date" id="pl-input-end" />
        </label>
        <label>จำนวนคนงาน (crew)
          <input type="number" id="pl-input-crew" min="0" step="1" placeholder="0" />
        </label>
        <label>Productivity (หน่วย/คน/วัน)
          <input type="number" id="pl-input-productivity" min="0" step="any" placeholder="0" />
        </label>
        <label>ปริมาณงาน
          <input type="number" id="pl-input-quantity" min="0" step="any" placeholder="0" />
        </label>
        <label>Weather buffer (0-0.4)
          <input type="number" id="pl-input-weather" min="0" max="0.4" step="0.05" value="0.10" />
        </label>
        <label>Critical path?
          <select id="pl-input-critical">
            <option value="false">ไม่ใช่</option>
            <option value="true">ใช่ — critical</option>
          </select>
        </label>
      </div>
      <button class="fp-btn-primary" onclick="pl_addTask()">+ เพิ่มกิจกรรม</button>
    </div>

    ${openDetailId ? renderDetailModal(tasks.find(t => t.id === openDetailId)) : ''}
  `;
}

/**
 * วาด Gantt timeline แบบ pure SVG (ไม่ใช้ chart library) — แท่งงานเรียงตาม tasks order
 * แสดง overlay สีแดงโปร่งสำหรับเดือนที่อยู่ในฤดูฝน (rainy_season_months) และเส้นประสีฟ้าแสดง "วันนี้"
 * แท่งงานที่ weather_risk='high' จะมีลายทางทับซ้อน; งาน critical path มีเส้นขอบสีแดง
 */
function renderGanttSVG(tasks, projectConfig) {
  const timeline = projectConfig?.timeline;
  const withDates = tasks.filter(t => t.start_date && t.end_date);
  if (!withDates.length) return null;

  const starts = withDates.map(t => +new Date(t.start_date));
  const ends = withDates.map(t => +new Date(t.end_date));
  // ปรับขอบเวลาให้พอดีกับช่วงงานจริง (อ่านแท่งง่าย) — ไม่ยืดไปถึง user_end_date ที่อาจห่างมาก
  let min = Math.min(...starts);
  let max = Math.max(...ends);
  // เผื่อขอบ 2 วันซ้าย-ขวา เพื่อไม่ให้แท่งงานชนขอบ
  min -= 2 * 86400000;
  max += 2 * 86400000;
  const span = Math.max(max - min, 86400000);
  const pct = (ms) => ((ms - min) / span) * 100;

  return { min, max, span, pct, rainyMonths: timeline?.rainy_season_months || [], withDates };
}

/**
 * Gantt timeline แบบ HTML (อ่านง่าย, มีคอลัมน์ชื่องาน + แกนเวลา + แถบ % เสร็จ + คลิกดูรายละเอียด)
 * - แถบงานยาวตามช่วงวันที่จริง, สีตาม work_type, ส่วนที่ทำเสร็จเป็นสีเข้ม (percent_complete)
 * - critical path = เส้นขอบแดง, weather_risk='high' = ลายทางฝน
 * - overlay: แถบฤดูฝน + เส้น "วันนี้" ลากตลอดความสูง (วาดซ้ำในแต่ละ lane ให้ต่อเนื่อง)
 */
function renderGantt(tasks, projectConfig) {
  const model = renderGanttSVG(tasks, projectConfig);
  if (!model) return '<p class="fp-empty">ไม่มีกิจกรรมที่มีวันที่กำหนด</p>';
  const { min, max, pct, rainyMonths } = model;
  const sorted = [...model.withDates].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

  // แกนเวลา (ป้ายเดือน)
  const ticks = [];
  const cursor = new Date(min);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (+cursor <= max) {
    const left = pct(+cursor);
    if (left >= -2 && left <= 100) {
      ticks.push(`<div class="gantt2__tick" style="left:${left.toFixed(2)}%">${cursor.toLocaleDateString('th-TH', { month: 'short' })}</div>`);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // overlay: แถบฤดูฝน + เส้นวันนี้ (วาดในทุก lane → ต่อเนื่องเป็นเส้นแนวตั้ง)
  const bands = [];
  if (rainyMonths.length) {
    const m = new Date(min);
    m.setDate(1);
    m.setHours(0, 0, 0, 0);
    while (+m <= max) {
      if (rainyMonths.includes(m.getMonth() + 1)) {
        const mStart = new Date(m.getFullYear(), m.getMonth(), 1);
        const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        const l = Math.max(0, pct(+mStart));
        const r = Math.min(100, pct(+mEnd));
        if (r > l) bands.push(`<div class="gantt2__band" style="left:${l.toFixed(2)}%;width:${(r - l).toFixed(2)}%"></div>`);
      }
      m.setMonth(m.getMonth() + 1);
    }
  }
  const todayPct = pct(Date.now());
  const todayLine = todayPct >= 0 && todayPct <= 100 ? `<div class="gantt2__today" style="left:${todayPct.toFixed(2)}%"></div>` : '';
  const overlay = `${bands.join('')}${todayLine}`;

  const rows = sorted.map(t => {
    const l = Math.max(0, pct(+new Date(t.start_date)));
    const r = Math.min(100, pct(+new Date(t.end_date)));
    const w = Math.max(0.8, r - l);
    const color = WORK_TYPE_COLORS[t.work_type] || '#94a3b8';
    const critical = t.is_critical || t.is_critical_path;
    const rain = t.weather_risk === 'high';
    const pctDone = Math.max(0, Math.min(100, t.percent_complete || 0));
    const icons = `${critical ? '🔥' : ''}${rain ? '🌧️' : ''}`;
    return `
      <div class="gantt2__row" onclick="pl_showDetail('${t.id}')" title="${escapeHtml(t.activity_name)} — คลิกดูรายละเอียด">
        <div class="gantt2__rowlabel">
          <span class="gantt2__wbs">${escapeHtml(t.wbs_code || '')}</span>
          <span class="gantt2__name">${escapeHtml(t.activity_name)}</span>
          ${icons ? `<span class="gantt2__icons">${icons}</span>` : ''}
        </div>
        <div class="gantt2__lane">
          ${overlay}
          <div class="gantt2__bar${critical ? ' gantt2__bar--critical' : ''}${rain ? ' gantt2__bar--rain' : ''}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%;background:${hexToRgba(color, 0.28)}">
            <div class="gantt2__bar-fill" style="width:${pctDone}%;background:${color}"></div>
            <span class="gantt2__bar-pct">${pctDone > 0 ? pctDone + '%' : ''}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="gantt2">
      <div class="gantt2__axis-row">
        <div class="gantt2__corner">กิจกรรม</div>
        <div class="gantt2__axis">${ticks.join('')}</div>
      </div>
      <div class="gantt2__rows">${rows}</div>
    </div>`;
}

/**
 * รายละเอียดงาน (modal) เมื่อคลิกแถบใน Gantt — สรุปทุกฟิลด์ที่วิศวกรสนามต้องดู
 */
function renderDetailModal(task) {
  if (!task) return '';
  const dur = task.adjusted_duration_days ?? task.base_duration_days ?? 0;
  const base = task.base_duration_days ?? dur;
  const buffer = Math.max(0, (task.adjusted_duration_days ?? base) - base);
  const pctDone = Math.max(0, Math.min(100, task.percent_complete || 0));
  const est = task.task_cost_estimate;
  const act = task.task_cost_actual;
  const fmtTHB = (n) => `฿${Math.round(n).toLocaleString('th-TH')}`;

  const rows = [
    ['WBS', task.wbs_code || '-'],
    ['หมวดงาน', categoryMeta(task.work_category).label],
    ['ชั้น', task.floor_level || '-'],
    ['วันที่เริ่ม', formatThaiDate(task.start_date)],
    ['วันที่สิ้นสุด', formatThaiDate(task.end_date)],
    ['ระยะเวลา', dur ? `${dur.toFixed(1)} วัน` : '-'],
    ['เผื่ออากาศ', buffer > 0.04 ? `+${buffer.toFixed(1)} วัน` : '—'],
    ['ความเสี่ยงอากาศ', WEATHER_RISK_LABEL[task.weather_risk] || task.weather_risk || '-'],
    ['ทีมงาน (crew)', task.crew_size ?? '-'],
    ['Productivity', task.productivity_rate != null ? `${task.productivity_rate} หน่วย/คน/วัน` : '-'],
    ['ปริมาณงาน', task.quantity != null ? `${task.quantity} ${task.unit || ''}`.trim() : '-'],
    ['ต้นทุนประมาณ', est != null ? fmtTHB(est) : '-'],
    ['ต้นทุนจริง', act != null ? fmtTHB(act) : 'ยังไม่ระบุ'],
    ['สั่งวัสดุภายใน', formatThaiDate(task.material_order_date)],
    ['Critical path', critical(task) ? '🔥 ใช่' : 'ไม่'],
  ];

  return `
    <div class="modal-overlay" onclick="if(event.target===this)pl_closeDetail()">
      <div class="modal-card pl-detail">
        <div class="pl-detail__head">
          <div>
            <div class="rc-item-type">${categoryMeta(task.work_category).label}</div>
            <h2>${escapeHtml(task.activity_name)}</h2>
          </div>
          <button class="rh-delete" onclick="pl_closeDetail()" title="ปิด">✕</button>
        </div>
        <div class="pl-detail__progress">
          <div class="pl-progress-overall__head"><span>ความคืบหน้า</span><strong>${pctDone}%</strong></div>
          <div class="pl-progress-overall__bar"><span style="width:${pctDone}%"></span></div>
        </div>
        <div class="pl-detail__grid">
          ${rows.map(([k, v]) => `<div class="pl-detail__cell"><span class="pl-detail__k">${k}</span><span class="pl-detail__v">${escapeHtml(String(v))}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function critical(task) {
  return !!(task.is_critical || task.is_critical_path);
}

function renderGanttLegend(projectConfig) {
  const workTypeSwatches = Object.entries(WORK_TYPE_HIERARCHY).map(([key, def]) => `
    <span class="fp-gantt__legend-item"><span class="fp-gantt__swatch" style="background:${WORK_TYPE_COLORS[key] || '#94a3b8'}"></span>${escapeHtml(def.label_th)}</span>
  `).join('');
  const doneSwatch = `<span class="fp-gantt__legend-item"><span class="fp-gantt__swatch" style="background:linear-gradient(90deg,#1d4ed8 60%,${hexToRgba('#1d4ed8', 0.28)} 60%)"></span>เนื้องานที่ทำเสร็จ (เข้ม)</span>`;
  const criticalSwatch = `<span class="fp-gantt__legend-item"><span class="fp-gantt__swatch" style="background:transparent;outline:2px solid #ef4444;outline-offset:-2px"></span>Critical path 🔥</span>`;
  const rainySwatch = `<span class="fp-gantt__legend-item"><span class="fp-gantt__swatch" style="background:#ef4444;opacity:0.3"></span>ช่วงฤดูฝน 🌧️</span>`;
  const todaySwatch = `<span class="fp-gantt__legend-item"><span class="fp-gantt__swatch fp-gantt__swatch--line" style="border-color:#3b82f6"></span>วันนี้</span>`;
  return `<div class="fp-gantt__legend">${workTypeSwatches}${doneSwatch}${criticalSwatch}${rainySwatch}${todaySwatch}</div>`;
}

function renderGroupTable(group) {
  const sorted = [...group.tasks].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  return `
    <div class="pl-group">
      <h3 class="pl-group__title">${escapeHtml(group.label)} <span class="pl-group__count">(${group.tasks.length})</span></h3>
      <table class="rh-table">
        <thead>
          <tr>
            <th>WBS</th>
            <th>กิจกรรม</th>
            <th>ชั้น</th>
            <th>เริ่ม</th>
            <th>สิ้นสุด</th>
            <th class="rh-num">ระยะเวลา (วัน)</th>
            <th class="rh-num">เผื่ออากาศ</th>
            <th class="rh-num">Crew</th>
            <th class="rh-num">% เสร็จ</th>
            <th class="rh-num">ใช้จริง (฿)</th>
            <th>Critical</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(renderTaskRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTaskRow(task) {
  const duration = task.adjusted_duration_days ?? task.base_duration_days ?? 0;
  const base = task.base_duration_days ?? duration;
  const bufferDays = Math.max(0, (task.adjusted_duration_days ?? base) - base);
  const isRainy = task.weather_risk === 'high';
  const bufferCell = bufferDays > 0.04
    ? `${isRainy ? '🌧️ ' : ''}+${bufferDays.toFixed(1)}`
    : '—';
  const pct = Math.max(0, Math.min(100, task.percent_complete || 0));
  const estCost = task.task_cost_estimate;
  const actualPlaceholder = estCost != null ? Math.round(estCost).toLocaleString('en-US') : 'ใช้จริง';
  return `
    <tr>
      <td>${escapeHtml(task.wbs_code)}</td>
      <td>
        ${escapeHtml(task.activity_name)}
        <div class="rc-item-type">${categoryMeta(task.work_category).label}</div>
      </td>
      <td>${escapeHtml(task.floor_level || '-')}</td>
      <td><input type="date" class="wz-input wz-input--narrow" value="${task.start_date || ''}" onchange="pl_updateTaskDate('${task.id}','start_date',this.value)"></td>
      <td><input type="date" class="wz-input wz-input--narrow" value="${task.end_date || ''}" onchange="pl_updateTaskDate('${task.id}','end_date',this.value)"></td>
      <td class="rh-num">${duration ? duration.toFixed(1) : '-'}</td>
      <td class="rh-num"${isRainy ? ' style="color:#d97706;font-weight:600"' : ''} title="วันที่เผื่อไว้สำหรับสภาพอากาศ (adjusted − base)">${bufferCell}</td>
      <td class="rh-num">${task.crew_size ?? '-'}</td>
      <td class="rh-num">
        <div class="pl-progress" title="${pct}% เสร็จ">
          <input type="number" class="pl-mini" min="0" max="100" step="5" value="${pct}" onchange="pl_updateProgress('${task.id}', this.value)">
          <div class="pl-progress__bar"><span style="width:${pct}%"></span></div>
        </div>
      </td>
      <td class="rh-num"><input type="number" class="pl-mini" min="0" step="any" value="${task.task_cost_actual ?? ''}" placeholder="${actualPlaceholder}" title="ค่าใช้จ่ายจริง — เว้นว่างถ้ายังไม่ทราบ" onchange="pl_updateActualCost('${task.id}', this.value)"></td>
      <td>${(task.is_critical || task.is_critical_path) ? '🔥 Critical' : '-'}</td>
      <td><button class="rh-delete" onclick="pl_deleteTask('${task.id}')" title="ลบกิจกรรม">✕</button></td>
    </tr>
  `;
}

export function pl_addTask() {
  const nameInput = document.getElementById('pl-input-name');
  const activityName = nameInput.value.trim();
  if (!activityName) {
    alert('กรุณากรอกชื่อกิจกรรม');
    return;
  }

  const crewSize = parseFloat(document.getElementById('pl-input-crew').value) || null;
  const productivity = parseFloat(document.getElementById('pl-input-productivity').value) || null;
  const quantity = parseFloat(document.getElementById('pl-input-quantity').value) || null;
  const weatherBuffer = parseFloat(document.getElementById('pl-input-weather').value) || 0;
  const startDate = document.getElementById('pl-input-start').value || null;

  let baseDuration = null;
  if (quantity && crewSize && productivity) {
    baseDuration = parseFloat((quantity / (crewSize * productivity)).toFixed(1));
  }

  const month = startDate ? new Date(startDate).getMonth() + 1 : null;
  const adjustedDuration = baseDuration != null && month != null
    ? calcAdjustedDuration(baseDuration, month)
    : baseDuration;

  const task = createScheduleTask({
    id: crypto.randomUUID(),
    wbs_code: document.getElementById('pl-input-wbs').value.trim(),
    activity_name: activityName,
    work_category: document.getElementById('pl-input-category').value,
    floor_level: document.getElementById('pl-input-floor').value.trim() || null,
    quantity,
    crew_size: crewSize,
    productivity_rate: productivity,
    base_duration_days: baseDuration,
    weather_buffer_factor: weatherBuffer,
    adjusted_duration_days: adjustedDuration,
    start_date: startDate,
    end_date: document.getElementById('pl-input-end').value || null,
    is_critical: document.getElementById('pl-input-critical').value === 'true',
    created_at: new Date().toISOString(),
  });

  tasks.push(task);
  saveTasks(tasks);
  render();
}

export function pl_deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks(tasks);
  render();
}

export function pl_setGrouping(mode) {
  viewState.grouping_mode = mode;
  saveViewState(viewState);
  render();
}

/**
 * อัปเดต % งานที่เสร็จจริงของ task (ขับเคลื่อน Earned Value บน Overview)
 * บันทึกแล้ว broadcast PIPELINE_EVENT reason 'progress-changed' ให้ Overview re-render S-curve/SPI/CPI
 */
export function pl_updateProgress(id, value) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.percent_complete = Math.max(0, Math.min(100, parseFloat(value) || 0));
  saveTasks(tasks);
  broadcastProgress();
  render();
}

/**
 * อัปเดตค่าใช้จ่ายจริงของ task (ขับเคลื่อน CPI / Actual Cost บน Overview)
 * เว้นว่าง = ยังไม่ทราบ → EVM จะถือ AC = EV สำหรับ task นั้น (CPI ไม่เพี้ยน)
 */
export function pl_updateActualCost(id, value) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const num = parseFloat(value);
  task.task_cost_actual = (value === '' || Number.isNaN(num)) ? null : num;
  saveTasks(tasks);
  broadcastProgress();
  render();
}

function broadcastProgress() {
  window.dispatchEvent(new CustomEvent(PIPELINE_EVENT, {
    detail: { schedule: tasks, reason: 'progress-changed' },
  }));
}

// เปิด/ปิด modal รายละเอียดงาน (คลิกจากแถบ Gantt)
export function pl_showDetail(id) {
  openDetailId = id;
  render();
}

export function pl_closeDetail() {
  openDetailId = null;
  render();
}

/**
 * แก้ไขวันที่ของ task แบบ reactive — เลื่อน dependent ทุกตัวตาม (shiftDependents)
 * คำนวณ budget impact ใหม่จาก project_config.timeline (ถ้ามี) แล้ว broadcast PIPELINE_EVENT
 * reason: 'schedule-changed' ให้ Overview/Resource Hub/Readiness re-render จากข้อมูลล่าสุด
 */
export function pl_updateTaskDate(id, field, value) {
  if (!value) return;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const changedTask = { ...task, [field]: value };
  if (field === 'start_date' && task.start_date && task.end_date) {
    const durationMs = new Date(task.end_date) - new Date(task.start_date);
    changedTask.end_date = new Date(new Date(value).getTime() + Math.max(durationMs, 0)).toISOString().slice(0, 10);
  }

  const before = new Map(tasks.map(t => [t.id, t.start_date]));
  tasks = shiftDependents(changedTask, tasks);
  saveTasks(tasks);

  const shifted = tasks.filter(t => before.get(t.id) !== t.start_date && t.id !== id);
  const budgetImpact = recalcBudgetImpact();
  showDiffChip(task, shifted, budgetImpact);

  window.dispatchEvent(new CustomEvent(PIPELINE_EVENT, {
    detail: { schedule: tasks, budget_impact: budgetImpact, reason: 'schedule-changed' },
  }));

  render();
}

function recalcBudgetImpact() {
  const config = loadProjectConfig();
  if (!config?.timeline?.estimated_recommended_days || !tasks.length) return null;

  const starts = tasks.map(t => t.start_date).filter(Boolean).sort();
  const ends = tasks.map(t => t.end_date).filter(Boolean).sort();
  if (!starts.length || !ends.length) return null;

  const overallStart = starts[0];
  const overallEnd = ends[ends.length - 1];
  const budgetImpact = calculateBudgetImpact(config.timeline, overallStart, overallEnd);

  config.timeline.user_start_date = overallStart;
  config.timeline.user_end_date = overallEnd;
  config.timeline.user_duration_days = Math.max(1, Math.round((new Date(overallEnd) - new Date(overallStart)) / 86400000));
  config.budget_impact = budgetImpact;
  saveProjectConfig(config);

  return budgetImpact;
}

function showDiffChip(changedTask, shifted, budgetImpact) {
  let text = `🔄 อัปเดต "${changedTask.activity_name}"`;
  if (shifted.length) text += ` — เลื่อนงานที่เกี่ยวข้อง ${shifted.length} รายการ`;
  if (budgetImpact?.delta_cost) {
    const sign = budgetImpact.delta_cost > 0 ? '+' : '';
    text += ` · งบเปลี่ยน ${sign}${budgetImpact.delta_cost.toLocaleString('th-TH')} บาท`;
  }
  diffChip = text;
  render();
  clearTimeout(showDiffChip._timer);
  showDiffChip._timer = setTimeout(() => { diffChip = null; render(); }, 5000);
}

// expose ให้ inline onclick="" ใน HTML เรียกได้
window.pl_addTask = pl_addTask;
window.pl_deleteTask = pl_deleteTask;
window.pl_setGrouping = pl_setGrouping;
window.pl_updateTaskDate = pl_updateTaskDate;
window.pl_updateProgress = pl_updateProgress;
window.pl_updateActualCost = pl_updateActualCost;
window.pl_showDetail = pl_showDetail;
window.pl_closeDetail = pl_closeDetail;

document.addEventListener('DOMContentLoaded', () => {
  tasks = loadTasks();
  viewState = loadViewState();
  render();
});

// เมื่อ pipeline (ปุ่ม Calculate Project) คำนวณเสร็จ ให้โหลดผลลัพธ์ใหม่จาก localStorage มาแสดง
window.addEventListener('constistant:pipeline-updated', (e) => {
  tasks = e.detail?.schedule ?? loadTasks();
  render();
});

// เมื่อสลับโปรเจกต์ ให้โหลด/seed ข้อมูลของโปรเจกต์ที่เลือกใหม่
window.addEventListener(PROJECT_EVENT, () => {
  tasks = loadTasks();
  viewState = loadViewState();
  render();
});
