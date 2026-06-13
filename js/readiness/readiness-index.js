// Readiness Check — RAG checklist for construction readiness
//
// ทำงานแบบ standalone (localStorage) ก่อน ค่อยสลับไปต่อ Supabase ทีหลัง
// โครงสร้าง object ของแต่ละรายการ = createReadinessCheck() จาก ../shared/schema.js
// ห้ามสร้าง object เองตรงๆ — ใช้ factory function เสมอ ตามกติกาของ schema.js

import { createReadinessCheck } from '../shared/schema.js';
import { getDemoDataByEngine } from '../shared/demo-seed.js';
import { projectStorageKey, getCurrentProjectId, DEMO_PROJECT_ID, PROJECT_EVENT } from '../shared/project-store.js';

const STORAGE_KEY = 'constistant_readiness_checks_v1';

const CHECK_TYPES = [
  { value: 'permit', label: 'ใบอนุญาตก่อสร้าง' },
  { value: 'setback', label: 'ระยะร่นอาคาร' },
  { value: 'drawing_complete', label: 'แบบแปลนครบถ้วน' },
  { value: 'bbs_ready', label: 'BBS พร้อมก่อนเริ่มงานเหล็ก' },
  { value: 'material_lead', label: 'ระยะเวลาสั่งวัสดุ' },
  { value: 'crew_available', label: 'ความพร้อมแรงงาน' },
  { value: 'weather_risk', label: 'ความเสี่ยงสภาพอากาศ' },
  { value: 'other', label: 'อื่นๆ' },
];

// ลิงก์ไปแท็บที่แก้ไขรายการได้จริง ตามประเภทการตรวจสอบ (cross-tab action)
const CHECK_NAV = {
  drawing_complete: { module: 'Drawing Intelligence', label: 'ตรวจแบบใน Drawing Intelligence' },
  bbs_ready:        { module: 'BBS', label: 'ดูตารางตัดเหล็ก (BBS)' },
  material_lead:    { module: 'Resource Hub', label: 'จัดการวัสดุใน Resource Hub' },
  crew_available:   { module: 'Resource Hub', label: 'จัดการแรงงานใน Resource Hub' },
  weather_risk:     { module: 'Planner', label: 'ปรับแผนงานใน Planner' },
  weather_overlap:  { module: 'Planner', label: 'ปรับแผนงานใน Planner' },
  timeline_risk:    { module: 'Planner', label: 'ปรับแผนงานใน Planner' },
};

// red -> yellow -> green -> red เมื่อคลิกที่ status badge
const STATUS_ORDER = ['red', 'yellow', 'green'];
const STATUS_LABEL = { red: 'ไม่พร้อม', yellow: 'ต้องติดตาม', green: 'พร้อม' };
const STATUS_ICON = { red: '🔴', yellow: '🟡', green: '🟢' };
const STATUS_COLOR = { red: '#ef4444', yellow: '#f59e0b', green: '#10b981' };

let checks = [];

function loadChecks() {
  try {
    const raw = localStorage.getItem(projectStorageKey(STORAGE_KEY));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('[readiness] failed to load from localStorage', e);
  }
  return seedChecks();
}

// ค่าเริ่มต้น: เฉพาะโปรเจกต์สาธิต ดึงจาก demo-seed.js
// (โปรเจกต์ใหม่ที่ผู้ใช้สร้างเองเริ่มต้นแบบว่างเปล่า)
function seedChecks() {
  if (getCurrentProjectId() !== DEMO_PROJECT_ID) {
    saveChecks([]);
    return [];
  }
  const { expected_checks } = getDemoDataByEngine('readiness');
  const seed = expected_checks.map(c => createReadinessCheck({ ...c }));
  saveChecks(seed);
  return seed;
}

function saveChecks(list) {
  localStorage.setItem(projectStorageKey(STORAGE_KEY), JSON.stringify(list));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function render() {
  const root = document.getElementById('readiness-app');
  if (!root) return;

  const counts = { red: 0, yellow: 0, green: 0 };
  checks.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });

  root.innerHTML = `
    <div class="fp-header">
      <h1>✅ Readiness Check</h1>
      <p>ตรวจสอบความพร้อมงานก่อสร้าง — คลิกที่สถานะของแต่ละรายการเพื่อเปลี่ยน 🔴 → 🟡 → 🟢</p>
      <div class="fp-summary">
        <span class="fp-pill" style="background:${STATUS_COLOR.red}22;color:${STATUS_COLOR.red}">🔴 ${counts.red} ไม่พร้อม</span>
        <span class="fp-pill" style="background:${STATUS_COLOR.yellow}22;color:${STATUS_COLOR.yellow}">🟡 ${counts.yellow} ต้องติดตาม</span>
        <span class="fp-pill" style="background:${STATUS_COLOR.green}22;color:${STATUS_COLOR.green}">🟢 ${counts.green} พร้อม</span>
      </div>
    </div>

    <div class="fp-card">
      <h2>เพิ่มรายการตรวจสอบ</h2>
      <div class="fp-form-grid">
        <label>หัวข้อ
          <input type="text" id="rc-input-title" placeholder="เช่น ใบอนุญาตก่อสร้าง" />
        </label>
        <label>ประเภท
          <select id="rc-input-type">
            ${CHECK_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label>สถานะเริ่มต้น
          <select id="rc-input-status">
            <option value="red">🔴 ไม่พร้อม</option>
            <option value="yellow" selected>🟡 ต้องติดตาม</option>
            <option value="green">🟢 พร้อม</option>
          </select>
        </label>
      </div>
      <label>รายละเอียด
        <textarea id="rc-input-detail" placeholder="อธิบายสถานะปัจจุบัน"></textarea>
      </label>
      <label>คำแนะนำ
        <textarea id="rc-input-recommendation" placeholder="สิ่งที่ควรทำต่อ"></textarea>
      </label>
      <button class="fp-btn-primary" onclick="rc_addCheck()">+ เพิ่มรายการ</button>
    </div>

    <div class="rc-list">
      ${checks.length === 0
        ? '<p class="fp-empty">ยังไม่มีรายการตรวจสอบ</p>'
        : checks.map(renderCheckCard).join('')}
    </div>
  `;
}

