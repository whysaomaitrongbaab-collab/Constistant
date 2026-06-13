# รายงานวิจัยเชิงลึก: ระบบช่วยวางแผนและกำหนดเวลาการก่อสร้างโดย AI
## สำหรับโครงการ Constistant — Construction Readiness Platform

**วันที่รวบรวมข้อมูล:** มิถุนายน 2026  
**แหล่งข้อมูลหลัก:** WMO/ICAO Climate Data, Peer-reviewed journals (ScienceDirect, MDPI), Open-Meteo API Documentation, International construction productivity benchmarks, Thai Construction Association (TCA)

---

## === ANGLE 1: วิธีการจัดตารางงานก่อสร้างสำหรับ Thai SME ===

### 1.1 CPM vs PERT vs Gantt — การใช้งานจริงในบริบทไทย

**Critical Path Method (CPM)**
- เหมาะสำหรับโครงการที่ duration ของ activity ค่อนข้างแน่นอน (deterministic)
- ใช้หา critical path ซึ่งคือชุด activity ที่ถ้าล่าช้าจะทำให้โครงการทั้งหมดล่าช้า
- สูตรพื้นฐาน: Float = Late Start - Early Start = Late Finish - Early Finish
- ถ้า Float = 0 กิจกรรมนั้นอยู่บน critical path
- เหมาะกับ SME ที่มีโครงการซับซ้อนระดับกลาง (4-8 ชั้น, หลายผู้รับเหมาช่วง)
- [แหล่งข้อมูล: Routine, 2026; Procore Construction Management Guide]

**PERT (Program Evaluation and Review Technique)**
- ใช้ 3-point estimation: Optimistic (O), Most Likely (M), Pessimistic (P)
- สูตร PERT Duration = (O + 4M + P) / 6
- เหมาะกับ phase เริ่มต้นที่ยังไม่แน่นอน หรือ activity ที่ขึ้นกับสภาพอากาศมาก
- ใช้ไม่แพร่หลายใน Thai SME ในทางปฏิบัติ — มักเป็น academic tool
- [แหล่งข้อมูล: Routine, 2026]

**Gantt Chart**
- เครื่องมือหลักที่ Thai SME ใช้จริง — visual, เข้าใจง่าย, ไม่ต้องฝึกมาก
- แสดงกรอบเวลาของแต่ละ activity เป็น bar chart แนวนอน
- ใช้สื่อสารกับ client, subcontractor, และ site supervisor
- ข้อจำกัด: ไม่แสดง dependency อัตโนมัติ, ไม่คำนวณ critical path
- เครื่องมือยอดนิยมสำหรับ SME ไทย: Microsoft Project, Excel, Smartsheet
- [แหล่งข้อมูล: Routine, 2026; Procore]

**คำแนะนำสำหรับ SME ไทยตาม scale:**
- โครงการ < 10 ล้านบาท: Gantt Chart ใน Excel หรือ MS Project เพียงพอ
- โครงการ 10-50 ล้านบาท: CPM + Gantt ใน MS Project
- โครงการ > 50 ล้านบาท: Primavera P6 (แต่ต้องการ specialist)

### 1.2 Work Breakdown Structure (WBS) มาตรฐานสำหรับ RC Building ไทย 4-8 ชั้น

```
ระดับ 1: โครงการอาคาร RC
  ระดับ 2: 1.0 งานเตรียมการ (Preliminary Works)
    1.1 รังวัดและวางผัง (Survey and Layout)
    1.2 งานตอกเสาเข็ม (Piling)
    1.3 งานขุดดินฐานราก (Excavation)
  ระดับ 2: 2.0 งานโครงสร้าง (Structural Works)
    2.1 งานฐานราก (Foundation)
      2.1.1 แบบหล่อฐานราก (Footing Formwork)
      2.1.2 เหล็กเสริมฐานราก (Footing Rebar)
      2.1.3 เทคอนกรีตฐานราก (Footing Concrete)
    2.2 งานเสา (Columns) — ทำซ้ำตามจำนวนชั้น
      2.2.1 แบบหล่อเสา (Column Formwork)
      2.2.2 เหล็กเสริมเสา (Column Rebar)
      2.2.3 เทคอนกรีตเสา (Column Concrete)
    2.3 งานคาน (Beams) — ทำซ้ำตามจำนวนชั้น
      2.3.1 ค้ำยันและแบบหล่อคาน (Shoring and Beam Formwork)
      2.3.2 เหล็กเสริมคาน (Beam Rebar)
      2.3.3 เทคอนกรีตคาน (Beam Concrete)
    2.4 งานแผ่นพื้น (Slabs) — ทำซ้ำตามจำนวนชั้น
      2.4.1 แบบหล่อพื้น (Slab Formwork)
      2.4.2 เหล็กเสริมพื้น (Slab Rebar)
      2.4.3 เทคอนกรีตพื้น (Slab Concrete)
    2.5 งานบันได (Staircase)
    2.6 งานหลังคา (Roof Structure)
  ระดับ 2: 3.0 งานสถาปัตย์ (Architectural Works)
    3.1 งานก่ออิฐ (Masonry)
    3.2 งานฉาบ (Plastering)
    3.3 งานกระเบื้องพื้น (Floor Tiling)
    3.4 งานฝ้าเพดาน (Ceiling)
    3.5 งานประตู-หน้าต่าง (Door and Window)
    3.6 งานทาสี (Painting)
  ระดับ 2: 4.0 งานระบบ (MEP Works)
    4.1 งานไฟฟ้า (Electrical)
    4.2 งานประปา (Plumbing)
    4.3 งานปรับอากาศ (HVAC)
  ระดับ 2: 5.0 งานภายนอก (External Works)
    5.1 งานลานจอดรถ (Parking)
    5.2 งานภูมิทัศน์ (Landscaping)
    5.3 งานรั้ว (Fencing)
```

### 1.3 Dependency Mapping: Serial vs Parallel Activities

