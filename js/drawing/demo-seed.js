/**
 * demo-seed.js — Constistant Developer Demo Data
 *
 * โครงการ: บ้านพักอาศัย 2 ชั้น ซอยลาดพร้าว 71 กรุงเทพฯ
 * เจ้าของ: คุณวิชัย สุขสมบัติ
 * พื้นที่: 150 m² ต่อชั้น (รวม 300 m²)
 * โครงสร้าง: RC — เสา คาน พื้น คอนกรีตเสริมเหล็ก
 *
 * วัตถุประสงค์:
 *   - ใช้ทดสอบ data flow ระหว่าง feature engine
 *   - ใช้ dev demo โดยไม่กระทบ production data
 *   - แสดงให้เห็นว่า output ของ engine A คือ input ของ engine B
 *
 * วิธีใช้:
 *   import { getDemoProject, getDemoDataByEngine, simulateFlow } from './demo-seed.js';
 *
 * ไม่ต้อง import ไฟล์นี้ในโค้ดหลัก — ใช้เฉพาะ dev / demo เท่านั้น
 */

import {
  createProject,
  createDrawingUpload,
  createBeamLibraryEntry,
  createDrawingElement,
  createBOQItem,
  createBBSItem,
  createScheduleTask,
  createWeatherSnapshot,
  createResourceItem,
  createSupplier,
  createPayrollEntry,
  createReadinessCheck,
  calcRebarWeight,
  calcAdjustedDuration,
  REBAR_UNIT_WEIGHT,
} from './schema.js';

// ─────────────────────────────────────────────
// TIER 0: PROJECT
// ─────────────────────────────────────────────

const PROJECT = createProject({
  id: 'demo-project-001',
  user_id: 'demo-user-001',
  name: 'บ้านพักอาศัย 2 ชั้น ลาดพร้าว 71',
  client_name: 'คุณวิชัย สุขสมบัติ',
  location_lat: 13.8021,
  location_lng: 100.5812,
  location_label: 'กรุงเทพฯ เขตลาดพร้าว',
  start_date: '2025-09-01',
  building_type: 'residential',
  floors_above_ground: 2,
  floors_below_ground: 0,
  total_area_sqm: 300,
  status: 'active',
  created_at: '2025-08-15T09:00:00Z',
});

// ─────────────────────────────────────────────
// TIER 1: DRAWING UPLOADS
// ─────────────────────────────────────────────
// สมมุติว่า user upload 2 ไฟล์:
//   - ไฟล์ section detail sheets (Pass 1 ของ Gemini)
//   - ไฟล์ floor plan (Pass 2 ของ Gemini)

const DRAWING_SECTION = createDrawingUpload({
  id: 'demo-drawing-001',
  project_id: PROJECT.id,
  file_name: 'structural_section_details.pdf',
  file_url: 'https://storage.supabase.co/demo/structural_section_details.pdf',
  drawing_type: 'section_detail',
  page_count: 4,
  extraction_status: 'done',
  created_at: '2025-08-15T09:05:00Z',
});

const DRAWING_FLOORPLAN = createDrawingUpload({
  id: 'demo-drawing-002',
  project_id: PROJECT.id,
  file_name: 'structural_floor_plan.pdf',
  file_url: 'https://storage.supabase.co/demo/structural_floor_plan.pdf',
  drawing_type: 'floor_plan',
  page_count: 3,
  extraction_status: 'done',
  created_at: '2025-08-15T09:06:00Z',
});

// ─────────────────────────────────────────────
// TIER 2A: BEAM LIBRARY (Gemini Pass 1 output)
// ─────────────────────────────────────────────
// Gemini อ่าน section detail sheets แล้วสร้าง library
// ข้อมูลนี้ simulate ว่า AI อ่านออกมาแล้ว

