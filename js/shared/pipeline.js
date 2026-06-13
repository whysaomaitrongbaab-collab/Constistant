// pipeline.js — "Calculate Project" orchestrator
//
// รับ drawing_elements + beam_library (รูปแบบตาม schema.js — วันนี้มาจาก demo-seed.js,
// ในอนาคตจะมาจาก Drawing Intelligence pipeline จริง) แล้วรันทุก engine ตามลำดับ:
//
//   1. BOQ        — ปริมาณงาน + ราคา จาก drawing elements
//   2. BBS        — ตารางตัด-ดัดเหล็ก จาก BOQ + beam library
//   3. Planner    — ตารางงานก่อสร้าง (schedule_tasks) จาก BOQ
//   4. Resource   — แรงงาน/วัสดุ (resource_items) จาก schedule_tasks + BOQ
//   5. Readiness  — RAG checklist จากผลรวมทุก engine
//
// ผลลัพธ์แต่ละ tier เซฟลง localStorage ด้วย key เดียวกับที่ feature module นั้นๆ ใช้อ่าน
// แล้ว dispatch event 'constistant:pipeline-updated' ให้ module ที่เปิดอยู่ re-render

import {
  createBOQItem,
  createBBSItem,
  createScheduleTask,
  createResourceItem,
  createReadinessCheck,
  calcRebarWeight,
  calcAdjustedDuration,
  REBAR_UNIT_WEIGHT,
  PRODUCTIVITY_RATES,
  CURE_LAG_DAYS,
  CONCRETE_WASTE_FACTOR,
  REBAR_WASTE_FACTOR,
  REBAR_GRADES,
  BEND_DEDUCTION_D,
  EQUIPMENT_COST_FACTOR,
  CONTINGENCY_FACTOR,
  WORK_TYPE_HIERARCHY,
  workTypeFromElementType,
  CREW_TYPES,
} from './schema.js';
import { getCurrentProject, getProjectElements, projectStorageKey } from './project-store.js';
import { applyWeatherBuffer } from './timeline-engine.js';
import { getConcretePrice, getFormworkPrice, getRebarPrice } from './price-config.js';

export const PIPELINE_EVENT = 'constistant:pipeline-updated';

export const STORAGE_KEYS = {
  boq: 'constistant_boq_items_v1',
  bbs: 'constistant_bbs_items_v1',
  schedule: 'constistant_schedule_tasks_v1',
  resources: 'constistant_resource_items_v1',
  readiness: 'constistant_readiness_checks_v1',
  // NEW — Onboarding Wizard + Timeline Engine
  projectConfig: 'constistant_project_config_v1',
  timelineViewState: 'constistant_timeline_view_state_v1',
  timelineEstimates: 'constistant_timeline_estimates_v1',
  drawingUploads: 'constistant_drawing_uploads_v1',
  payroll: 'constistant_payroll_entries_v1',
};

// ─────────────────────────────────────────────
// Reference rates / assumptions (ปรับได้ตามต้องการ)
// ─────────────────────────────────────────────

const COVER_MM = 25;            // concrete cover ทั่วไป
const HOOK_MM = 75;             // hook ปลายปลอก (ต่อข้าง)
const DEFAULT_FLOOR_HEIGHT_M = 3.0; // ใช้กับเสาที่ไม่มี span_length_m

// Note: All material prices now come from price-config.js (getConcretePrice, getRebarPrice, getFormworkPrice)
// This ensures BOQ, Catalog, and Pipeline use the same single source of truth for pricing

// Note: Material cost breakdown (Resource Hub) — extracted from total price via price-config
// For example: if formwork = 280 THB/m2, material portion ≈ 150-180 THB/m2 (rest is labor/overhead)

// ค่าแรงรายวัน (THB/person-day)
const LABOR_RATE_THB = { rebar: 550, formwork: 500, concrete: 450 };

// ระยะเวลาสั่งวัสดุล่วงหน้า (วัน)
const MATERIAL_LEAD_DAYS = { rebar: 7, formwork: 5, concrete: 2 };

const ELEMENT_LABEL = { column: 'เสา', beam: 'คาน', slab: 'พื้น', footing: 'ฐานราก', staircase: 'บันได' };
const TASK_LABEL = { rebar: 'งานผูกเหล็ก', formwork: 'งานติดตั้งแบบหล่อ', concrete: 'งานเทคอนกรีต' };
const TASK_ORDER = ['rebar', 'formwork', 'concrete'];
const TRADE_BY_CATEGORY = { rebar: 'steel_fixer', formwork: 'carpenter', concrete: 'concrete_gang' };
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// ─────────────────────────────────────────────
// Step 0 — Input
// ─────────────────────────────────────────────

/**
 * ดึง project + drawing_elements + beam_library ของโปรเจกต์ที่กำลังเลือกอยู่
 * โปรเจกต์สาธิต -> seed จาก demo-seed.js (ครั้งแรก)
 * โปรเจกต์ใหม่ -> เริ่มว่างเปล่า (รอข้อมูลจาก Drawing Intelligence ในอนาคต)
 * Drawing Intelligence จริง -> เรียก qt_saveExtractionToProject() (js/drawing/drawing-bridge.js)
 * หลังอ่านแบบเสร็จ เพื่อแปลง qt_elementsData เป็น schema entities แล้ว pipeline หยิบมาใช้ได้ทันที
 */