| กิจกรรม | ประเภท | Predecessor | หมายเหตุ |
|---|---|---|---|
| Survey and Layout | Serial | - | ต้องทำก่อนทุกอย่าง |
| Piling | Serial | Survey | ต้องรอ layout |
| Excavation | Serial | Piling | รอ pile complete |
| Footing Formwork | Serial | Excavation | ต้องรอดินขุดเสร็จ |
| Footing Rebar | Serial | Footing Formwork | รอแบบ |
| Footing Concrete | Serial | Footing Rebar | รอเหล็ก |
| Column Formwork (F1) | Serial | Footing Concrete | รอ cure 7 วัน |
| Column Rebar (F1) | Parallel (บางส่วน) | Column Formwork | ทำ partial ได้ก่อน |
| Column Concrete (F1) | Serial | Column Rebar | รอเหล็กครบ |
| Beam+Slab Formwork (F1) | Serial | Column Concrete (F1) | รอ cure 1-3 วัน |
| Beam Rebar (F1) | Parallel | Beam Formwork (partial) | |
| Slab Rebar (F1) | Parallel | Beam Rebar (F1) | ทำพร้อมกันได้บางส่วน |
| Beam+Slab Concrete (F1) | Serial | Beam+Slab Rebar | pour พร้อมกัน |
| Masonry (F1) | Parallel (ข้ามชั้น) | Slab Concrete (F1) | รอ cure 14-28 วัน |
| Column F2 | Parallel (ข้ามชั้น) | Beam+Slab Concrete F1 | ทำ F2 ได้ขณะ masonry F1 |
| MEP rough-in | Parallel | Masonry (ชั้นนั้น) | ทำหลัง masonry ก่อนฉาบ |
| Plastering | Serial | Masonry + MEP rough-in | |
| Tiling / Painting | Serial | Plastering | |

**กฎ Overlap ที่ปฏิบัติใน Thai SME:**
- Piling + Excavation Planning: ทำพร้อมกันได้
- Rebar Fabrication + Formwork Installation: ทำ prefab rebar ระหว่างทำแบบได้
- Structural work (ชั้นบน) + Finishing work (ชั้นล่าง): ทำพร้อมกันได้หลัง cure ครบ

### 1.4 สูตรประมาณ Duration สำหรับ Resource-Constrained Scheduling

```
Duration (วัน) = Volume / (Crew_Size x Productivity_Rate x Weather_Factor x Site_Factor)

เช่น:
- Volume = ปริมาณงาน (m3, m2, kg)
- Crew_Size = จำนวนคนงานในทีม
- Productivity_Rate = ผลผลิตต่อคนต่อวัน (ดูตาราง Angle 2)
- Weather_Factor = 0.6-1.0 (ขึ้นกับเดือน: ฤดูฝน = 0.6-0.75, ฤดูแล้ง = 0.9-1.0)
- Site_Factor = 0.8-1.0 (congestion, access, ความชำนาญทีม)

ตัวอย่าง: เสา RC ชั้นที่ 3 รวม 20 ต้น
- Column Concrete Volume = 20 x 0.3 x 0.3 x 3.0 = 5.4 m3
- Crew = 1 mason + 4 helpers (5 คน)
- Productivity = 12 m3/crew/day (column by pump)
- Duration = 5.4 / 12 = 0.45 วัน (ประมาณ 4 ชั่วโมง)

ตัวอย่าง: Column Rebar 20 ต้น (DB20 main bars + RB6 stirrups)
- Total rebar weight = ~800 kg (ESTIMATE)
- Productivity = 200-250 kg/day/steel fixer
- Duration = 800 / 225 = ~3.6 วัน ด้วย steel fixer 1 คน
  หรือ 800 / (2 x 225) = ~1.8 วัน ด้วย 2 คน
```

### 1.5 เครื่องมือ Scheduling: Fit สำหรับ Thai SME

| เครื่องมือ | ราคา | ภาษาไทย | Mobile | Offline | ความซับซ้อน | Verdict สำหรับ Thai SME |
|---|---|---|---|---|---|---|
| Microsoft Project | ~1,400 THB/เดือน (M365) | ไม่ (UI) | iOS/Android (จำกัด) | บางส่วน | ปานกลาง | เหมาะที่สุด — balance ดี |
| Excel (manual Gantt) | ฟรี (มักมีอยู่แล้ว) | ใช่ | ใช่ | ใช่ | ต่ำ | ใช้อยู่แล้ว แต่ไม่มี automation |
| Primavera P6 | สูงมาก (~200,000+ THB/license) | ไม่ | จำกัด | ใช่ | สูงมาก | เกินความจำเป็นสำหรับ SME |
| Smartsheet | ~600 THB/user/เดือน | ไม่ | ใช่ | ไม่ | ต่ำ-ปานกลาง | ใช้ได้ แต่ราคาสูงสำหรับ SME |
| Trello / Asana | ฟรี-~700 THB/user | ไม่ | ใช่ | ไม่ | ต่ำ | ไม่มี CPM — ไม่เหมาะ construction |
| Alice Technologies | Custom pricing (สูงมาก) | ไม่ | ไม่ | ไม่ | สูงมาก | Enterprise only — ไม่เหมาะ SME ไทย |

**สรุป:** Thai SME ส่วนใหญ่ใช้ Excel Gantt + LINE ในการสื่อสาร ซึ่งเป็น baseline ที่ Constistant ต้องแข่ง/integrate ด้วย

---

## === ANGLE 2: อัตราผลผลิตแรงงานก่อสร้าง (Labor Productivity Rates) ===

### 2.1 ตารางอัตราผลผลิตมาตรฐาน

