/**
 * schema.js — Constistant Shared Data Contract
 *
 * RULE: ห้ามสร้าง object shape เองในทุก module
 * ทุก module ต้อง import factory function จากไฟล์นี้เท่านั้น
 * การเปลี่ยน schema ทำที่นี่ที่เดียว แล้ว propagate ทั้งระบบ
 *
 * Dependency chain:
 *   projects
 *     └── drawing_uploads
 *           ├── beam_library        (Pass 1: section detail sheets)
 *           └── drawing_elements    (Pass 2: floor plan counts)
 *                 ├── boq_items
 *                 │     └── bbs_items
 *                 │           └── schedule_tasks
 *                 │                 ├── weather_snapshots
 *                 │                 └── resource_items
 *                 └── readiness_checks
 */

// ─────────────────────────────────────────────
// TIER 0: Core entities
// ─────────────────────────────────────────────

/**
 * Project — root container สำหรับทุก entity
 * @param {Partial<Project>} overrides
 * @returns {Project}
 */
export function createProject(overrides = {}) {
  return {
    id: null,                      // uuid (Supabase)
    user_id: null,                 // uuid — FK to auth.users
    name: '',                      // ชื่อโครงการ
    client_name: '',               // ชื่อเจ้าของโครงการ
    location_lat: null,            // float — สำหรับ Open-Meteo
    location_lng: null,            // float — สำหรับ Open-Meteo
    location_label: '',            // string — "กรุงเทพฯ เขตลาดพร้าว"
    start_date: null,              // ISO date string
    building_type: 'residential',  // 'residential' | 'commercial' | 'mixed'
    floors_above_ground: null,     // int — จำนวนชั้นเหนือดิน (auto-filled จาก drawing)
    floors_below_ground: 0,        // int — basement
    total_area_sqm: null,          // float — พื้นที่รวม (auto-filled)
    status: 'draft',               // 'draft' | 'active' | 'completed'
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// TIER 1: Drawing upload
// ─────────────────────────────────────────────

/**
 * DrawingUpload — ไฟล์ PDF ที่ user upload
 * @param {Partial<DrawingUpload>} overrides
 */
export function createDrawingUpload(overrides = {}) {
  return {
    id: null,                   // uuid
    project_id: null,           // uuid FK
    file_name: '',              // original filename
    file_url: '',               // Supabase storage URL
    drawing_type: null,         // 'floor_plan' | 'section_detail' | 'combined'
    page_count: null,           // int
    extraction_status: 'pending', // 'pending' | 'processing' | 'done' | 'failed'
    extraction_error: null,     // string — error message ถ้า failed
    created_at: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// TIER 2: Drawing Intelligence outputs
// ─────────────────────────────────────────────

/**
 * BeamLibraryEntry — output ของ Gemini Pass 1
 * อ่านจาก section detail sheets → สร้าง library ของ element types
 *
 * element_id เช่น "B1", "B2", "C1", "G1", "S1"
 * element_type: beam=คาน, column=เสา, girder=คานหลัก, slab=พื้น, footing=ฐานราก
 *
 * @param {Partial<BeamLibraryEntry>} overrides
 */
export function createBeamLibraryEntry(overrides = {}) {
  return {
    id: null,                   // uuid
    project_id: null,           // uuid FK
    drawing_upload_id: null,    // uuid FK
    element_id: '',             // "B1", "C1", "S1"
    element_type: null,         // 'beam' | 'column' | 'girder' | 'slab' | 'footing' | 'staircase'
    floor_applicable: 'all',    // 'all' | 'F1' | 'F2' | 'RF' — ชั้นที่ใช้
    // มิติหน้าตัด
    width_mm: null,             // float
    height_mm: null,            // float (depth สำหรับคาน)
    // เหล็กแกน (main bars)
    main_bar_count: null,       // int — จำนวนเหล็กแกน
    main_bar_dia_mm: null,      // float — เส้นผ่านศูนย์กลาง เช่น 16, 20, 25
    main_bar_type: 'DB',        // 'DB' | 'RB' — deformed bar / round bar
    // เหล็กปลอก (stirrups)
    stirrup_dia_mm: null,       // float — ขนาดเหล็กปลอก เช่น 6, 9
    stirrup_type: 'RB',         // 'RB' | 'DB'
    stirrup_spacing_mm: null,   // float — ระยะห่างปลอกปกติ
    stirrup_spacing_dense_mm: null, // float — ระยะห่างปลอกในโซน dense (ปลายคาน)
    stirrup_dense_zone_mm: null,    // float — ระยะโซน dense จากหน้าเสา
    // คอนกรีต
    concrete_grade: null,       // 'M200' | 'M250' | 'M300' — กำลังคอนกรีต (WSD)
    steel_grade: null,          // 'SR24' | 'SD30' | 'SD40'
    // ค่าความมั่นใจจาก Gemini
    confidence_score: null,     // float 0-1
    confidence_flags: [],       // string[] — ['height_unclear', 'bar_count_ambiguous']
    raw_gemini_text: null,      // string — raw output ไว้ debug
    created_at: null,
    ...overrides,
  };
}

/**
 * DrawingElement — output ของ Gemini Pass 2
 * อ่านจาก floor plan → นับจำนวน element แต่ละประเภทต่อชั้น
 *
 * @param {Partial<DrawingElement>} overrides
 */
export function createDrawingElement(overrides = {}) {
  return {
    id: null,                   // uuid
    project_id: null,           // uuid FK
    drawing_upload_id: null,    // uuid FK
    beam_library_id: null,      // uuid FK → BeamLibraryEntry ที่ใช้
    floor_level: null,          // 'F1' | 'F2' | 'RF' | 'B1'
    floor_area_sqm: null,       // float — พื้นที่ชั้นนี้ (จาก floor plan)
    element_id: '',             // "B1", "C1" — reference กลับ beam_library
    element_type: null,         // 'beam' | 'column' | 'girder' | 'slab' | 'footing'
    grid_refs: [],              // string[] — ["A-1", "A-2"] grid ที่เจอ element นี้
    count: null,                // int — จำนวน element นี้ในชั้นนี้
    span_length_m: null,        // float — สำหรับ beam: ความยาวช่วงเฉลี่ย
    // status
    confidence_score: null,     // float 0-1
    confidence_flags: [],       // ['count_uncertain', 'span_estimated']
    is_manual_override: false,  // bool — user แก้ไข count เองหรือไม่
    manual_override_note: null, // string
    created_at: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// TIER 3: QuantiTake — BOQ + BBS
// ─────────────────────────────────────────────

/**
 * BOQItem — Bill of Quantities line item
 * computed จาก drawing_elements + beam_library
 *
 * @param {Partial<BOQItem>} overrides
 */
export function createBOQItem(overrides = {}) {
  return {
    id: null,                   // uuid
    project_id: null,           // uuid FK
    drawing_element_id: null,   // uuid FK (null ถ้า manual)
    item_code: '',              // "STR-B1-F1" — รหัส BOQ
    description: '',            // "คาน B1 ชั้น 1 (300x600mm)"
    work_category: null,        // 'concrete' | 'rebar' | 'formwork' | 'masonry' | 'finishing'
    unit: '',                   // 'm3' | 'kg' | 'm2' | 'set'
    quantity: null,             // float
    unit_rate_thb: null,        // float — ราคาต่อหน่วย (บาท)
    amount_thb: null,           // float — computed: quantity × unit_rate
    floor_level: null,          // 'F1' | 'F2' | 'RF'
    element_type: null,         // 'beam' | 'column' | 'slab'
    is_manual: false,           // bool — ถ้า user เพิ่มเอง
    created_at: null,
    ...overrides,
  };
}

/**
 * BBSItem — Bar Bending Schedule entry
 * computed จาก BOQItem + BeamLibraryEntry
 *
 * shape_code: รหัสรูปดัด เช่น 00=ตรง, 11=ตัวแอล, 21=ตัวยู, 38=ปลอก
 *
 * @param {Partial<BBSItem>} overrides
 */
export function createBBSItem(overrides = {}) {
  return {
    id: null,                   // uuid
    project_id: null,           // uuid FK
    boq_item_id: null,          // uuid FK
    member_id: '',              // "2B1" — ระบุตำแหน่งโครงสร้าง
    bar_mark: '',               // "T1", "T2" — รหัสเหล็กแต่ละกลุ่ม
    bar_type: 'DB',             // 'DB' | 'RB'
    steel_grade: null,          // 'SR24' | 'SD30' | 'SD40'
    diameter_mm: null,          // float — เส้นผ่านศูนย์กลาง
    shape_code: '00',           // string — รหัสรูปดัดตาม วสท.
    // มิติดัด (เป็น null ถ้าไม่ใช้มิตินั้น)
    bend_a_mm: null,
    bend_b_mm: null,
    bend_c_mm: null,
    bend_d_mm: null,
    cut_length_mm: null,        // float — ความยาวตัดจริงต่อเส้น
    num_members: null,          // int — จำนวนชิ้นส่วนโครงสร้างในแบบ
    bars_per_member: null,      // int — จำนวนเหล็กต่อชิ้นส่วน
    total_bars: null,           // int — computed: num_members × bars_per_member
    total_length_m: null,       // float — computed: total_bars × cut_length / 1000
    unit_weight_kg_per_m: null, // float — ตาม diameter (ดึงจาก REBAR_UNIT_WEIGHT)
    total_weight_kg: null,      // float — computed: total_length × unit_weight
    created_at: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// TIER 4: Construction Planner
// ─────────────────────────────────────────────

/**
 * ScheduleTask — Gantt activity
 * computed จาก BOQItem (quantity → duration)
 *
 * @param {Partial<ScheduleTask>} overrides
 */
export function createScheduleTask(overrides = {}) {
  return {
    id: null,                     // uuid
    project_id: null,             // uuid FK
    boq_item_id: null,            // uuid FK (null ถ้า task ไม่ linked BOQ)
    wbs_code: '',                 // "2.1.1" — Work Breakdown Structure
    activity_name: '',            // "Column Concrete Pour F1"
    work_category: null,          // 'structural' | 'architectural' | 'mep' | 'finishing'
    floor_level: null,
    // ปริมาณงาน
    quantity: null,               // float
    unit: '',                     // 'm3' | 'kg' | 'm2'
    crew_size: null,              // int — จำนวนคนงาน
    productivity_rate: null,      // float — หน่วยต่อคนต่อวัน (จาก lookup table)
    // Duration
    base_duration_days: null,     // float — Quantity / (crew × productivity)
    weather_buffer_factor: null,  // float — 0.0-0.4 (จาก Open-Meteo)
    adjusted_duration_days: null, // float — base × (1 + weather_buffer)
    // Scheduling
    start_date: null,             // ISO date
    end_date: null,               // ISO date (adjusted)
    predecessor_task_ids: [],     // uuid[] — FK array
    lag_days: 0,                  // int — วันรอหลัง predecessor เสร็จ (cure time)
    is_critical: false,           // bool — อยู่บน critical path
    is_parallel: false,           // bool — ทำพร้อม task อื่นได้
    // สั่งวัสดุ
    material_order_date: null,    // ISO date — start_date - lead_time
    material_lead_time_days: null, // int
    created_at: null,
    ...overrides,
  };
}

/**
 * WeatherSnapshot — ข้อมูลสภาพอากาศ snapshot ณ เวลาที่สร้าง schedule
 * เก็บเฉพาะ derived output เท่านั้น ไม่เก็บ raw API response
 *
 * @param {Partial<WeatherSnapshot>} overrides
 */
export function createWeatherSnapshot(overrides = {}) {
  return {
    id: null,               // uuid
    project_id: null,       // uuid FK
    schedule_task_id: null, // uuid FK
    location_lat: null,     // float
    location_lng: null,     // float
    snapshot_date: null,    // ISO date — วันที่ดึงข้อมูล
    month_of_work: null,    // int 1-12 — เดือนที่ task นี้จะทำงาน
    avg_rain_days_per_month: null, // float — จาก historical data
    rain_delay_days: null,         // float — computed buffer
    adjusted_end_date: null,       // ISO date
    data_source: 'open-meteo',     // 'open-meteo' | 'manual'
    created_at: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// TIER 5: Resource Hub + Readiness Check
// ─────────────────────────────────────────────

/**
 * ResourceItem — manpower หรือ material ที่ linked กับ task
 *
 * @param {Partial<ResourceItem>} overrides
 */
export function createResourceItem(overrides = {}) {
  return {
    id: null,                     // uuid
    project_id: null,             // uuid FK
    schedule_task_id: null,       // uuid FK (null ถ้าเป็น project-level resource)
    resource_type: null,          // 'manpower' | 'material' | 'equipment'
    name: '',                     // "mason", "rebar DB20", "concrete pump"
    unit: '',                     // 'person-day' | 'kg' | 'ton' | 'm3' | 'day'
    quantity: null,               // float
    unit_cost_thb: null,          // float
    total_cost_thb: null,         // float — computed
    supplier_id: null,            // uuid FK → Supplier (nullable)
    created_at: null,
    ...overrides,
  };
}

/**
 * Supplier — catalog ผู้จำหน่ายวัสดุ
 *
 * @param {Partial<Supplier>} overrides
 */
export function createSupplier(overrides = {}) {
  return {
    id: null,               // uuid
    project_id: null,       // uuid FK (null = global catalog)
    name: '',
    material_types: [],     // string[] — ['rebar', 'cement', 'aggregate']
    region: '',             // 'bangkok' | 'central' | 'north' | 'northeast' | 'south'
    contact_phone: null,
    contact_line: null,
    credit_days: null,      // int — เครดิต 7 | 15 | 30 วัน
    min_order_ton: null,    // float — order ขั้นต่ำ (สำหรับเหล็ก)
    created_at: null,
    ...overrides,
  };
}

/**
 * PayrollEntry — ค่าแรงรายวัน สำหรับ Resource Hub
 *
 * @param {Partial<PayrollEntry>} overrides
 */
export function createPayrollEntry(overrides = {}) {
  return {
    id: null,               // uuid
    project_id: null,       // uuid FK
    resource_item_id: null, // uuid FK
    worker_name: '',
    work_date: null,        // ISO date
    regular_hours: 8,       // float
    ot_hours: 0,            // float
    daily_rate_thb: null,   // float — ค่าแรงปกติ
    ot_multiplier: 1.5,     // float — 1.5× weekday, 3.0× holiday
    total_pay_thb: null,    // float — computed
    sso_deduction_thb: null, // float — ประกันสังคม 5% (max ฐาน 15,000)
    net_pay_thb: null,      // float
    created_at: null,
    ...overrides,
  };
}

/**
 * ReadinessCheck — RAG status ต่อ check category
 * Background verification ที่ระบบรันให้อัตโนมัติ
 *
 * check_type categories (จาก research6):
 *   'permit'         — ใบอนุญาตก่อสร้าง
 *   'setback'        — ระยะร่น (จากแนวเขตที่ดิน)
 *   'drawing_complete' — แบบแปลนครบถ้วน
 *   'bbs_ready'      — BBS พร้อมก่อนเริ่มเหล็ก
 *   'material_lead'  — สั่งวัสดุทันก่อน activity
 *   'crew_available' — มีคนงานพอ
 *   'weather_risk'   — ความเสี่ยงฝนในช่วงโครงสร้าง
 *
 * @param {Partial<ReadinessCheck>} overrides
 */
export function createReadinessCheck(overrides = {}) {
  return {
    id: null,               // uuid
    project_id: null,       // uuid FK
    check_type: null,       // string — ดูรายการด้านบน
    status: null,           // 'green' | 'yellow' | 'red'
    title: '',              // "ใบอนุญาตก่อสร้าง"
    detail: '',             // คำอธิบาย เช่น "ยังไม่ได้แนบเอกสาร"
    recommendation: '',     // สิ่งที่ควรทำต่อ
    linked_entity_type: null, // 'schedule_task' | 'boq_item' | 'drawing_upload'
    linked_entity_id: null, // uuid — FK ไปยัง entity ที่เกี่ยวข้อง
    checked_at: null,       // ISO datetime
    auto_generated: true,   // bool — ระบบสร้าง หรือ user เพิ่มเอง
    created_at: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// LOOKUP TABLES (constants ไม่เก็บใน Supabase)
// ─────────────────────────────────────────────

/**
 * น้ำหนักเหล็กต่อเมตร (kg/m) ตาม diameter
 * อ้างอิง: มาตรฐาน วสท. + TIS 24-2548
 */
export const REBAR_UNIT_WEIGHT = {
  6:  0.222,
  9:  0.499,
  12: 0.888,
  16: 1.578,
  20: 2.466,
  25: 3.853,
  28: 4.834,
  32: 6.313,
};

/**
 * Productivity rates (หน่วยต่อ crew ต่อวัน)
 * อ้างอิง: research4 Thai construction productivity benchmarks
 */
export const PRODUCTIVITY_RATES = {
  column_concrete_m3:     12,   // m3/crew/day (by pump)
  beam_concrete_m3:       10,
  slab_concrete_m3:       15,
  column_rebar_kg:        225,  // kg/steel-fixer/day
  beam_rebar_kg:          200,
  slab_rebar_kg:          300,
  formwork_column_m2:     20,
  formwork_beam_m2:       18,
  formwork_slab_m2:       25,
  masonry_m2:             8,
  plastering_m2:          15,
  tiling_m2:              10,
};

/**
 * Concrete cure lag days ก่อนถอดแบบ / เริ่มงานชั้นถัดไป
 * อ้างอิง: ACI 318 + Thai SME practice (research4)
 */
export const CURE_LAG_DAYS = {
  foundation:  7,
  column:      3,
  beam:        7,
  slab:        14,  // ก่อนถอด shoring
};

/**
 * Weather buffer factors รายเดือน (กรุงเทพฯ / ภาคกลาง)
 * 0.0 = ไม่มี buffer, 0.4 = เพิ่ม duration 40%
 * อ้างอิง: Open-Meteo historical data + research4
 */
export const WEATHER_BUFFER_BKK = {
  1:  0.05,  // ม.ค. — หน้าแล้ง
  2:  0.05,
  3:  0.10,
  4:  0.15,
  5:  0.25,  // เริ่มฝน
  6:  0.35,
  7:  0.40,  // หน้าฝนสูงสุด
  8:  0.40,
  9:  0.35,
  10: 0.30,
  11: 0.20,
  12: 0.08,
};

// ─────────────────────────────────────────────
// VALIDATION HELPERS
// ─────────────────────────────────────────────

/**
 * ตรวจว่า DrawingElement พร้อมส่งต่อให้ BOQ engine หรือไม่
 * @param {DrawingElement} el
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDrawingElement(el) {
  const errors = [];
  if (!el.project_id)       errors.push('project_id is required');
  if (!el.floor_level)      errors.push('floor_level is required');
  if (!el.element_type)     errors.push('element_type is required');
  if (el.count === null)    errors.push('count is required');
  if (el.confidence_score !== null && el.confidence_score < 0.5) {
    errors.push(`confidence_score ${el.confidence_score} is below threshold (0.5)`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * ตรวจว่า BOQItem มีข้อมูลพอสำหรับคำนวณ amount หรือไม่
 * @param {BOQItem} item
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBOQItem(item) {
  const errors = [];
  if (!item.project_id)           errors.push('project_id is required');
  if (!item.description)          errors.push('description is required');
  if (!item.unit)                 errors.push('unit is required');
  if (item.quantity === null)     errors.push('quantity is required');
  if (item.unit_rate_thb === null) errors.push('unit_rate_thb is required');
  return { valid: errors.length === 0, errors };
}

/**
 * ตรวจว่า ReadinessCheck status ถูกต้องหรือไม่
 * @param {ReadinessCheck} check
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateReadinessCheck(check) {
  const VALID_STATUSES = ['green', 'yellow', 'red'];
  const errors = [];
  if (!VALID_STATUSES.includes(check.status)) {
    errors.push(`status "${check.status}" must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (!check.check_type) errors.push('check_type is required');
  if (!check.project_id) errors.push('project_id is required');
  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────
// COMPUTED HELPERS
// ─────────────────────────────────────────────

/**
 * คำนวณน้ำหนักเหล็กเส้น (kg)
 * @param {number} diameter_mm
 * @param {number} total_length_m
 * @returns {number|null}
 */
export function calcRebarWeight(diameter_mm, total_length_m) {
  const unitWeight = REBAR_UNIT_WEIGHT[diameter_mm];
  if (!unitWeight) return null;
  return parseFloat((total_length_m * unitWeight).toFixed(3));
}

/**
 * คำนวณ duration หลัง weather adjustment
 * @param {number} base_duration_days
 * @param {number} month — 1-12
 * @param {string} region — 'bkk' เท่านั้นตอนนี้
 * @returns {number}
 */
export function calcAdjustedDuration(base_duration_days, month, region = 'bkk') {
  const buffer = region === 'bkk' ? (WEATHER_BUFFER_BKK[month] ?? 0) : 0;
  return parseFloat((base_duration_days * (1 + buffer)).toFixed(1));
}

/**
 * คำนวณประกันสังคม (SSO) ฝ่ายนายจ้าง
 * ฐาน max 15,000 THB (จนถึงปี 2568), 17,500 THB ปี 2569+
 * @param {number} daily_rate_thb
 * @param {number} days
 * @param {number} base_cap_thb — default 15000
 * @returns {number}
 */
export function calcSSODeduction(daily_rate_thb, days, base_cap_thb = 15000) {
  const monthly_wage = daily_rate_thb * days;
  const taxable = Math.min(monthly_wage, base_cap_thb);
  return parseFloat((taxable * 0.05).toFixed(2));
}

createUnitRate({
  id, 
  work_category,      // 'concrete' | 'rebar' | 'formwork'
  item_name,          // "คอนกรีต M250"
  brand,              // "TPI" | "SCG" | null
  unit,               // 'm3' | 'kg' | 'm2'
  price_thb,          // float
  region,             // 'bangkok' | 'central' | ...
  supplier_id,        // FK → Supplier (nullable)
  valid_from,         // ISO date — ราคามีอายุ
  source,             // 'manual' | 'market_ref'
})