const BEAM_LIB = {

  B1: createBeamLibraryEntry({
    id: 'lib-B1',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_SECTION.id,
    element_id: 'B1',
    element_type: 'beam',
    floor_applicable: 'all',
    width_mm: 200,
    height_mm: 400,
    main_bar_count: 4,
    main_bar_dia_mm: 16,
    main_bar_type: 'DB',
    stirrup_dia_mm: 6,
    stirrup_type: 'RB',
    stirrup_spacing_mm: 200,
    stirrup_spacing_dense_mm: 100,
    stirrup_dense_zone_mm: 400,
    concrete_grade: 'M250',
    steel_grade: 'SD30',
    confidence_score: 0.92,
    confidence_flags: [],
  }),

  B2: createBeamLibraryEntry({
    id: 'lib-B2',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_SECTION.id,
    element_id: 'B2',
    element_type: 'beam',
    floor_applicable: 'all',
    width_mm: 150,
    height_mm: 300,
    main_bar_count: 3,
    main_bar_dia_mm: 12,
    main_bar_type: 'DB',
    stirrup_dia_mm: 6,
    stirrup_type: 'RB',
    stirrup_spacing_mm: 200,
    stirrup_spacing_dense_mm: 100,
    stirrup_dense_zone_mm: 300,
    concrete_grade: 'M250',
    steel_grade: 'SD30',
    confidence_score: 0.88,
    confidence_flags: ['stirrup_spacing_estimated'],
  }),

  C1: createBeamLibraryEntry({
    id: 'lib-C1',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_SECTION.id,
    element_id: 'C1',
    element_type: 'column',
    floor_applicable: 'all',
    width_mm: 300,
    height_mm: 300,
    main_bar_count: 8,
    main_bar_dia_mm: 16,
    main_bar_type: 'DB',
    stirrup_dia_mm: 6,
    stirrup_type: 'RB',
    stirrup_spacing_mm: 200,
    stirrup_spacing_dense_mm: 100,
    stirrup_dense_zone_mm: 450,
    concrete_grade: 'M250',
    steel_grade: 'SD30',
    confidence_score: 0.95,
    confidence_flags: [],
  }),

  S1: createBeamLibraryEntry({
    id: 'lib-S1',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_SECTION.id,
    element_id: 'S1',
    element_type: 'slab',
    floor_applicable: 'F2',
    width_mm: null,           // slab ไม่มี width — ใช้ floor_area แทน
    height_mm: 120,           // ความหนาพื้น 120mm
    main_bar_dia_mm: 9,
    main_bar_type: 'DB',
    stirrup_dia_mm: null,
    stirrup_type: null,
    stirrup_spacing_mm: 200,  // ระยะเรียงเหล็กพื้น
    concrete_grade: 'M250',
    steel_grade: 'SD30',
    confidence_score: 0.90,
    confidence_flags: [],
  }),

};

// ─────────────────────────────────────────────
// TIER 2B: DRAWING ELEMENTS (Gemini Pass 2 output)
// ─────────────────────────────────────────────
// Gemini อ่าน floor plan พร้อม beam library เป็น context
// แล้วนับจำนวน element ต่อชั้น

const ELEMENTS = {

  // ชั้น 1
  C1_F1: createDrawingElement({
    id: 'elem-C1-F1',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_FLOORPLAN.id,
    beam_library_id: BEAM_LIB.C1.id,
    floor_level: 'F1',
    floor_area_sqm: 150,
    element_id: 'C1',
    element_type: 'column',
    grid_refs: ['A-1','A-2','A-3','B-1','B-2','B-3','C-1','C-2','C-3'],
    count: 9,
    span_length_m: null,
    confidence_score: 0.94,
    confidence_flags: [],
  }),

  B1_F1: createDrawingElement({
    id: 'elem-B1-F1',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_FLOORPLAN.id,
    beam_library_id: BEAM_LIB.B1.id,
    floor_level: 'F1',
    floor_area_sqm: 150,
    element_id: 'B1',
    element_type: 'beam',
    grid_refs: ['A/1-2','A/2-3','B/1-2','B/2-3','C/1-2','C/2-3'],
    count: 6,
    span_length_m: 4.5,
    confidence_score: 0.89,
    confidence_flags: [],
  }),

  B2_F1: createDrawingElement({
    id: 'elem-B2-F1',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_FLOORPLAN.id,
    beam_library_id: BEAM_LIB.B2.id,
    floor_level: 'F1',
    floor_area_sqm: 150,
    element_id: 'B2',
    element_type: 'beam',
    grid_refs: ['1/A-B','1/B-C','3/A-B','3/B-C'],
    count: 4,
    span_length_m: 4.0,
    confidence_score: 0.85,
    confidence_flags: ['count_uncertain'],  // Gemini ไม่แน่ใจระหว่าง 4 กับ 5
  }),

  // ชั้น 2
  C1_F2: createDrawingElement({
    id: 'elem-C1-F2',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_FLOORPLAN.id,
    beam_library_id: BEAM_LIB.C1.id,
    floor_level: 'F2',
    floor_area_sqm: 150,
    element_id: 'C1',
    element_type: 'column',
    grid_refs: ['A-1','A-2','A-3','B-1','B-2','B-3','C-1','C-2','C-3'],
    count: 9,
    span_length_m: null,
    confidence_score: 0.94,
    confidence_flags: [],
  }),

  B1_F2: createDrawingElement({
    id: 'elem-B1-F2',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_FLOORPLAN.id,
    beam_library_id: BEAM_LIB.B1.id,
    floor_level: 'F2',
    floor_area_sqm: 150,
    element_id: 'B1',
    element_type: 'beam',
    grid_refs: ['A/1-2','A/2-3','B/1-2','B/2-3','C/1-2','C/2-3'],
    count: 6,
    span_length_m: 4.5,
    confidence_score: 0.89,
    confidence_flags: [],
  }),

  S1_F2: createDrawingElement({
    id: 'elem-S1-F2',
    project_id: PROJECT.id,
    drawing_upload_id: DRAWING_FLOORPLAN.id,
    beam_library_id: BEAM_LIB.S1.id,
    floor_level: 'F2',
    floor_area_sqm: 150,
    element_id: 'S1',
    element_type: 'slab',
    grid_refs: [],   // slab ครอบทั้งชั้น ไม่แยก grid
    count: 1,
    span_length_m: null,
    confidence_score: 0.90,
    confidence_flags: [],
  }),

};