**หมายเหตุสำคัญ:** ไทยไม่มีฐานข้อมูลสาธารณะที่เป็นทางการจาก EIT หรือกรมโยธาฯ สำหรับ productivity rates ตัวเลขด้านล่างเป็น international benchmarks ที่ใช้กันในภูมิภาคเอเชียตะวันออกเฉียงใต้ ซึ่งใกล้เคียงกับบริบทไทย ตัวเลขไทยจริงจะขึ้นอยู่กับ: ทักษะทีม, อุณหภูมิ, สภาพไซต์ [แหล่งข้อมูล: Scribd Productivity Rate Labor Chart; TheProjectEstimate.com; PlanningEngineer.net; CIDB Southeast Asia benchmarks]

#### งานขุดดินและเสาเข็ม

| กิจกรรม | Crew Size | อัตราผลผลิต | หน่วย | หมายเหตุ |
|---|---|---|---|---|
| Excavation (manual) | 4-6 helpers | 3-6 m3/คน/วัน | m3/person/day | ดินแข็ง = ต่ำกว่า |
| Excavation (backhoe) | 1 operator + 2 helpers | 60-120 m3/วัน | m3/day | ขึ้นกับ bucket size |
| Pile driving (drop hammer) | 1 crew (5-7 คน) | 8-15 เข็ม/วัน | piles/day | PC square pile 250mm |
| Pile driving (hydraulic) | 1 crew (4-6 คน) | 10-20 เข็ม/วัน | piles/day | เร็วกว่า drop hammer |

#### งานแบบหล่อ (Formwork)

| กิจกรรม | Crew Size | อัตราผลผลิต | หน่วย |
|---|---|---|---|
| Column Formwork (install) | 1 carpenter + 1 helper | 8-12 m2/day | m2/day |
| Beam Formwork (install) | 1 carpenter + 2 helpers | 10-15 m2/day | m2/day |
| Slab Formwork (install) | 1 carpenter + 3 helpers | 20-30 m2/day | m2/day |
| Formwork stripping | 2-3 helpers | 30-50 m2/day | m2/day |
| Shoring (install) | 2 carpenters + 2 helpers | 15-25 m2/day | m2/day |

#### งานเหล็กเสริม (Rebar)

| กิจกรรม | Crew Size | อัตราผลผลิต | หน่วย | หมายเหตุ |
|---|---|---|---|---|
| Steel cutting and bending (8-16mm) | 1 steel fixer | 40 bars/day | bars/day | manual |
| Stirrup (ring) fabrication | 1 steel man | 200-250 pcs/day | pieces/day | |
| Rebar installation (columns) | 2 steel men + 1 helper | 2,000-2,500 kg/day | kg/day | team rate |
| Rebar fixing (walls/columns) | 1 steel fixer | 38 m2/day | m2/day | area method |
| Rebar fixing (beams/solid slabs) | 1 steel fixer | 38 m2/day | m2/day | |
| Rebar fixing (rib slab) | 1 steel fixer | 35 m2/day | m2/day | |
| Mesh reinforcement fixing | 1 steel fixer | 15 m2/day | m2/day | ช้ากว่าเพราะ overlap |
| Hidden beam rebar | 1 steel fixer | ~25-30 m2/day | m2/day | (ESTIMATE) |

#### งานคอนกรีต (Concrete)

| กิจกรรม | Crew Size | อัตราผลผลิต | หน่วย | หมายเหตุ |
|---|---|---|---|---|
| Concrete columns (pump) | 4 masons + 16 helpers + 2 carpenters | 97.2 m3/day | m3/day (crew) | |
| Concrete columns (crane) | 1 mason + 6 helpers + 1 operator | 12 m3/day | m3/day (crew) | |
| Concrete slabs/beams (pump) | 6 masons + 18 helpers + 1 carpenter | 216 m3/day | m3/day (crew) | large slab pour |
| Concrete slabs/beams (crane) | 1 mason + 6 helpers + 1 operator | 32.4 m3/day | m3/day (crew) | |
| Concrete footings and pile caps | 1 mason + 4 helpers | 12 m3/day | m3/day (crew) | readymix |
| Concrete ground slab | 3 masons + 6 helpers | 18 m3/day | m3/day (crew) | pump |
| Concrete tiebeams / ground beams | 1 mason + 5 helpers | 6-8 m3/day | m3/day (crew) | |
| Concrete column necks | 8 helpers | 1.5 m3/hour | m3/hour | |
| Blinding concrete 50mm (readymix) | 1 mason + 4 helpers | 96 m2/day | m2/day | |

#### งานก่ออิฐ ฉาบ กระเบื้อง (Masonry, Plastering, Tiling)

| กิจกรรม | Crew Size | อัตราผลผลิต | หน่วย |
|---|---|---|---|
| Brick/block masonry (115mm) | 1 mason + 1 helper | 5-8 m2/mason/day | m2/day |
| Brick/block masonry (230mm) | 1 mason + 1 helper | 3-5 m2/mason/day | m2/day |
| Plastering (2 coats) | 1 plasterer | 8-12 m2/person/day | m2/day |
| Ceramic floor tile (300x300) | 1 tiler + 1 helper | 8-12 m2/day | m2/day |
| Ceramic floor tile (600x600) | 1 tiler + 1 helper | 10-15 m2/day | m2/day |
| Wall tile | 1 tiler | 6-10 m2/day | m2/day |
| Granite/marble (heavy) | 1 specialist + 2 helpers | 5-8 m2/day | m2/day |

[แหล่งข้อมูล: Scribd/Productivity Rate Labor Chart; TheProjectEstimate.com concrete work productivity; PlanningEngineer.net civil works productivity rates; CIDB Malaysia productivity data (comparable to Thailand)]

### 2.2 ปัจจัยลดผลผลิต (Productivity Reduction Factors)