function getInputData() {
  const project = getCurrentProject();
  const { elements, beamLibraryById } = getProjectElements(project.id);
  return { project, elements, beamLibraryById };
}

// ─────────────────────────────────────────────
// Step 1 — BOQ
// ─────────────────────────────────────────────

export function computeBOQ(elements, beamLibraryById, project) {
  const boqItems = [];

  for (const el of elements) {
    const lib = beamLibraryById[el.beam_library_id];
    if (!lib) continue;

    const type = el.element_type;
    const dia = lib.main_bar_dia_mm;
    const idBase = `boq-${el.element_id}-${el.floor_level}`;

    const workType = workTypeFromElementType(type);
    const workTypeDef = WORK_TYPE_HIERARCHY[workType] || WORK_TYPE_HIERARCHY.other;
    const categoryInfo = workTypeDef.sub_categories?.[type] || workTypeDef;

    let concreteVolumeM3 = 0;
    let formworkAreaM2 = 0;
    let rebarWeightKg = 0;

    if (type === 'slab') {
      const thicknessM = (lib.height_mm || 120) / 1000;
      concreteVolumeM3 = (el.floor_area_sqm || 0) * thicknessM;
      formworkAreaM2 = el.floor_area_sqm || 0; // ท้องพื้น (soffit)
      // เหล็กพื้น 2 ทิศทาง: bar/m² ≈ (2000 / spacing_mm) × unit weight
      const spacingMm = lib.stirrup_spacing_mm || 200; // ใช้ field เดียวกันเก็บระยะเรียงเหล็กพื้น
      const densityKgPerSqm = (2000 / spacingMm) * (REBAR_UNIT_WEIGHT[dia] || 0);
      rebarWeightKg = parseFloat(((el.floor_area_sqm || 0) * densityKgPerSqm).toFixed(2));
    } else {
      const wM = (lib.width_mm || 0) / 1000;
      const hM = (lib.height_mm || 0) / 1000;
      const lengthM = el.span_length_m || DEFAULT_FLOOR_HEIGHT_M;
      const count = el.count || 0;

      concreteVolumeM3 = parseFloat((count * wM * hM * lengthM).toFixed(3));

      formworkAreaM2 = type === 'beam'
        ? parseFloat((count * (2 * hM + wM) * lengthM).toFixed(2))   // 2 ข้าง + ท้องคาน
        : parseFloat((count * 2 * (wM + hM) * lengthM).toFixed(2));  // เสา/ฐานราก: รอบหน้าตัด

      const lapFactorD = (REBAR_GRADES[lib.steel_grade] || REBAR_GRADES.SD40).lap_factor_d;
      const lapM = (lapFactorD * dia) / 1000;
      const cutLengthM = lengthM + lapM;
      const totalLengthM = count * (lib.main_bar_count || 0) * cutLengthM;
      rebarWeightKg = calcRebarWeight(dia, totalLengthM) || 0;
    }

    // เผื่อเสีย (waste factor) ก่อนคิดราคา BOQ
    const concreteQty = parseFloat((concreteVolumeM3 * CONCRETE_WASTE_FACTOR).toFixed(3));
    const rebarQty = parseFloat((rebarWeightKg * REBAR_WASTE_FACTOR).toFixed(2));

    // flag รายการที่อ่านจากแบบด้วยความมั่นใจต่ำ ให้ตรวจสอบก่อนสั่งวัสดุ
    const status = (el.confidence_score ?? 1) < 0.75 ? 'needs_review' : 'ok';
    const concreteRate = getConcretePrice(240);
    const formworkRate = getFormworkPrice(type);
    const rebarRate = getRebarPrice(lib.steel_grade || 'SD40', dia);

    const concretePrice_thb = concreteRate?.price || 2470.60; // fallback to CGD 240 ksc
    boqItems.push(createBOQItem({
      id: `${idBase}-concrete`,
      project_id: project.id,
      drawing_element_id: el.id,
      item_code: `STR-${el.element_id}-${el.floor_level}-CON`,
      description: `คอนกรีต ${ELEMENT_LABEL[type] || type} ${el.element_id} ชั้น ${el.floor_level}`,
      work_category: 'concrete',
      unit: 'm3',
      quantity: concreteQty,
      unit_rate_thb: concretePrice_thb,
      amount_thb: parseFloat((concreteQty * concretePrice_thb).toFixed(2)),
      floor_level: el.floor_level,
      element_type: type,
      status,
      work_type: workType,
      category_code: categoryInfo.category_code,
      category_label_th: categoryInfo.category_label_th,
      unit_price_source: concreteRate?.source || 'cgd_2026',
    }));

    const rebarPrice_thb = rebarRate?.price || 18.50; // fallback to CGD SD40 DB16
    boqItems.push(createBOQItem({
      id: `${idBase}-rebar`,
      project_id: project.id,
      drawing_element_id: el.id,
      item_code: `STR-${el.element_id}-${el.floor_level}-RB`,
      description: `เหล็กเสริม ${ELEMENT_LABEL[type] || type} ${el.element_id} ชั้น ${el.floor_level} (DB${dia})`,
      work_category: 'rebar',
      unit: 'kg',
      quantity: rebarQty,
      unit_rate_thb: rebarPrice_thb,
      amount_thb: parseFloat((rebarQty * rebarPrice_thb).toFixed(2)),
      floor_level: el.floor_level,
      element_type: type,
      status,
      work_type: workType,
      category_code: categoryInfo.category_code,
      category_label_th: categoryInfo.category_label_th,
      unit_price_source: rebarRate?.source || 'cgd_2026',
    }));

    const formworkPrice_thb = formworkRate?.price || 280; // fallback to CGD column formwork
    boqItems.push(createBOQItem({
      id: `${idBase}-formwork`,
      project_id: project.id,
      drawing_element_id: el.id,
      item_code: `STR-${el.element_id}-${el.floor_level}-FW`,
      description: `แบบหล่อ ${ELEMENT_LABEL[type] || type} ${el.element_id} ชั้น ${el.floor_level}`,
      work_category: 'formwork',
      unit: 'm2',
      quantity: formworkAreaM2,
      unit_rate_thb: formworkPrice_thb,
      amount_thb: parseFloat((formworkAreaM2 * formworkPrice_thb).toFixed(2)),
      floor_level: el.floor_level,
      element_type: type,
      status,
      work_type: workType,
      category_code: categoryInfo.category_code,
      category_label_th: categoryInfo.category_label_th,
      unit_price_source: formworkRate?.source || 'cgd_2026',
    }));
  }

  return boqItems;
}