// ─────────────────────────────────────────────
// TIER 3A: BOQ ITEMS (computed จาก drawing elements)
// ─────────────────────────────────────────────
// สูตร: Volume = count × ขนาดหน้าตัด × span_length
// ราคาต่อหน่วย: อ้างอิงจาก กระทรวงพาณิชย์ + ราคาตลาดปัจจุบัน

const BOQ_ITEMS = {

  // คอนกรีตเสา F1: 9 ต้น × (0.3 × 0.3) m² × 3.0m สูง
  concrete_col_F1: createBOQItem({
    id: 'boq-concrete-col-F1',
    project_id: PROJECT.id,
    drawing_element_id: ELEMENTS.C1_F1.id,
    item_code: 'STR-COL-CON-F1',
    description: 'คอนกรีตเทเสา C1 ชั้น 1 (300×300mm) จำนวน 9 ต้น สูง 3.0m',
    work_category: 'concrete',
    unit: 'm3',
    quantity: parseFloat((9 * 0.3 * 0.3 * 3.0).toFixed(3)),  // 2.430 m3
    unit_rate_thb: 4500,
    amount_thb: parseFloat((9 * 0.3 * 0.3 * 3.0 * 4500).toFixed(2)),
    floor_level: 'F1',
    element_type: 'column',
  }),

  // คอนกรีตคาน B1 F1: 6 คาน × (0.2 × 0.4) m² × 4.5m
  concrete_beam_B1_F1: createBOQItem({
    id: 'boq-concrete-B1-F1',
    project_id: PROJECT.id,
    drawing_element_id: ELEMENTS.B1_F1.id,
    item_code: 'STR-BM-CON-F1-B1',
    description: 'คอนกรีตเทคาน B1 ชั้น 1 (200×400mm) จำนวน 6 ช่วง ยาว 4.5m',
    work_category: 'concrete',
    unit: 'm3',
    quantity: parseFloat((6 * 0.2 * 0.4 * 4.5).toFixed(3)),  // 2.160 m3
    unit_rate_thb: 4500,
    amount_thb: parseFloat((6 * 0.2 * 0.4 * 4.5 * 4500).toFixed(2)),
    floor_level: 'F1',
    element_type: 'beam',
  }),

  // คอนกรีตพื้น S1 F2: พื้นที่ 150 m² × หนา 0.12m
  concrete_slab_F2: createBOQItem({
    id: 'boq-concrete-slab-F2',
    project_id: PROJECT.id,
    drawing_element_id: ELEMENTS.S1_F2.id,
    item_code: 'STR-SLB-CON-F2',
    description: 'คอนกรีตเทพื้น S1 ชั้น 2 (หนา 120mm) พื้นที่ 150 m²',
    work_category: 'concrete',
    unit: 'm3',
    quantity: parseFloat((150 * 0.12).toFixed(3)),  // 18.000 m3
    unit_rate_thb: 4200,
    amount_thb: parseFloat((150 * 0.12 * 4200).toFixed(2)),
    floor_level: 'F2',
    element_type: 'slab',
  }),

  // เหล็กเสา C1 F1: 9 ต้น × 8 เส้น DB16 สูง 3.0m (+ lap splice 40d = 40×16mm = 640mm)
  rebar_col_main_F1: createBOQItem({
    id: 'boq-rebar-col-main-F1',
    project_id: PROJECT.id,
    drawing_element_id: ELEMENTS.C1_F1.id,
    item_code: 'STR-COL-RB-MAIN-F1',
    description: 'เหล็กแกนเสา C1 ชั้น 1 — DB16 (8 เส้น/ต้น, 9 ต้น)',
    work_category: 'rebar',
    unit: 'kg',
    quantity: calcRebarWeight(16, 9 * 8 * (3.0 + 0.64)),  // 9ต้น × 8เส้น × (3.0+lap) m
    unit_rate_thb: 34,  // THB/kg — ราคาตลาดมิ.ย. 2568
    get amount_thb() { return parseFloat((this.quantity * this.unit_rate_thb).toFixed(2)); },
    floor_level: 'F1',
    element_type: 'column',
  }),

  // เหล็กแบบหล่อ (Formwork) เสา F1
  formwork_col_F1: createBOQItem({
    id: 'boq-formwork-col-F1',
    project_id: PROJECT.id,
    drawing_element_id: ELEMENTS.C1_F1.id,
    item_code: 'STR-COL-FW-F1',
    description: 'แบบหล่อเสา C1 ชั้น 1 (9 ต้น × เส้นรอบ 1.2m × 3.0m)',
    work_category: 'formwork',
    unit: 'm2',
    quantity: parseFloat((9 * (4 * 0.3) * 3.0).toFixed(2)),  // 32.40 m2
    unit_rate_thb: 280,
    get amount_thb() { return parseFloat((this.quantity * this.unit_rate_thb).toFixed(2)); },
    floor_level: 'F1',
    element_type: 'column',
  }),

};