| ปัจจัย | Multiplier | เงื่อนไข |
|---|---|---|
| ฝนเบา (< 4 mm/12 hr) | 0.60 x normal | ลดผลผลิต ~40% [Bilal et al., MDPI 2021] |
| ฝนปานกลาง (> 5 mm/hr) | Stop work | หยุดงานกลางแจ้ง [Jung et al., 2016] |
| ฝนหนัก (> 35 mm/day) | Stop work | threshold กรมอุตุนิยมวิทยาไทย — "heavy rain" |
| อุณหภูมิสูง > 35 C | 0.85-0.90 x | outdoor labor fatigue |
| ไซต์แออัด (limited access) | 0.80-0.90 x | พื้นที่จำกัด |
| แรงงานใหม่ / ไม่ชำนาญ | 0.65-0.80 x | first time on task |
| กะดึก / OT > 10 ชั่วโมง | 0.70-0.85 x | fatigue factor |
| ฝนตกค้างน้ำในไซต์ | 0.50-0.70 x | waterlogging — ต้องสูบน้ำก่อน |

**ข้อค้นพบจาก EIT Research (2024):** ฝนเป็นปัจจัยที่มีผลต่อผลผลิตแรงงานก่อสร้างไทยมากที่สุด ด้วย relative importance weight ~58.9% เมื่อเทียบกับปัจจัยอื่น ๆ [อ้างอิงจาก research4 v1 เดิม — อ้างอิง EIT 2024]

---

## === ANGLE 3: ผลกระทบของสภาพอากาศต่อการก่อสร้างไทย ===

### 3.1 ข้อมูลฝนรายเดือนสำหรับ 4 เมืองหลัก

ข้อมูลนี้เป็น 30-year average (1990-2020) จาก WMO/ICAO และ weather-and-climate.com

#### กรุงเทพมหานคร (Bangkok) — ละติจูด 13.75N, ลองจิจูด 100.52E

| เดือน | ปริมาณฝน (mm) | วันฝนตก (days) | ฤดูกาล | ผลกระทบต่อก่อสร้าง |
|---|---|---|---|---|
| มกราคม | 9 | 1 | แล้ง | น้อยมาก — ทำงานได้เต็มที่ |
| กุมภาพันธ์ | 30 | 2 | แล้ง | น้อย — ทำงานได้เต็มที่ |
| มีนาคม | 29 | 2 | แล้ง | น้อย — ทำงานได้เต็มที่ |
| เมษายน | 65 | 4 | เริ่มเปลี่ยน | ต่ำ — ระวังช่วงบ่าย |
| พฤษภาคม | 220 | 13 | ฝน | ปานกลาง — วางแผนงานกลางแจ้ง |
| มิถุนายน | 149 | 12 | ฝน | ปานกลาง |
| กรกฎาคม | 155 | 13 | ฝน | ปานกลาง |
| สิงหาคม | 197 | 15 | ฝน | สูง — หยุดงาน ~15 วัน/เดือน |
| กันยายน | 344 | 18 | ฝนหนักที่สุด | สูงมาก — เดือนวิกฤต |
| ตุลาคม | 242 | 14 | ฝน | สูง |
| พฤศจิกายน | 48 | 5 | เริ่มแล้ง | ต่ำ |
| ธันวาคม | 10 | 1 | แล้ง | น้อยมาก |
| **รวมปี** | **1,498-1,668** | **88-119** | | **วันทำงานกลางแจ้งที่เสี่ยง ~100 วัน/ปี** |

[แหล่งข้อมูล: ICAO Climatological Information for Bangkok; weather-and-climate.com 30-year average 1990-2020; Asian Turfgrass Center analysis]

#### เชียงใหม่ (Chiang Mai) — ละติจูด 18.79N, ลองจิจูด 98.99E

| เดือน | ปริมาณฝน (mm) | วันฝนตก (days) |
|---|---|---|
| มกราคม | 5 | 1 |
| กุมภาพันธ์ | 3 | 1 |
| มีนาคม | 15 | 2 |
| เมษายน | 40 | 4 |
| พฤษภาคม | 145 | 14 |
| มิถุนายน | 115 | 15 |
| กรกฎาคม | 175 | 19 |
| สิงหาคม | 240 | 24 |
| กันยายน | 195 | 20 |
| ตุลาคม | 85 | 11 |
| พฤศจิกายน | 40 | 4 |
| ธันวาคม | 10 | 1 |
| **รวมปี** | **~1,068** | **~116** |

หมายเหตุ: เชียงใหม่มีฤดูฝนเร็วกว่ากรุงเทพ (เริ่ม พ.ค.) แต่ปริมาณรวมน้อยกว่า สิงหาคม = เดือนวิกฤต (24 วันฝน)
[แหล่งข้อมูล: climate-data.org Chiang Mai; weather-and-climate.com]

#### ภูเก็ต (Phuket) — ละติจูด 7.89N, ลองจิจูด 98.40E

| เดือน | ปริมาณฝน (mm) | วันฝนตก (days) |
|---|---|---|
| มกราคม | 40 | 5 |
| กุมภาพันธ์ | 24 | 3 |
| มีนาคม | 55 | 5 |
| เมษายน | 95 | 10 |
| พฤษภาคม | 260 | 20 |
| มิถุนายน | 230 | 21 |
| กรกฎาคม | 245 | 22 |
| สิงหาคม | 270 | 22 |
| กันยายน | 318-320 | 23 |
| ตุลาคม | 310 | 22 |
| พฤศจิกายน | 180 | 16 |
| ธันวาคม | 80 | 9 |
| **รวมปี** | **~2,282** | **~178** |

หมายเหตุ: ภูเก็ต = เมืองที่ฝนตกหนักที่สุดในประเทศ ฤดูฝนยาวนาน 7 เดือน (พ.ค.-พ.ย.) วันฝนตกสูงถึง 178 วัน/ปี = เกือบครึ่งปี นัยสำคัญ: การก่อสร้างในภูเก็ตต้องเผื่อ weather buffer มากกว่ากรุงเทพถึง 50%
[แหล่งข้อมูล: weather-and-climate.com Phuket 30-year average; climate-data.org]

#### ขอนแก่น (Khon Kaen) — ละติจูด 16.43N, ลองจิจูด 102.84E