// ─────────────────────────────────────────────
// Step 2 — BBS (Bar Bending Schedule)
// ─────────────────────────────────────────────

function computeBBS(elements, beamLibraryById, boqItems, project) {
  const bbsItems = [];

  for (const el of elements) {
    const lib = beamLibraryById[el.beam_library_id];
    if (!lib) continue;

    const type = el.element_type;
    const rebarBoq = boqItems.find(b => b.drawing_element_id === el.id && b.work_category === 'rebar');
    const dia = lib.main_bar_dia_mm;

    if (type === 'slab') {
      const sideM = Math.sqrt(el.floor_area_sqm || 0);
      const spacingMm = lib.stirrup_spacing_mm || 200;
      const barsPerDirection = Math.ceil((sideM * 1000) / spacingMm) + 1;
      const totalBars = barsPerDirection * 2; // สองทิศทาง
      const cutLengthMm = parseFloat((sideM * 1000).toFixed(0));

      bbsItems.push(createBBSItem({
        id: `bbs-${el.element_id}-${el.floor_level}-main`,
        project_id: project.id,
        boq_item_id: rebarBoq?.id ?? null,
        member_id: `${el.floor_level}${el.element_id}`,
        bar_mark: 'M1',
        bar_type: lib.main_bar_type || 'DB',
        steel_grade: lib.steel_grade,
        diameter_mm: dia,
        shape_code: '00',
        cut_length_mm: cutLengthMm,
        num_members: 1,
        bars_per_member: totalBars,
        total_bars: totalBars,
        total_length_m: parseFloat((totalBars * cutLengthMm / 1000).toFixed(3)),
        unit_weight_kg_per_m: REBAR_UNIT_WEIGHT[dia] ?? null,
        total_weight_kg: calcRebarWeight(dia, totalBars * cutLengthMm / 1000),
      }));
      continue;
    }

    // เหล็กแกนหลัก (main bars) — lap splice ขึ้นกับชั้นเหล็ก (steel_grade)
    const lengthM = el.span_length_m || DEFAULT_FLOOR_HEIGHT_M;
    const lapFactorD = (REBAR_GRADES[lib.steel_grade] || REBAR_GRADES.SD40).lap_factor_d;
    const lapMm = lapFactorD * dia;
    const cutLengthMm = parseFloat((lengthM * 1000 + lapMm).toFixed(0));
    const totalBarsMain = (el.count || 0) * (lib.main_bar_count || 0);

    bbsItems.push(createBBSItem({
      id: `bbs-${el.element_id}-${el.floor_level}-main`,
      project_id: project.id,
      boq_item_id: rebarBoq?.id ?? null,
      member_id: `${el.floor_level}${el.element_id}`,
      bar_mark: 'M1',
      bar_type: lib.main_bar_type || 'DB',
      steel_grade: lib.steel_grade,
      diameter_mm: dia,
      shape_code: '00',
      cut_length_mm: cutLengthMm,
      num_members: el.count || 0,
      bars_per_member: lib.main_bar_count || 0,
      total_bars: totalBarsMain,
      total_length_m: parseFloat((totalBarsMain * cutLengthMm / 1000).toFixed(3)),
      unit_weight_kg_per_m: REBAR_UNIT_WEIGHT[dia] ?? null,
      total_weight_kg: calcRebarWeight(dia, totalBarsMain * cutLengthMm / 1000),
    }));

    // ปลอก (stirrups) — ถ้ามี
    if (lib.stirrup_dia_mm) {
      const wMm = lib.width_mm || 0;
      const hMm = lib.height_mm || 0;
      const stirrupDia = lib.stirrup_dia_mm;
      // เส้นรอบรูป + ตะขอปลายทั้งสองข้าง หักความยาวจากมุมดัด 90° ของปลอกปิด (มยผ. 1103)
      const perimeterMm = 2 * ((wMm - 2 * COVER_MM) + (hMm - 2 * COVER_MM)) + 2 * HOOK_MM
        - BEND_DEDUCTION_D.stirrup_closed * stirrupDia;
      const spacingM = (lib.stirrup_spacing_mm || 200) / 1000;
      const barsPerMember = Math.max(1, Math.ceil(lengthM / spacingM) + 1);
      const totalBarsStirrup = (el.count || 0) * barsPerMember;

      bbsItems.push(createBBSItem({
        id: `bbs-${el.element_id}-${el.floor_level}-stirrup`,
        project_id: project.id,
        boq_item_id: rebarBoq?.id ?? null,
        member_id: `${el.floor_level}${el.element_id}`,
        bar_mark: 'S1',
        bar_type: lib.stirrup_type || 'RB',
        steel_grade: 'SR24',
        diameter_mm: stirrupDia,
        shape_code: '38', // ปลอกสี่เหลี่ยม
        bend_a_mm: hMm - 2 * COVER_MM,
        bend_b_mm: wMm - 2 * COVER_MM,
        cut_length_mm: parseFloat(perimeterMm.toFixed(0)),
        num_members: el.count || 0,
        bars_per_member: barsPerMember,
        total_bars: totalBarsStirrup,
        total_length_m: parseFloat((totalBarsStirrup * perimeterMm / 1000).toFixed(3)),
        unit_weight_kg_per_m: REBAR_UNIT_WEIGHT[stirrupDia] ?? null,
        total_weight_kg: calcRebarWeight(stirrupDia, totalBarsStirrup * perimeterMm / 1000),
      }));
    }
  }

  return bbsItems;
}