// ─────────────────────────────────────────────
// TIER 3B: BBS ITEMS (computed จาก BOQ + Beam Library)
// ─────────────────────────────────────────────

const BBS_ITEMS = {

  // เหล็กแกนเสา C1 ชั้น 1
  col_main_T1: createBBSItem({
    id: 'bbs-col-C1-F1-T1',
    project_id: PROJECT.id,
    boq_item_id: BOQ_ITEMS.rebar_col_main_F1.id,
    member_id: '1C1',          // เสา C1 ชั้น 1
    bar_mark: 'T1',
    bar_type: 'DB',
    steel_grade: 'SD30',
    diameter_mm: 16,
    shape_code: '00',          // เหล็กตรง
    bend_a_mm: null,
    cut_length_mm: 3640,       // 3000 + 640 (lap 40d)
    num_members: 9,
    bars_per_member: 8,
    total_bars: 72,
    total_length_m: parseFloat((72 * 3.640).toFixed(3)),
    unit_weight_kg_per_m: REBAR_UNIT_WEIGHT[16],
    total_weight_kg: calcRebarWeight(16, 72 * 3.640),
  }),

  // เหล็กปลอกเสา C1 ชั้น 1 (dense zone)
  col_stirrup_dense: createBBSItem({
    id: 'bbs-col-C1-F1-stir-dense',
    project_id: PROJECT.id,
    boq_item_id: BOQ_ITEMS.rebar_col_main_F1.id,
    member_id: '1C1',
    bar_mark: 'T2',
    bar_type: 'RB',
    steel_grade: 'SR24',
    diameter_mm: 6,
    shape_code: '38',          // ปลอกสี่เหลี่ยม
    bend_a_mm: 260,            // ขาในแนวนอน (300 - 2×20 cover)
    bend_b_mm: 260,            // ขาในแนวตั้ง
    cut_length_mm: 1160,       // 4×(260+30hook) = เส้นรอบปลอก + hook
    num_members: 9,
    // dense zone: top 450mm → 450/100 = 5 ปลอก, bottom 450mm → 5 ปลอก
    bars_per_member: 10,
    total_bars: 90,
    total_length_m: parseFloat((90 * 1.160).toFixed(3)),
    unit_weight_kg_per_m: REBAR_UNIT_WEIGHT[6],
    total_weight_kg: calcRebarWeight(6, 90 * 1.160),
  }),

  // เหล็กปลอกเสา C1 ชั้น 1 (ช่วงกลาง)
  col_stirrup_normal: createBBSItem({
    id: 'bbs-col-C1-F1-stir-normal',
    project_id: PROJECT.id,
    boq_item_id: BOQ_ITEMS.rebar_col_main_F1.id,
    member_id: '1C1',
    bar_mark: 'T3',
    bar_type: 'RB',
    steel_grade: 'SR24',
    diameter_mm: 6,
    shape_code: '38',
    bend_a_mm: 260,
    bend_b_mm: 260,
    cut_length_mm: 1160,
    num_members: 9,
    // ช่วงกลาง: (3000 - 450 - 450) = 2100mm → 2100/200 = 11 ปลอก
    bars_per_member: 11,
    total_bars: 99,
    total_length_m: parseFloat((99 * 1.160).toFixed(3)),
    unit_weight_kg_per_m: REBAR_UNIT_WEIGHT[6],
    total_weight_kg: calcRebarWeight(6, 99 * 1.160),
  }),

};

// ─────────────────────────────────────────────
// TIER 4: SCHEDULE TASKS (computed จาก BOQ)
// ─────────────────────────────────────────────
// ใช้ Algorithm จาก research4:
//   Duration = Quantity / (Crew × Productivity) × WeatherFactor