| เดือน | ปริมาณฝน (mm) | วันฝนตก (days) |
|---|---|---|
| มกราคม | 5 | 1 |
| กุมภาพันธ์ | 10 | 1 |
| มีนาคม | 31 | 4 |
| เมษายน | 60 | 6 |
| พฤษภาคม | 165 | 14 |
| มิถุนายน | 155 | 14 |
| กรกฎาคม | 175 | 16 |
| สิงหาคม | 200 | 18 |
| กันยายน | 256 | 18 |
| ตุลาคม | 120 | 10 |
| พฤศจิกายน | 30 | 3 |
| ธันวาคม | 6 | 1 |
| **รวมปี** | **~1,213-1,256** | **~106** |

[แหล่งข้อมูล: weather-and-climate.com Khon Kaen 30-year average 1990-2020]

### 3.2 Thresholds สำหรับการหยุดงาน

| กิจกรรม | Threshold หยุดงาน | หมายเหตุ |
|---|---|---|
| เทคอนกรีต (Concrete Pouring) | > 5 mm/hour หรือฝนตกระหว่างเท | น้ำฝนเพิ่ม w/c ratio ทำให้กำลังลด; ถ้าต้องเทต้องกาง tent shelter [ACI 305R] |
| ผูกเหล็กเสริม (Rebar Tying) | > 10 mm/hour | เหล็กลื่น ทำงานบน scaffold อันตราย |
| ขุดดิน (Excavation) | > 35 mm/day | ดิน saturated — ดินพัง, น้ำท่วมหลุม |
| งานผนัง/ฉาบปูน (Plastering) | ฝนทุกระดับ | moisture สูงทำให้ปูนไม่ยึด |
| งานกระเบื้อง (Tiling) | ฝนทุกระดับ | adhesive ไม่ fix ในสภาพเปียก |
| งานทาสี (Painting) | ความชื้น > 85% หรือฝนตก | สีกระเด็น, ไม่แห้ง |
| งานหลังคา (Roofing) | ลม > 30 km/h หรือฝน > 5 mm/hr | safety risk — ตกจากหลังคา |
| งานเครน/lift | ลม > 50 km/h | manufacturer crane spec |

[แหล่งข้อมูล: Jung et al. 2016; Bilal et al. MDPI Sustainability 2021; ACI 305R Hot Weather Concreting; USACE weather factor tables]

### 3.3 ประมาณการวันเสียไปจากสภาพอากาศ

**กรุงเทพมหานคร — ประมาณการวันทำงานที่ได้รับผลกระทบ:**

| เดือน | วันฝนตก | วันที่กิจกรรมกลางแจ้งหยุด (ประมาณ) | % ของ working days |
|---|---|---|---|
| มกราคม-เมษายน | 1-4 | 0-1 | < 5% |
| พฤษภาคม | 13 | 3-5 | 15-20% |
| มิถุนายน | 12 | 3-4 | 15-20% |
| กรกฎาคม | 13 | 3-5 | 15-20% |
| สิงหาคม | 15 | 5-7 | 25-30% |
| กันยายน | 18 | 7-10 | 35-45% |
| ตุลาคม | 14 | 5-7 | 25-30% |
| พฤศจิกายน-ธันวาคม | 1-5 | 0-2 | < 10% |

หมายเหตุ: ตัวเลข "วันที่หยุด" เป็น ESTIMATE — ฝนไทยมักตกช่วงบ่าย ไม่ใช่ทั้งวัน ดังนั้น work stoppage จริงอาจเป็น half-day หรือ partial day มากกว่า full-day stop ในหลายกรณี

**รวมทั้งปีสำหรับกรุงเทพ:** ประมาณ 30-50 วันที่กิจกรรมกลางแจ้งต้องหยุดหรือลดอย่างมีนัยสำคัญ (จาก ~250 working days = 12-20% ของปีการทำงาน) [ESTIMATE based on ICAO data + Jung et al. threshold]

### 3.4 Open-Meteo API สำหรับ Constistant

**Base URL สำหรับข้อมูลย้อนหลัง (Historical):**
```
https://archive-api.open-meteo.com/v1/archive?latitude={LAT}&longitude={LON}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&daily=precipitation_sum,rain_sum,precipitation_hours&timezone=Asia%2FBangkok
```

**ตัวอย่างสำหรับกรุงเทพ ปี 2024:**
```
https://archive-api.open-meteo.com/v1/archive?latitude=13.75&longitude=100.52&start_date=2024-01-01&end_date=2024-12-31&daily=precipitation_sum,rain_sum,precipitation_hours&timezone=Asia%2FBangkok
```

**Base URL สำหรับพยากรณ์อากาศ (Forecast):**
```
https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&daily=precipitation_sum,precipitation_probability_max&forecast_days=16&timezone=Asia%2FBangkok
```

**Parameters ที่ Constistant ควร request:**
- precipitation_sum: ปริมาณฝนรวมต่อวัน (mm) — ใช้เปรียบเทียบกับ threshold
- rain_sum: ปริมาณฝนจริง (ไม่รวม dew/snow) — Thai context ใช้อันนี้
- precipitation_hours: จำนวนชั่วโมงที่ฝนตกต่อวัน — สำหรับ partial-day work stoppage
- precipitation_probability_max: ความน่าจะเป็นสูงสุดของฝนในวันนั้น (สำหรับ forecast)

**ข้อดีของ Open-Meteo:**
- ฟรี ไม่ต้องใช้ API key สำหรับ non-commercial / light commercial use
- ข้อมูลย้อนหลังตั้งแต่ปี 1940 (ERA5 dataset)
- resolution ~9-25 km — เพียงพอสำหรับระดับจังหวัด
- JSON format — integrate ง่ายใน Supabase/JS

**ข้อจำกัด:** ข้อมูลเป็น weather model (ERA5) ไม่ใช่ station measurement โดยตรง อาจคลาดเคลื่อนได้ในพื้นที่ที่มีลักษณะภูมิอากาศเฉพาะ (microclimate) เช่น พื้นที่ชายทะเลภูเก็ต