function renderCheckCard(c) {
  const typeLabel = (CHECK_TYPES.find(t => t.value === c.check_type) || {}).label || c.check_type || '';
  const color = STATUS_COLOR[c.status] || '#94a3b8';
  const nav = CHECK_NAV[c.check_type];
  return `
    <div class="fp-card rc-item" style="border-left: 4px solid ${color}">
      <div class="rc-item-head">
        <button class="rc-status-badge" style="background:${color}22;color:${color}" onclick="rc_cycleStatus('${c.id}')" title="คลิกเพื่อเปลี่ยนสถานะ">
          ${STATUS_ICON[c.status] || '⚪'} ${STATUS_LABEL[c.status] || c.status}
        </button>
        <span class="rc-item-type">${typeLabel}</span>
        <button class="rc-delete" onclick="rc_deleteCheck('${c.id}')" title="ลบรายการ">✕</button>
      </div>
      <h3>${escapeHtml(c.title)}</h3>
      ${c.detail ? `<p class="rc-detail">${escapeHtml(c.detail)}</p>` : ''}
      ${c.recommendation && c.recommendation !== '-' ? `<p class="rc-recommend">💡 ${escapeHtml(c.recommendation)}</p>` : ''}
      ${nav && c.status !== 'green' ? `<button class="rc-nav-link" onclick="rc_goto('${nav.module}')">${nav.label} →</button>` : ''}
    </div>
  `;
}

export function rc_addCheck() {
  const titleInput = document.getElementById('rc-input-title');
  const title = titleInput.value.trim();
  if (!title) {
    alert('กรุณากรอกหัวข้อรายการตรวจสอบ');
    return;
  }
  const now = new Date().toISOString();
  const check = createReadinessCheck({
    id: crypto.randomUUID(),
    check_type: document.getElementById('rc-input-type').value,
    status: document.getElementById('rc-input-status').value,
    title,
    detail: document.getElementById('rc-input-detail').value.trim(),
    recommendation: document.getElementById('rc-input-recommendation').value.trim(),
    auto_generated: false,
    checked_at: now,
    created_at: now,
  });
  checks.unshift(check);
  saveChecks(checks);
  render();
}

export function rc_cycleStatus(id) {
  const check = checks.find(c => c.id === id);
  if (!check) return;
  const idx = STATUS_ORDER.indexOf(check.status);
  check.status = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
  check.checked_at = new Date().toISOString();
  saveChecks(checks);
  render();
}

export function rc_deleteCheck(id) {
  checks = checks.filter(c => c.id !== id);
  saveChecks(checks);
  render();
}

// ไปยังแท็บที่แก้ไขรายการได้จริง (เรียก setActiveTab ของ shell)
export function rc_goto(moduleName) {
  if (typeof window.constistant_setActiveTab === 'function') {
    window.constistant_setActiveTab(moduleName);
  }
}

// expose ให้ inline onclick="" ใน HTML เรียกได้
window.rc_addCheck = rc_addCheck;
window.rc_cycleStatus = rc_cycleStatus;
window.rc_deleteCheck = rc_deleteCheck;
window.rc_goto = rc_goto;

document.addEventListener('DOMContentLoaded', () => {
  checks = loadChecks();
  render();
});

// เมื่อ pipeline (ปุ่ม Calculate Project) คำนวณเสร็จ ให้โหลดผลลัพธ์ใหม่จาก localStorage มาแสดง
window.addEventListener('constistant:pipeline-updated', (e) => {
  checks = e.detail?.readiness ?? loadChecks();
  render();
});

// เมื่อสลับโปรเจกต์ ให้โหลด/seed ข้อมูลของโปรเจกต์ที่เลือกใหม่
window.addEventListener(PROJECT_EVENT, () => {
  checks = loadChecks();
  render();
});