// ─────────────────────────────────────────────
// Step 3 — Planner (schedule_tasks)
// ─────────────────────────────────────────────

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function loadProjectConfig(projectId) {
  try {
    const raw = localStorage.getItem(projectStorageKey(STORAGE_KEYS.projectConfig, projectId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[pipeline] failed to load project config', e);
    return null;
  }
}

function periodMonthFor(date, projectStart) {
  return (date.getUTCFullYear() - projectStart.getUTCFullYear()) * 12
    + (date.getUTCMonth() - projectStart.getUTCMonth()) + 1;
}

export function computeSchedule(elements, boqItems, project) {
  const projectConfig = loadProjectConfig(project.id);
  const rainyMonths = projectConfig?.timeline?.rainy_season_months;
  const useEngineWeather = Array.isArray(rainyMonths) && rainyMonths.length > 0;

  const tasks = [];
  let cursor = new Date(`${project.start_date}T00:00:00Z`);
  const projectStart = new Date(`${project.start_date}T00:00:00Z`);
  let prevTaskId = null;

  // เรียงตามชั้น (F1 ก่อน F2) ตามลำดับที่ elements ถูกส่งเข้ามา (demo-seed เรียงไว้แล้ว)
  elements.forEach((el, elIdx) => {
    const type = el.element_type;
    const items = boqItems.filter(b => b.drawing_element_id === el.id);
    const itemByCategory = Object.fromEntries(items.map(b => [b.work_category, b]));
    const workType = workTypeFromElementType(type);

    TASK_ORDER.forEach((category, taskIdx) => {
      const boq = itemByCategory[category];
      if (!boq || !boq.quantity) return;

      const productivityKey = category === 'formwork'
        ? `formwork_${type}_${boq.unit}`
        : `${type}_${category}_${boq.unit}`;
      const productivity = PRODUCTIVITY_RATES[productivityKey]
        ?? (category === 'concrete' ? 10 : category === 'rebar' ? 200 : 18);

      const crewSize = category === 'concrete' ? 5 : 2;
      const baseDuration = parseFloat(Math.max(boq.quantity / (crewSize * productivity), 0.5).toFixed(1));

      const month = cursor.getUTCMonth() + 1;
      const adjustedDuration = useEngineWeather ? baseDuration : calcAdjustedDuration(baseDuration, month);
      const startDate = new Date(cursor);
      const endDate = addDays(startDate, Math.ceil(adjustedDuration));

      const taskId = `task-${el.element_id}-${el.floor_level}-${category}`;
      const leadDays = MATERIAL_LEAD_DAYS[category] ?? 5;
      const predecessorIds = prevTaskId ? [prevTaskId] : [];
      const trade = TRADE_BY_CATEGORY[category];
      const periodMonth = periodMonthFor(startDate, projectStart);

      tasks.push(createScheduleTask({
        id: taskId,
        project_id: project.id,
        boq_item_id: boq.id,
        wbs_code: `${elIdx + 1}.${taskIdx + 1}`,
        activity_name: `${TASK_LABEL[category]} — ${el.element_id} (${el.floor_level})`,
        work_category: 'structural',
        floor_level: el.floor_level,
        quantity: boq.quantity,
        unit: boq.unit,
        crew_size: crewSize,
        productivity_rate: productivity,
        base_duration_days: baseDuration,
        weather_buffer_factor: parseFloat((adjustedDuration / baseDuration - 1).toFixed(2)),
        adjusted_duration_days: adjustedDuration,
        start_date: toISODate(startDate),
        end_date: toISODate(endDate),
        predecessor_task_ids: predecessorIds,
        lag_days: 0,
        is_critical: true,
        material_order_date: toISODate(addDays(startDate, -leadDays)),
        material_lead_time_days: leadDays,
        work_type: workType,
        period_month: periodMonth,
        period_label: `เดือนที่ ${periodMonth}`,
        resource_group: { primary_trade: trade, crew_type: trade, crew_count: crewSize },
        depends_on_task_ids: predecessorIds,
        is_critical_path: true,
        task_cost_estimate: parseFloat((crewSize * (CREW_TYPES[trade]?.day_rate_thb ?? 0) * adjustedDuration).toFixed(2)),
      }));

      // คอนกรีตต้องรอ cure ก่อนเริ่มงานถัดไป
      const cureLag = category === 'concrete' ? (CURE_LAG_DAYS[type] ?? 3) : 0;
      cursor = addDays(endDate, cureLag);
      prevTaskId = taskId;
    });
  });

  return useEngineWeather ? applyWeatherBuffer(tasks, rainyMonths, 0.4) : tasks;
}

// ─────────────────────────────────────────────
// Step 4 — Resource Hub (resource_items)
// ─────────────────────────────────────────────

function computeResources(boqItems, scheduleTasks, project) {
  const items = [];

  // แรงงาน: รวม person-day ตามประเภทงาน
  const personDaysByCategory = { rebar: 0, formwork: 0, concrete: 0 };
  scheduleTasks.forEach(t => {
    const category = t.id.split('-').pop(); // task id ลงท้ายด้วย rebar|formwork|concrete
    if (personDaysByCategory[category] != null) {
      personDaysByCategory[category] += (t.crew_size || 0) * (t.adjusted_duration_days || 0);
    }
  });

  const ROLE_NAME = {
    rebar: 'ช่างเหล็ก (Steel Fixer)',
    formwork: 'ช่างไม้แบบหล่อ (Formwork Carpenter)',
    concrete: 'ช่างคอนกรีต (Concrete Crew)',
  };

  Object.entries(personDaysByCategory).forEach(([category, personDays]) => {
    if (!personDays) return;
    const qty = parseFloat(personDays.toFixed(1));
    const rate = LABOR_RATE_THB[category];
    items.push(createResourceItem({
      id: `res-labor-${category}`,
      project_id: project.id,
      schedule_task_id: null,
      resource_type: 'manpower',
      name: ROLE_NAME[category],
      unit: 'person-day',
      quantity: qty,
      unit_cost_thb: rate,
      total_cost_thb: parseFloat((qty * rate).toFixed(2)),
      supplier_id: null,
    }));
  });

  // วัสดุ: รวมตาม work_category จาก BOQ
  const totalConcreteM3ByType = {};
  let totalRebarKg = 0;
  let totalFormworkM2 = 0;

  boqItems.forEach(b => {
    if (b.work_category === 'concrete') {
      totalConcreteM3ByType[b.element_type] = (totalConcreteM3ByType[b.element_type] || 0) + b.quantity;
    } else if (b.work_category === 'rebar') {
      totalRebarKg += b.quantity;
    } else if (b.work_category === 'formwork') {
      totalFormworkM2 += b.quantity;
    }
  });

  Object.entries(totalConcreteM3ByType).forEach(([type, qty]) => {
    const rate = getConcretePrice(240)?.price ?? 3400;
    items.push(createResourceItem({
      id: `res-material-concrete-${type}`,
      project_id: project.id,
      resource_type: 'material',
      name: `คอนกรีตผสมเสร็จ — ${ELEMENT_LABEL[type] || type}`,
      unit: 'm3',
      quantity: parseFloat(qty.toFixed(3)),
      unit_cost_thb: rate,
      total_cost_thb: parseFloat((qty * rate).toFixed(2)),
      supplier_id: null,
    }));
  });

  if (totalRebarKg > 0) {
    const rebarPrice = getRebarPrice('SD40', 16)?.price || 18.50;
    items.push(createResourceItem({
      id: 'res-material-rebar',
      project_id: project.id,
      resource_type: 'material',
      name: 'เหล็กเสริมคอนกรีต (รวมทุกขนาด)',
      unit: 'kg',
      quantity: parseFloat(totalRebarKg.toFixed(2)),
      unit_cost_thb: rebarPrice,
      total_cost_thb: parseFloat((totalRebarKg * rebarPrice).toFixed(2)),
      supplier_id: null,
    }));
  }

  if (totalFormworkM2 > 0) {
    const formworkPrice = getFormworkPrice('beam')?.price || 280;
    const materialPortion = formworkPrice * 0.55; // estimate 55% material, 45% labor/overhead
    items.push(createResourceItem({
      id: 'res-material-formwork',
      project_id: project.id,
      resource_type: 'material',
      name: 'ไม้แบบหล่อ + อุปกรณ์ค้ำยัน',
      unit: 'm2',
      quantity: parseFloat(totalFormworkM2.toFixed(2)),
      unit_cost_thb: parseFloat(materialPortion.toFixed(2)),
      total_cost_thb: parseFloat((totalFormworkM2 * materialPortion).toFixed(2)),
      supplier_id: null,
    }));
  }

  // เครื่องจักร/อุปกรณ์ (ปั๊มคอนกรีต, เครื่องสั่น, เครน ฯลฯ) — ประมาณการเป็น % ของต้นทุนวัสดุ
  const totalMaterialCost = items
    .filter(i => i.resource_type === 'material')
    .reduce((sum, i) => sum + (i.total_cost_thb || 0), 0);

  if (totalMaterialCost > 0) {
    const equipmentCost = parseFloat((totalMaterialCost * EQUIPMENT_COST_FACTOR).toFixed(2));
    items.push(createResourceItem({
      id: 'res-equipment-misc',
      project_id: project.id,
      resource_type: 'equipment',
      name: 'เครื่องจักร/อุปกรณ์ก่อสร้าง (ปั๊มคอนกรีต, เครื่องสั่น, เครน)',
      unit: 'lot',
      quantity: 1,
      unit_cost_thb: equipmentCost,
      total_cost_thb: equipmentCost,
      supplier_id: null,
    }));
  }

  // เผื่อเหลือเผื่อขาด (contingency) — % ของต้นทุนรวม (วัสดุ + แรงงาน + เครื่องจักร)
  const subtotalCost = items.reduce((sum, i) => sum + (i.total_cost_thb || 0), 0);
  if (subtotalCost > 0) {
    const contingencyCost = parseFloat((subtotalCost * CONTINGENCY_FACTOR).toFixed(2));
    items.push(createResourceItem({
      id: 'res-contingency',
      project_id: project.id,
      resource_type: 'contingency',
      name: `เผื่อเหลือเผื่อขาด (Contingency ${(CONTINGENCY_FACTOR * 100).toFixed(0)}%)`,
      unit: 'lot',
      quantity: 1,
      unit_cost_thb: contingencyCost,
      total_cost_thb: contingencyCost,
      supplier_id: null,
    }));
  }

  return items;
}

// ─────────────────────────────────────────────
// Step 5 — Readiness Check (auto-generated checks)
// ─────────────────────────────────────────────

export function computeReadiness(elements, boqItems, bbsItems, scheduleTasks, project, existingChecks) {
  const now = new Date();

  // 1) แบบครบถ้วน?
  const lowConfidence = elements.filter(e => (e.confidence_score ?? 1) < 0.85);
  const drawingComplete = createReadinessCheck({
    id: 'check-drawing-complete-auto',
    project_id: project.id,
    check_type: 'drawing_complete',
    status: lowConfidence.length === 0 ? 'green' : 'yellow',
    title: 'แบบแปลนครบถ้วน',
    detail: lowConfidence.length === 0
      ? `อ่านแบบครบ ${elements.length} elements ความมั่นใจ ≥ 0.85 ทุกรายการ`
      : `${lowConfidence.length} จาก ${elements.length} elements มีความมั่นใจต่ำกว่า 0.85 (${lowConfidence.map(e => e.element_id).join(', ')})`,
    recommendation: lowConfidence.length === 0 ? '-' : 'ตรวจสอบ element ที่ confidence ต่ำก่อนสั่งวัสดุ',
    auto_generated: true,
    checked_at: now.toISOString(),
  });

  // 2) BBS พร้อม?
  const bbsReady = createReadinessCheck({
    id: 'check-bbs-ready-auto',
    project_id: project.id,
    check_type: 'bbs_ready',
    status: bbsItems.length > 0 ? 'green' : 'red',
    title: 'BBS พร้อมก่อนเริ่มผูกเหล็ก',
    detail: bbsItems.length > 0
      ? `สร้าง BBS แล้ว ${bbsItems.length} รายการ จาก ${elements.length} elements`
      : 'ยังไม่มี BBS — กด Calculate Project เพื่อสร้าง',
    recommendation: bbsItems.length > 0 ? 'ส่งไฟล์ BBS ให้โรงงานตัดดัดเหล็กตาม material_order_date' : 'รัน Calculate Project ก่อน',
    auto_generated: true,
    checked_at: now.toISOString(),
  });

  // 3) สั่งวัสดุทันเวลาไหม? (เทียบ material_order_date ที่เร็วที่สุดกับวันนี้)
  const orderDates = scheduleTasks.map(t => t.material_order_date).filter(Boolean).sort();
  const earliest = orderDates[0] ? new Date(`${orderDates[0]}T00:00:00Z`) : null;
  let materialStatus = 'green';
  let materialDetail = 'ยังไม่มีกำหนดสั่งวัสดุที่ใกล้ถึง';
  let materialRec = '-';
  if (earliest) {
    const daysUntil = Math.round((earliest.getTime() - now.getTime()) / 86400000);
    if (daysUntil < 0) {
      materialStatus = 'red';
      materialDetail = `รายการแรกควรสั่งไปแล้วเมื่อ ${orderDates[0]} (เลยกำหนด ${Math.abs(daysUntil)} วัน)`;
      materialRec = 'ติดต่อซัพพลายเออร์ด่วนเพื่อยืนยันคิวจัดส่ง';
    } else if (daysUntil <= 14) {
      materialStatus = 'yellow';
      materialDetail = `รายการแรกควรสั่งภายใน ${daysUntil} วัน (${orderDates[0]})`;
      materialRec = 'เริ่มขอใบเสนอราคาและยืนยัน lead time กับซัพพลายเออร์';
    } else {
      materialDetail = `รายการแรกกำหนดสั่ง ${orderDates[0]} (อีก ${daysUntil} วัน)`;
      materialRec = 'ยังมีเวลาเพียงพอ ติดตามตามกำหนดเดิม';
    }
  }
  const materialLead = createReadinessCheck({
    id: 'check-material-lead-auto',
    project_id: project.id,
    check_type: 'material_lead',
    status: materialStatus,
    title: 'สั่งวัสดุทันก่อนเริ่มงาน',
    detail: materialDetail,
    recommendation: materialRec,
    auto_generated: true,
    checked_at: now.toISOString(),
  });

  // 4) ความเสี่ยงสภาพอากาศ (จาก weather_buffer_factor สูงสุดในตาราง)
  const maxBuffer = scheduleTasks.reduce((max, t) => Math.max(max, t.weather_buffer_factor || 0), 0);
  const weatherStatus = maxBuffer >= 0.30 ? 'red' : maxBuffer >= 0.15 ? 'yellow' : 'green';
  const weatherRisk = createReadinessCheck({
    id: 'check-weather-risk-auto',
    project_id: project.id,
    check_type: 'weather_risk',
    status: weatherStatus,
    title: 'ความเสี่ยงสภาพอากาศช่วงก่อสร้าง',
    detail: `weather buffer สูงสุดในตารางงาน = ${(maxBuffer * 100).toFixed(0)}% ของ duration`,
    recommendation: weatherStatus === 'green'
      ? '-'
      : 'เตรียมผ้าใบคลุมงาน และเผื่อวัสดุสำหรับงานที่อาจล่าช้าจากฝน',
    auto_generated: true,
    checked_at: now.toISOString(),
  });

  // 5) ความพร้อมแรงงาน (informational — ขึ้นกับ resource ที่คำนวณได้)
  const totalCriticalDays = scheduleTasks.reduce((sum, t) => sum + (t.adjusted_duration_days || 0), 0);
  const crewAvailable = createReadinessCheck({
    id: 'check-crew-available-auto',
    project_id: project.id,
    check_type: 'crew_available',
    status: 'yellow',
    title: 'ความพร้อมแรงงาน',
    detail: `ตารางงานที่คำนวณได้รวม ~${totalCriticalDays.toFixed(1)} วัน (critical path)`,
    recommendation: 'ยืนยันคิวช่างเหล็ก/ไม้แบบ/คอนกรีตกับผู้รับเหมาก่อนวันเริ่มงานจริง',
    auto_generated: true,
    checked_at: now.toISOString(),
  });

  const autoChecks = [drawingComplete, bbsReady, materialLead, weatherRisk, crewAvailable];

  // 6) ระยะเวลาที่ผู้ใช้กำหนด (จาก wizard) สั้นกว่าประมาณการขั้นต่ำหรือไม่
  const projectConfig = loadProjectConfig(project.id);
  if (projectConfig) {
    const timeline = projectConfig.timeline || {};
    if (timeline.user_duration_days != null && timeline.estimated_min_days != null
      && timeline.user_duration_days < timeline.estimated_min_days) {
      const shortBy = timeline.estimated_min_days - timeline.user_duration_days;
      autoChecks.push(createReadinessCheck({
        id: 'check-timeline-risk-auto',
        project_id: project.id,
        check_type: 'timeline_risk',
        status: 'red',
        title: 'ระยะเวลาสั้นเกินไป',
        detail: `กำหนดระยะเวลา ${timeline.user_duration_days} วัน น้อยกว่าประมาณการขั้นต่ำ ${timeline.estimated_min_days} วัน (ขาดอีก ${shortBy} วัน)`,
        recommendation: 'เพิ่มจำนวนทีมงาน หรือขยายระยะเวลาโครงการให้สอดคล้องกับประมาณการ',
        auto_generated: true,
        checked_at: now.toISOString(),
      }));
    }

    // 7) งานโครงสร้าง/ฐานราก ตรงกับฤดูฝน (จาก weather_risk ที่ applyWeatherBuffer คำนวณไว้)
    const overlapMonths = new Set();
    scheduleTasks.forEach(t => {
      if ((t.work_type === 'structure' || t.work_type === 'foundation') && t.weather_risk === 'high' && t.start_date) {
        overlapMonths.add(new Date(`${t.start_date}T00:00:00Z`).getUTCMonth() + 1);
      }
    });
    if (overlapMonths.size) {
      const monthNames = [...overlapMonths].sort((a, b) => a - b).map(m => THAI_MONTHS[m - 1]);
      autoChecks.push(createReadinessCheck({
        id: 'check-weather-overlap-auto',
        project_id: project.id,
        check_type: 'weather_overlap',
        status: 'yellow',
        title: 'ช่วงโครงสร้างตรงกับฤดูฝน',
        detail: `งานโครงสร้าง/ฐานรากตรงกับฤดูฝนในเดือน ${monthNames.join(', ')}`,
        recommendation: 'เตรียมแผนป้องกันฝนสำหรับงานเทคอนกรีต/ผูกเหล็กในช่วงเดือนดังกล่าว',
        auto_generated: true,
        checked_at: now.toISOString(),
      }));
    }
  }

  // เก็บ check ที่ user เพิ่มเอง (auto_generated: false) ไว้ตามเดิม
  const manualChecks = (existingChecks || []).filter(c => !c.auto_generated);

  return [...manualChecks, ...autoChecks];
}

// ─────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────

function loadExistingReadiness() {
  try {
    const raw = localStorage.getItem(projectStorageKey(STORAGE_KEYS.readiness));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * รันทุก engine ตามลำดับ พร้อม callback แจ้งความคืบหน้าทีละ step
 * (ใช้ delay สั้นๆ ระหว่าง step เพื่อให้เห็นว่ากำลังคำนวณ "ทีละขั้น")
 *
 * @param {(stepLabel: string, stepIndex: number, totalSteps: number) => void} onProgress
 * @returns {Promise<{boq, bbs, schedule, resources, readiness, totals}>}
 */
export async function runPipeline(onProgress = () => {}) {
  const STEPS = [
    'อ่านข้อมูลแบบ (drawing elements + beam library)',
    'คำนวณ BOQ',
    'สร้าง BBS (ตารางตัด-ดัดเหล็ก)',
    'วางแผนงานก่อสร้าง (Planner)',
    'ประเมินทรัพยากร (Resource Hub)',
    'อัปเดต Readiness Check',
  ];
  const total = STEPS.length;

  onProgress(STEPS[0], 1, total);
  await sleep(250);
  const { project, elements, beamLibraryById } = getInputData();

  onProgress(STEPS[1], 2, total);
  await sleep(250);
  const boq = computeBOQ(elements, beamLibraryById, project);
  localStorage.setItem(projectStorageKey(STORAGE_KEYS.boq), JSON.stringify(boq));

  onProgress(STEPS[2], 3, total);
  await sleep(250);
  const bbs = computeBBS(elements, beamLibraryById, boq, project);
  localStorage.setItem(projectStorageKey(STORAGE_KEYS.bbs), JSON.stringify(bbs));

  onProgress(STEPS[3], 4, total);
  await sleep(250);
  const schedule = computeSchedule(elements, boq, project);
  localStorage.setItem(projectStorageKey(STORAGE_KEYS.schedule), JSON.stringify(schedule));

  onProgress(STEPS[4], 5, total);
  await sleep(250);
  const resources = computeResources(boq, schedule, project);
  localStorage.setItem(projectStorageKey(STORAGE_KEYS.resources), JSON.stringify(resources));

  onProgress(STEPS[5], 6, total);
  await sleep(250);
  const readiness = computeReadiness(elements, boq, bbs, schedule, project, loadExistingReadiness());
  localStorage.setItem(projectStorageKey(STORAGE_KEYS.readiness), JSON.stringify(readiness));

  const totals = {
    concrete_m3: parseFloat(boq.filter(b => b.work_category === 'concrete').reduce((s, b) => s + b.quantity, 0).toFixed(2)),
    rebar_kg: parseFloat(boq.filter(b => b.work_category === 'rebar').reduce((s, b) => s + b.quantity, 0).toFixed(2)),
    formwork_m2: parseFloat(boq.filter(b => b.work_category === 'formwork').reduce((s, b) => s + b.quantity, 0).toFixed(2)),
    boq_amount_thb: parseFloat(boq.reduce((s, b) => s + (b.amount_thb || 0), 0).toFixed(2)),
    resource_amount_thb: parseFloat(resources.reduce((s, r) => s + (r.total_cost_thb || 0), 0).toFixed(2)),
    schedule_days: parseFloat(schedule.reduce((s, t) => s + (t.adjusted_duration_days || 0), 0).toFixed(1)),
    project_end_date: schedule.length ? schedule[schedule.length - 1].end_date : null,
  };

  window.dispatchEvent(new CustomEvent(PIPELINE_EVENT, { detail: { boq, bbs, schedule, resources, readiness, totals, reason: 'full-run' } }));

  return { boq, bbs, schedule, resources, readiness, totals };
}