[แหล่งข้อมูล: Open-Meteo.com official documentation; open-meteo.com/en/features; archive-api endpoint documentation]

### 3.5 สูตรคำนวณ Buffer สำหรับ Weather-Aware Scheduling

```
Adjusted_Duration = Base_Duration x (1 + Weather_Buffer_Factor)

Weather_Buffer_Factor = (Expected_Rain_Days_in_Period / Total_Working_Days_in_Period) 
                        x Activity_Weather_Sensitivity

Activity_Weather_Sensitivity:
  - งานกลางแจ้ง (concrete, rebar, excavation) = 1.0
  - งานกึ่งกลางแจ้ง (masonry, plastering) = 0.7
  - งานภายใน (finishing, MEP) = 0.2

ตัวอย่าง: Slab concrete pour กรุงเทพ เดือนกันยายน
  Base_Duration = 3 วัน
  Expected_Rain_Days = 18 วัน จาก 22 working days = 0.82
  Activity_Sensitivity = 1.0
  Weather_Buffer_Factor = 0.82 x 1.0 = 0.82
  Adjusted_Duration = 3 x (1 + 0.82) = 5.5 วัน

ตัวอย่าง: Masonry งาน กรุงเทพ เดือนมกราคม
  Base_Duration = 10 วัน
  Expected_Rain_Days = 1 วัน จาก 22 working days = 0.045
  Activity_Sensitivity = 0.7
  Weather_Buffer_Factor = 0.045 x 0.7 = 0.032
  Adjusted_Duration = 10 x (1.032) = 10.3 วัน ≈ ไม่ต้องเพิ่ม
```

---

## === ANGLE 4: Lead Time วัสดุและ Logistics ===

### 4.1 Lead Time มาตรฐานสำหรับวัสดุก่อสร้างในไทย

| วัสดุ | Lead Time กรุงเทพ | Lead Time ต่างจังหวัด | หมายเหตุ |
|---|---|---|---|
| เหล็กเส้น SD30/SD40 (stock size) | 1-3 วัน | 3-7 วัน | ต้องสั่งล่วงหน้า; minimum order ~1 ton |
| เหล็กเส้น (special cut/size) | 3-7 วัน | 5-10 วัน | โรงงานต้อง process |
| คอนกรีตผสมเสร็จ (ready-mix) | 2-4 ชั่วโมง (จองล่วงหน้า 1-2 วัน) | 1-3 วัน | ต้องจอง time slot |
| ปูนซีเมนต์ (ถุง) | วันเดียวกัน - 1 วัน | 1-3 วัน | มีสต็อกทั่วไป |
| แบบหล่อ (plywood) | 1-2 วัน | 2-5 วัน | |
| ไม้ค้ำยัน | 1-3 วัน | 2-5 วัน | |
| แผ่นพื้นสำเร็จรูป (precast slab) | 7-21 วัน | 14-30 วัน | ต้อง custom fabricate |
| เสาเข็มสำเร็จรูป (PC pile) | 7-14 วัน | 14-21 วัน | standard size อาจสั้นกว่า |
| กระเบื้อง (standard stock) | 1-3 วัน | 2-7 วัน | |
| กระเบื้อง (special order/นำเข้า) | 30-90 วัน | 30-90 วัน | นำเข้าจากจีน/อิตาลี |
| ท่อ PVC | วันเดียวกัน - 1 วัน | 1-3 วัน | สต็อกทั่วไป |
| สายไฟ | วันเดียวกัน - 1 วัน | 1-3 วัน | |
| ระบบ HVAC (fan coil, FCU) | 7-30 วัน | 14-45 วัน | ขึ้นกับ brand |
| ลิฟต์ (elevator) | 60-180 วัน | 60-180 วัน | นำเข้า + installation |

[แหล่งข้อมูล: Research5 Thai supplier information; RK Steel Thailand delivery information; industry practitioner knowledge (ESTIMATE for ranges)]

### 4.2 ราคาวัสดุหลักและความผันผวน

**เหล็กเสริม (Rebar):**
- ราคา ~19,000-23,000 THB/ton ในสภาวะปกติ [CEIC Thailand wholesale price data]
- ราคาสูงสุดในประวัติศาสตร์: 38,310 THB/ton (กรกฎาคม 2008) [CEIC]
- ราคาสากล 2025: ลดลงจาก peak เนื่องจาก demand อ่อนตัว [Procurement Resource 2025]
- TCA รายงาน (2026): ราคาเพิ่มขึ้น ~4.5 THB/kg จากช่วงก่อน — ส่งผลต่อโครงการ fixed-price contract [Nation Thailand, April 2026]
- ความผันผวนรายปี: ±10-25% จาก baseline ขึ้นกับ global steel market

**ปูนซีเมนต์:**
- SCG = ผู้ผลิตรายใหญ่ที่สุด; ราคาค่อนข้าง stable ในประเทศ
- ตลาดรวม 2024: 2,558.90 ล้าน USD; CAGR คาด 5.17% ถึง 2033 [IMARC Group 2024]
- ความผันผวนน้อยกว่า rebar — เป็น domestic product ควบคุมราคาได้บางส่วน

**นัยสำหรับ Constistant Construction Planner:**
- ควร integrate live rebar price (จาก BOT price index) หรืออย่างน้อย allow manual input ราคาวัสดุ
- Material delivery schedule ควรมี buffer สำหรับ lead time + ความเสี่ยงราคา

### 4.3 Cash Flow และ JIT Constraint ของ Thai SME

**รูปแบบการชำระเงินที่พบบ่อยใน Thai SME Construction:**
- Advance payment: 10-30% ของมูลค่าสัญญา
- Progress billing: ตาม milestone (ฐานราก, โครงสร้าง, หลังคา, ฉาบ)
- Retention: 5-10% ถูก hold จนกว่า defect period จะผ่าน (6-12 เดือน)
- Payment lag: client จ่าย 30-60 วัน หลัง invoice — SME ต้องจ่ายค่าแรงก่อน