const SCHEDULE_TASKS = {

  // งานเหล็กเสาชั้น 1
  rebar_col_F1: createScheduleTask({
    id: 'task-rebar-col-F1',
    project_id: PROJECT.id,
    boq_item_id: BOQ_ITEMS.rebar_col_main_F1.id,
    wbs_code: '2.1.1',
    activity_name: 'Column Rebar — F1',
    work_category: 'structural',
    floor_level: 'F1',
    quantity: BOQ_ITEMS.rebar_col_main_F1.quantity,
    unit: 'kg',
    crew_size: 2,              // steel fixers
    productivity_rate: 225,    // 225 kg/fixer/day
    // base: ~quantity / (2 × 225) ≈ 1.3 วัน
    base_duration_days: parseFloat((BOQ_ITEMS.rebar_col_main_F1.quantity / (2 * 225)).toFixed(1)),
    weather_buffer_factor: 0.10,  // กันยายน กทม.
    get adjusted_duration_days() {
      return calcAdjustedDuration(this.base_duration_days, 9);
    },
    start_date: '2025-09-01',
    end_date: '2025-09-02',
    predecessor_task_ids: [],
    lag_days: 0,
    is_critical: true,
    material_order_date: '2025-08-25',   // 7 วันก่อน start
    material_lead_time_days: 7,
  }),

  // งานแบบหล่อเสาชั้น 1
  formwork_col_F1: createScheduleTask({
    id: 'task-fw-col-F1',
    project_id: PROJECT.id,
    boq_item_id: BOQ_ITEMS.formwork_col_F1.id,
    wbs_code: '2.1.2',
    activity_name: 'Column Formwork — F1',
    work_category: 'structural',
    floor_level: 'F1',
    quantity: BOQ_ITEMS.formwork_col_F1.quantity,
    unit: 'm2',
    crew_size: 2,
    productivity_rate: 20,    // 20 m2/crew/day
    base_duration_days: parseFloat((BOQ_ITEMS.formwork_col_F1.quantity / (2 * 20)).toFixed(1)),
    weather_buffer_factor: 0.10,
    get adjusted_duration_days() {
      return calcAdjustedDuration(this.base_duration_days, 9);
    },
    start_date: '2025-09-02',
    end_date: '2025-09-03',
    predecessor_task_ids: ['task-rebar-col-F1'],
    lag_days: 0,
    is_critical: true,
    material_order_date: '2025-08-28',
    material_lead_time_days: 5,
  }),

  // งานเทคอนกรีตเสาชั้น 1
  concrete_col_F1: createScheduleTask({
    id: 'task-concrete-col-F1',
    project_id: PROJECT.id,
    boq_item_id: BOQ_ITEMS.concrete_col_F1.id,
    wbs_code: '2.1.3',
    activity_name: 'Column Concrete Pour — F1',
    work_category: 'structural',
    floor_level: 'F1',
    quantity: BOQ_ITEMS.concrete_col_F1.quantity,
    unit: 'm3',
    crew_size: 5,              // 1 mason + 4 helpers
    productivity_rate: 12,     // 12 m3/crew/day (pump)
    base_duration_days: parseFloat((BOQ_ITEMS.concrete_col_F1.quantity / 12).toFixed(1)),
    weather_buffer_factor: 0.10,
    get adjusted_duration_days() {
      return calcAdjustedDuration(this.base_duration_days, 9);
    },
    start_date: '2025-09-03',
    end_date: '2025-09-03',
    predecessor_task_ids: ['task-fw-col-F1'],
    lag_days: 0,
    is_critical: true,
    // Cure lag: รอ 3 วันก่อนเริ่มงานถัดไป
    material_order_date: '2025-09-02',   // สั่งวันก่อนเท
    material_lead_time_days: 1,
  }),

  // รอคอนกรีตแข็งตัว → เริ่มคานชั้น 2
  beam_rebar_F2: createScheduleTask({
    id: 'task-rebar-beam-F2',
    project_id: PROJECT.id,
    boq_item_id: BOQ_ITEMS.concrete_beam_B1_F1.id,
    wbs_code: '2.2.1',
    activity_name: 'Beam Rebar — F2',
    work_category: 'structural',
    floor_level: 'F2',
    quantity: 580,             // kg — placeholder รวม B1+B2 F2
    unit: 'kg',
    crew_size: 2,
    productivity_rate: 200,
    base_duration_days: parseFloat((580 / (2 * 200)).toFixed(1)),
    weather_buffer_factor: 0.10,
    get adjusted_duration_days() {
      return calcAdjustedDuration(this.base_duration_days, 9);
    },
    start_date: '2025-09-06',   // หลัง cure 3 วัน
    end_date: '2025-09-08',
    predecessor_task_ids: ['task-concrete-col-F1'],
    lag_days: 3,                // concrete cure lag
    is_critical: true,
    material_order_date: '2025-08-30',
    material_lead_time_days: 7,
  }),

};

// ─────────────────────────────────────────────
// TIER 4B: WEATHER SNAPSHOTS
// ─────────────────────────────────────────────