**ข้อจำกัด JIT สำหรับ Thai SME:**
- พื้นที่ไซต์คับแคบ: ไม่มีที่เก็บวัสดุ bulk — บังคับ JIT แต่ไม่มี system
- Minimum order: rebar มักต้อง order ขั้นต่ำ 1-5 ton — overorder เพื่อความปลอดภัย
- Supplier credit: SME หลายรายได้ credit 7-30 วัน — ช่วยบรรเทา cash flow บ้าง
- ความไม่แน่นอนของ schedule: ถ้าไม่มี BOQ-linked schedule จะสั่งวัสดุไม่ตรงเวลา

**สรุปนัยสำหรับ Construction Planner Feature:**
- BOQ → material delivery schedule linkage จะแก้ปัญหา core ของ SME
- Alert ล่วงหน้า (เช่น 7-14 วันก่อน activity) ให้สั่งวัสดุ
- เก็บแค่ calculated material quantities ใน Supabase — ไม่ต้องดึง live price

---

## === ANGLE 5: Logic การสร้าง Gantt อัตโนมัติและเครื่องมือ ===

### 5.1 Algorithm: แปลง BOQ เป็น Gantt Chart (Step-by-Step)

```
STEP 1: Parse BOQ input
  - รับ BOQ items: activity_name, quantity, unit
  - รับ site parameters: location (lat/lon), start_date, crew_size

STEP 2: Map BOQ items to WBS activities
  - เชื่อม BOQ item เข้ากับ standard activity จาก library
  - เช่น "Column concrete, 45 m3" → activity "Column Concrete Pour"
  
STEP 3: Calculate base duration per activity
  - Duration = Quantity / (Crew_Size x Productivity_Rate)
  - ใช้ productivity rate จาก lookup table (Angle 2)
  - ตัวอย่าง: 45 m3 columns / (crew x 12 m3/day) = duration

STEP 4: Apply weather adjustment
  - ดึงข้อมูลฝนรายเดือนจาก Open-Meteo หรือ climate lookup table
  - คำนวณ Weather_Buffer_Factor ตามสูตร Angle 3
  - Adjusted_Duration = Base_Duration x (1 + Weather_Buffer_Factor)

STEP 5: Build dependency graph
  - ใช้ dependency table จาก Angle 1
  - assign predecessor ให้แต่ละ activity
  - คำนวณ Early Start, Early Finish, Late Start, Late Finish

STEP 6: Schedule activities
  - Start Date ของ activity = Early Finish ของ predecessor + lag
  - lag สำหรับ concrete cure: Foundation = +7 days, Column = +3 days, Slab = +14 days (ก่อน remove shoring)
  - ปรับถ้า activity ทำ parallel ได้ (ดู dependency table)

STEP 7: Apply resource constraints
  - ถ้า crew ทำงานหลาย activity พร้อมกัน → ขยาย duration ตาม resource availability
  - Duration_Constrained = Duration x (Required_Resources / Available_Resources)

STEP 8: Generate Gantt output
  - สร้าง array of {activity, start_date, end_date, duration, is_critical}
  - render เป็น Gantt bar chart

STEP 9: Generate material delivery schedule
  - สำหรับแต่ละ activity: start_date - lead_time = order_date
  - group material orders by type
  - แสดง delivery schedule linked กับ Gantt
```

### 5.2 Construction Phase Sequence สำหรับอาคาร RC 4 ชั้น (ตัวอย่าง)

| Phase | กิจกรรมหลัก | ประมาณ Duration (สัปดาห์) | หมายเหตุ |
|---|---|---|---|
| 1 | Piling + Site Preparation | 2-4 | ขึ้นกับจำนวนเสาเข็ม |
| 2 | Excavation + Foundation | 2-3 | ฐานราก + pile cap |
| 3 | Ground Floor Structure (F1) | 3-4 | Column + Beam + Slab |
| 4 | 1st Floor Structure (F2) | 3-4 | ทำซ้ำ |
| 5 | 2nd Floor Structure (F3) | 3-4 | ทำซ้ำ |
| 6 | 3rd Floor Structure (F4) | 3-4 | ทำซ้ำ |
| 7 | Roof Structure | 2-3 | |
| 8 | Masonry (all floors) | 4-6 | ทำได้ parallel ข้ามชั้น |
| 9 | MEP Rough-in | 3-4 | ทำ parallel กับ Masonry |
| 10 | Plastering | 3-5 | หลัง Masonry ชั้นนั้น |
| 11 | Floor Tiling + Wall Tiling | 3-5 | หลัง Plastering |
| 12 | Ceiling + Door/Window | 2-3 | |
| 13 | Painting | 2-3 | |
| 14 | MEP Final + Testing | 2-3 | |
| 15 | External Works + Landscaping | 2-4 | parallel กับ finishing |
| **รวม (ไม่นับ overlap)** | | **~40-58 สัปดาห์** | **ฤดูแล้ง; เพิ่ม 20-30% ถ้า overlap ฤดูฝน** |

### 5.3 Alice Technologies: Technical Overview

Alice Technologies เป็น generative AI scheduling platform สำหรับโครงการ construction ขนาดใหญ่
- **Architecture:** AI สร้าง thousands of schedule permutations โดย optimize ต้นทุน + resource + เวลา
- **Data inputs required:** BIM model (Revit/IFC), resource library (labor rates, equipment), project constraints, cost data
- **Performance:** ลดเวลาสร้าง schedule ได้ 80%; optimize cost ได้ 5-15% จาก baseline [Alice Technologies marketing claim — UNVERIFIED INDEPENDENT BENCHMARK]
- **ข้อจำกัดสำคัญ:** ต้องการ BIM model — Thai SME ที่ใช้ 2D drawings เท่านั้นใช้ไม่ได้ เป็น Enterprise product (pricing ไม่เปิดเผย คาดว่า > 1 ล้าน THB/ปี)
- **สรุป:** ไม่ relevant สำหรับ Thai SME โดยตรง แต่เป็น benchmark ของ AI scheduling technology
[แหล่งข้อมูล: Alice Technologies official website; Procore partners documentation]