const WEATHER_SNAPSHOTS = {

  snap_sep: createWeatherSnapshot({
    id: 'weather-snap-sep',
    project_id: PROJECT.id,
    schedule_task_id: SCHEDULE_TASKS.concrete_col_F1.id,
    location_lat: PROJECT.location_lat,
    location_lng: PROJECT.location_lng,
    snapshot_date: '2025-08-15',
    month_of_work: 9,
    avg_rain_days_per_month: 18,   // กทม. กันยายน historical
    rain_delay_days: 3.6,          // 18 วัน × 0.20 impact factor
    adjusted_end_date: '2025-09-07',
    data_source: 'open-meteo',
  }),

};

// ─────────────────────────────────────────────
// TIER 5A: RESOURCE ITEMS
// ─────────────────────────────────────────────

const DEMO_SUPPLIER = createSupplier({
  id: 'supplier-001',
  project_id: PROJECT.id,
  name: 'บริษัท เหล็กดีไทย จำกัด',
  material_types: ['rebar'],
  region: 'bangkok',
  contact_phone: '02-xxx-xxxx',
  contact_line: '@steelthai',
  credit_days: 30,
  min_order_ton: 2,
});

const RESOURCE_ITEMS = {

  steel_fixer: createResourceItem({
    id: 'res-steelfixer',
    project_id: PROJECT.id,
    schedule_task_id: SCHEDULE_TASKS.rebar_col_F1.id,
    resource_type: 'manpower',
    name: 'steel fixer (ช่างเหล็ก)',
    unit: 'person-day',
    quantity: SCHEDULE_TASKS.rebar_col_F1.crew_size
              * SCHEDULE_TASKS.rebar_col_F1.base_duration_days,
    unit_cost_thb: 550,       // ค่าแรงรายวัน THB (research5)
    get total_cost_thb() { return parseFloat((this.quantity * this.unit_cost_thb).toFixed(2)); },
    supplier_id: null,
  }),

  rebar_DB16: createResourceItem({
    id: 'res-rebar-DB16',
    project_id: PROJECT.id,
    schedule_task_id: SCHEDULE_TASKS.rebar_col_F1.id,
    resource_type: 'material',
    name: 'เหล็กข้ออ้อย DB16 (SD30)',
    unit: 'kg',
    quantity: BBS_ITEMS.col_main_T1.total_weight_kg,
    unit_cost_thb: 34,        // THB/kg มิ.ย. 2568
    get total_cost_thb() { return parseFloat((this.quantity * this.unit_cost_thb).toFixed(2)); },
    supplier_id: DEMO_SUPPLIER.id,
  }),

};

const PAYROLL = {

  steel_fixer_day1: createPayrollEntry({
    id: 'payroll-001',
    project_id: PROJECT.id,
    resource_item_id: RESOURCE_ITEMS.steel_fixer.id,
    worker_name: 'นายสมชาย รักงาน',
    work_date: '2025-09-01',
    regular_hours: 8,
    ot_hours: 2,
    daily_rate_thb: 550,
    ot_multiplier: 1.5,
    total_pay_thb: parseFloat((550 + 2 * (550 / 8) * 1.5).toFixed(2)),
    sso_deduction_thb: parseFloat((550 * 0.05).toFixed(2)),
    get net_pay_thb() {
      return parseFloat((this.total_pay_thb - this.sso_deduction_thb).toFixed(2));
    },
  }),

};

// ─────────────────────────────────────────────
// TIER 5B: READINESS CHECKS (RAG Status)
// ─────────────────────────────────────────────