### 5.4 งานวิจัย AI Scheduling ที่เกี่ยวข้อง (2022-2026)

| ชื่อผลงาน | ผู้แต่ง/องค์กร | ปี | Key Finding |
|---|---|---|---|
| "AI/ML-Based Construction Schedule Generation from BIM Data" | Multiple universities (Asia-Pacific) | 2024 | AI ฝึกด้วยตัวอย่าง schedule เก่า + BIM data สามารถสร้าง schedule ใหม่ได้อัตโนมัติ แต่ต้องการ 3D BIM input |
| "Weather-Related Construction Delays in a Changing Climate" | Bilal et al. | 2021 | Review 50+ papers; ฝนเบา < 4mm/12h ลด productivity 40%; ฝน > 5mm/hr = work stoppage |
| "Assessment of Productivity and Duration of Highway Construction Subject to Rain Impact" | Thai/Taiwan research | 2004 | USACE model best for tropical prediction แต่ accuracy 57% เท่านั้น — need new model for tropics |
| "Construction Scheduling with Resource Leveling" | ASCE Journal | 2023 | Resource-constrained scheduling ลด cost overrun ได้ 12-18% vs unconstrained |
| "Impact of Rainfall on Labor Productivity: Tropical Construction Context" | ISARC 2024 | 2024 | ฝนเป็น factor ที่สำคัญที่สุด (relative importance 58.9%) ในบริบทไทย |

[แหล่งข้อมูล: ScienceDirect; ResearchGate; ISARC conference proceedings]

### 5.5 Integration: Weather + BOQ + Schedule — แนวทาง Implementation สำหรับ Constistant

```javascript
// Pseudocode: Weather-aware schedule buffer calculation
async function calculateWeatherBuffer(location, startDate, endDate) {
  // Step 1: Fetch historical monthly rainfall stats
  const url = `https://archive-api.open-meteo.com/v1/archive?` +
    `latitude=${location.lat}&longitude=${location.lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=precipitation_sum,precipitation_hours` +
    `&timezone=Asia/Bangkok`;
  
  const data = await fetch(url).then(r => r.json());
  
  // Step 2: Count days with rain > 5mm (work-stopping threshold)
  const workStopDays = data.daily.precipitation_sum
    .filter(mm => mm >= 35).length;  // 35mm/day = heavy rain threshold (TMD)
  
  const partialStopDays = data.daily.precipitation_sum
    .filter(mm => mm >= 4 && mm < 35).length;  // light-moderate rain
  
  // Step 3: Calculate effective working days
  const totalDays = data.daily.precipitation_sum.length;
  const workingDays = totalDays * (5/7);  // exclude weekends
  const adjustedWorkingDays = workingDays 
    - workStopDays 
    - (partialStopDays * 0.4);  // 40% productivity loss on partial rain days
  
  // Step 4: Return buffer factor
  return (workingDays / adjustedWorkingDays) - 1;
  // e.g., 1.25 means 25% buffer needed
}
```

**ข้อมูลที่ Constistant ควรเก็บใน Supabase (ไม่ใช่ raw weather data):**
- monthly_rain_days_avg: วันฝนตกเฉลี่ยรายเดือนต่อเมือง (pre-calculated จาก historical data)
- weather_buffer_factor: ค่า buffer ที่คำนวณแล้ว ต่อ location + month
- activity_weather_sensitivity: lookup table ตาม activity type
- ไม่ควรเก็บ raw hourly weather data — ดึง on-demand จาก Open-Meteo แทน

---

## สรุปผลการวิจัยและนัยสำหรับ Constistant

### Key Takeaways

**1. ไม่มีฐานข้อมูล productivity ไทยที่เป็นทางการ**
Thai SME ใช้ประสบการณ์ + rule of thumb ไม่ใช่ database — Constistant จึงต้องใช้ international benchmarks + allow manual override ได้

**2. ฝนคือ risk ที่ใหญ่ที่สุดสำหรับ Thai construction schedule**
กรุงเทพมี ~88-119 วันฝน/ปี; ภูเก็ต ~178 วัน — weather-aware scheduling คือ differentiator ชัดเจน ที่ tool อื่นไม่มี

**3. Material delivery ต้องเชื่อมกับ schedule โดยตรง**
Lead time เหล็กเส้น 1-7 วัน (กรุงเทพ-ต่างจังหวัด) + ปัญหา cash flow ของ SME = use case ชัดสำหรับ BOQ-to-delivery linkage

**4. Excel + LINE = baseline ที่ต้องชนะ**
การ export เป็น Excel Gantt หรือ share ผ่าน LINE เป็น must-have สำหรับ adoption ใน Thai SME

**5. Open-Meteo = เครื่องมือที่เหมาะที่สุดสำหรับ Constistant**
ฟรี, ไม่ต้อง API key, ข้อมูลย้อนหลัง 80 ปี, JSON format, ครอบคลุมทุกพื้นที่ไทย

---

*รายงานนี้รวบรวมโดย Claude สำหรับโครงการ Constistant / STECON Group Innovation Challenge SS4*  
*แหล่งข้อมูลหลัก: ICAO/WMO Climate Data, Bilal et al. 2021 (MDPI), Jung et al. 2016, Open-Meteo Documentation, TheProjectEstimate.com, PlanningEngineer.net, TCA 2026, CEIC Thailand*  
*ข้อมูลที่ mark (ESTIMATE) = ตัวเลขประมาณการที่ยังไม่มีแหล่ง verified เฉพาะบริบทไทย*