const READINESS_CHECKS = {

  permit: createReadinessCheck({
    id: 'check-permit',
    project_id: PROJECT.id,
    check_type: 'permit',
    status: 'yellow',
    title: 'ใบอนุญาตก่อสร้าง',
    detail: 'ยื่นคำขอแล้ว — รอผลพิจารณาจากเขตลาดพร้าว (เป้าหมาย 14 วัน)',
    recommendation: 'ติดตาม BMA OSS ทุก 3 วัน เริ่มงานได้ก่อนถ้าเป็นงานที่ไม่ต้องการใบอนุญาต',
    linked_entity_type: null,
    linked_entity_id: null,
    checked_at: '2025-08-15T09:00:00Z',
  }),

  drawing_complete: createReadinessCheck({
    id: 'check-drawing',
    project_id: PROJECT.id,
    check_type: 'drawing_complete',
    status: 'green',
    title: 'แบบแปลนครบถ้วน',
    detail: 'Gemini อ่านครบ — beam library 4 types, drawing elements 6 items, confidence > 0.85 ทุกรายการ',
    recommendation: 'ตรวจสอบ count_uncertain flag ของ B2 F1 ก่อนสั่งเหล็ก',
    linked_entity_type: 'drawing_upload',
    linked_entity_id: DRAWING_FLOORPLAN.id,
    checked_at: '2025-08-15T09:10:00Z',
  }),

  bbs_ready: createReadinessCheck({
    id: 'check-bbs',
    project_id: PROJECT.id,
    check_type: 'bbs_ready',
    status: 'green',
    title: 'BBS พร้อมก่อนเริ่มผูกเหล็ก',
    detail: 'BBS เสา C1 ชั้น 1 ครบถ้วน — T1 (แกน), T2 (ปลอก dense), T3 (ปลอกปกติ)',
    recommendation: 'ส่งไฟล์ BBS ให้โรงงานตัดดัดเหล็กก่อน material_order_date (2025-08-25)',
    linked_entity_type: 'schedule_task',
    linked_entity_id: SCHEDULE_TASKS.rebar_col_F1.id,
    checked_at: '2025-08-15T09:10:00Z',
  }),

  weather_risk: createReadinessCheck({
    id: 'check-weather',
    project_id: PROJECT.id,
    check_type: 'weather_risk',
    status: 'yellow',
    title: 'ความเสี่ยงฝนช่วงโครงสร้าง',
    detail: 'กันยายน กทม. มีฝนเฉลี่ย 18 วัน/เดือน — เพิ่ม weather buffer 10% ใน schedule แล้ว',
    recommendation: 'เตรียมผ้าใบคลุมคอนกรีตสด และ สั่งปูนเผื่อ 5% สำหรับงานที่อาจต้องเทซ้ำ',
    linked_entity_type: 'schedule_task',
    linked_entity_id: SCHEDULE_TASKS.concrete_col_F1.id,
    checked_at: '2025-08-15T09:10:00Z',
  }),

  material_lead: createReadinessCheck({
    id: 'check-material',
    project_id: PROJECT.id,
    check_type: 'material_lead',
    status: 'red',
    title: 'สั่งเหล็กทันก่อน Activity',
    detail: 'material_order_date สำหรับ Column Rebar F1 คือ 2025-08-25 — เหลือเวลา 10 วัน',
    recommendation: 'ติดต่อ "บริษัท เหล็กดีไทย" ทันที และยืนยัน min_order 2 ton ก่อนสิ้นสัปดาห์นี้',
    linked_entity_type: 'schedule_task',
    linked_entity_id: SCHEDULE_TASKS.rebar_col_F1.id,
    checked_at: '2025-08-15T09:10:00Z',
  }),

};

// ─────────────────────────────────────────────
// PUBLIC API — วิธีที่ module อื่นเรียกใช้ข้อมูล
// ─────────────────────────────────────────────

/**
 * ดึงข้อมูลโปรเจกต์ทั้งหมดในโครงสร้างเดียว
 * @returns {object} — ทุก entity ในโปรเจกต์
 */
export function getDemoProject() {
  return {
    project: PROJECT,
    drawings: { section: DRAWING_SECTION, floor_plan: DRAWING_FLOORPLAN },
    beam_library: BEAM_LIB,
    drawing_elements: ELEMENTS,
    boq_items: BOQ_ITEMS,
    bbs_items: BBS_ITEMS,
    schedule_tasks: SCHEDULE_TASKS,
    weather_snapshots: WEATHER_SNAPSHOTS,
    suppliers: { main: DEMO_SUPPLIER },
    resource_items: RESOURCE_ITEMS,
    payroll: PAYROLL,
    readiness_checks: READINESS_CHECKS,
  };
}

/**
 * ดึงข้อมูลแยกตาม feature engine
 * ใช้สำหรับ dev ที่ทำแค่ engine เดียวและต้องการ mock input
 *
 * @param {'drawing' | 'quantitake' | 'planner' | 'resource' | 'readiness'} engine
 */
export function getDemoDataByEngine(engine) {
  switch (engine) {

    case 'drawing':
      return {
        // INPUT ของ Drawing Intelligence
        uploads: [DRAWING_SECTION, DRAWING_FLOORPLAN],
        // OUTPUT ที่ engine นี้ต้องสร้าง
        expected_beam_library: Object.values(BEAM_LIB),
        expected_elements: Object.values(ELEMENTS),
      };

    case 'quantitake':
      return {
        // INPUT: drawing elements + beam library (จาก Drawing Intelligence)
        drawing_elements: Object.values(ELEMENTS),
        beam_library: Object.values(BEAM_LIB),
        // OUTPUT ที่ engine นี้ต้องสร้าง
        expected_boq: Object.values(BOQ_ITEMS),
        expected_bbs: Object.values(BBS_ITEMS),
      };

    case 'planner':
      return {
        // INPUT: BOQ items (จาก QuantiTake)
        boq_items: Object.values(BOQ_ITEMS),
        project_location: { lat: PROJECT.location_lat, lng: PROJECT.location_lng },
        project_start_date: PROJECT.start_date,
        // OUTPUT ที่ engine นี้ต้องสร้าง
        expected_tasks: Object.values(SCHEDULE_TASKS),
        expected_weather: Object.values(WEATHER_SNAPSHOTS),
      };

    case 'resource':
      return {
        // INPUT: schedule tasks (จาก Planner)
        schedule_tasks: Object.values(SCHEDULE_TASKS),
        bbs_items: Object.values(BBS_ITEMS),
        // OUTPUT ที่ engine นี้ต้องสร้าง
        expected_resources: Object.values(RESOURCE_ITEMS),
        expected_payroll: Object.values(PAYROLL),
        suppliers: [DEMO_SUPPLIER],
      };

    case 'readiness':
      return {
        // INPUT: ทุก engine (Readiness Check อ่านจากทุกอย่าง)
        project: PROJECT,
        drawings: [DRAWING_SECTION, DRAWING_FLOORPLAN],
        drawing_elements: Object.values(ELEMENTS),
        schedule_tasks: Object.values(SCHEDULE_TASKS),
        resource_items: Object.values(RESOURCE_ITEMS),
        // OUTPUT
        expected_checks: Object.values(READINESS_CHECKS),
      };

    default:
      throw new Error(`Unknown engine: ${engine}. Use 'drawing' | 'quantitake' | 'planner' | 'resource' | 'readiness'`);
  }
}

/**
 * แสดง data flow ทั้งหมดใน console (dev mode)
 * เรียกจาก browser console หรือ Node เพื่อดูว่า data ไหลยังไง
 */
export function simulateFlow() {
  const separator = (title) => console.log(`\n${'─'.repeat(50)}\n${title}\n${'─'.repeat(50)}`);

  separator('TIER 0 — PROJECT');
  console.log(`${PROJECT.name} (${PROJECT.floors_above_ground} ชั้น, ${PROJECT.total_area_sqm} m²)`);

  separator('TIER 1 — DRAWING UPLOADS');
  [DRAWING_SECTION, DRAWING_FLOORPLAN].forEach(d =>
    console.log(`[${d.extraction_status.toUpperCase()}] ${d.file_name} (${d.page_count} หน้า)`)
  );

  separator('TIER 2 — BEAM LIBRARY (Gemini Pass 1)');
  Object.values(BEAM_LIB).forEach(e =>
    console.log(`${e.element_id} (${e.element_type}) — ${e.width_mm}×${e.height_mm}mm | confidence: ${e.confidence_score}`)
  );

  separator('TIER 2 — DRAWING ELEMENTS (Gemini Pass 2)');
  Object.values(ELEMENTS).forEach(e =>
    console.log(`${e.element_id} ${e.floor_level} — count: ${e.count} | flags: [${e.confidence_flags.join(', ')}]`)
  );

  separator('TIER 3 — BOQ ITEMS');
  Object.values(BOQ_ITEMS).forEach(b =>
    console.log(`${b.item_code} — ${b.quantity} ${b.unit} × ${b.unit_rate_thb} THB = ${b.amount_thb} THB`)
  );

  separator('TIER 3 — BBS ITEMS');
  Object.values(BBS_ITEMS).forEach(b =>
    console.log(`${b.member_id} ${b.bar_mark} — ${b.total_bars} เส้น DB${b.diameter_mm} | ${b.total_weight_kg} kg`)
  );

  separator('TIER 4 — SCHEDULE TASKS');
  Object.values(SCHEDULE_TASKS).forEach(t =>
    console.log(`[${t.wbs_code}] ${t.activity_name} — ${t.start_date} → ${t.end_date} | critical: ${t.is_critical}`)
  );

  separator('TIER 5 — READINESS CHECKS');
  Object.values(READINESS_CHECKS).forEach(c => {
    const icon = c.status === 'green' ? '🟢' : c.status === 'yellow' ? '🟡' : '🔴';
    console.log(`${icon} ${c.title}: ${c.detail.slice(0, 60)}...`);
  });

  separator('SUMMARY');
  const totalBOQ = Object.values(BOQ_ITEMS).reduce((sum, b) => sum + (b.amount_thb || 0), 0);
  const totalRebar = Object.values(BBS_ITEMS).reduce((sum, b) => sum + (b.total_weight_kg || 0), 0);
  console.log(`มูลค่า BOQ รวม: ${totalBOQ.toLocaleString()} THB`);
  console.log(`น้ำหนักเหล็กรวม (เสา C1 F1): ${totalRebar.toFixed(2)} kg`);
  console.log(`จำนวน Readiness checks: ${Object.values(READINESS_CHECKS).length} รายการ`);
  console.log(`RED alerts: ${Object.values(READINESS_CHECKS).filter(c => c.status === 'red').length} รายการ`);
}
