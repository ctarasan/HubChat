# คู่มือผู้ใช้งาน SmartKorp HubChat (ภาษาไทย)

**สำหรับ:** พนักงานขาย (SALES), ผู้จัดการทีม (MANAGER), ผู้ดูแลระบบ (ADMIN)
**โดเมน Production:** https://smartkorp-hub-chat.vercel.app
**เวอร์ชันเอกสาร:** 1.0 (อ้างอิงฟังก์ชัน production ปัจจุบัน)

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [การเข้าสู่ระบบ (Login)](#2-การเข้าสู่ระบบ-login)
3. [Dashboard และ Team Inbox](#3-dashboard-และ-team-inbox)
4. [รายการบทสนทนา (Conversation list)](#4-รายการบทสนทนา-conversation-list)
5. [หน้าต่างแชทและ Composer](#5-หน้าต่างแชทและ-composer)
6. [การส่งข้อความ รูปภาพ และ PDF](#6-การส่งข้อความ-รูปภาพ-และ-pdf)
7. [ข้อจำกัดตามช่องทาง LINE / Facebook / Instagram](#7-ข้อจำกัดตามช่องทาง-line--facebook--instagram)
8. [สถานะ Lead](#8-สถานะ-lead)
9. [การตั้ง Follow-up](#9-การตั้ง-follow-up)
10. [การแสดง SLA](#10-การแสดง-sla)
11. [การมอบหมายและความเป็นเจ้าของบทสนทนา](#11-การมอบหมายและความเป็นเจ้าของบทสนทนา)
12. [Channel Settings (ADMIN)](#12-channel-settings-admin)
13. [Ops Runtime (ADMIN)](#13-ops-runtime-admin)
14. [การแก้ปัญหาเบื้องต้น](#14-การแก้ปัญหาเบื้องต้น)

---

## 1. ภาพรวมระบบ

HubChat เป็นระบบ **Team Inbox** สำหรับตอบลูกค้าจากหลายช่องทาง (LINE, Facebook Messenger, Instagram DM) ในที่เดียว

| บทบาท | สิ่งที่ทำได้โดยทั่วไป |
|--------|----------------------|
| **SALES** | ดูและตอบบทสนทนาที่มอบหมายให้ตนเอง อัปเดตสถานะ Lead และ Follow-up |
| **MANAGER** | ดู Inbox ทั้งทีม กรอง/มอบหมายบทสนทนา จัดการ workflow |
| **ADMIN** | สิทธิ์ MANAGER ทั้งหมด + **Channel Settings** + **Ops Runtime** |

เมนูหลัก (เมื่อเข้าสู่ระบบแล้ว):

- **Dashboard** — `/dashboard` (Inbox หลัก)
- **Team members** — `/dashboard/team-members` (MANAGER / ADMIN)
- **Ops Runtime** — `/dashboard/ops` (ADMIN เท่านั้น)
- **Channel Settings** — `/dashboard/channel-settings` (ADMIN เท่านั้น)

---

## 2. การเข้าสู่ระบบ (Login)

1. เปิด https://smartkorp-hub-chat.vercel.app/login
2. กรอก **อีเมล** และ **รหัสผ่าน** ที่ผู้ดูแลระบบออกให้
3. กดปุ่มเข้าสู่ระบบ

**ผลลัพธ์ที่ถูกต้อง:** ระบบพาไปหน้า `/dashboard`

**ข้อความแจ้งเตือนที่พบบ่อย:**

| ข้อความ | ความหมาย | แนวทาง |
|---------|----------|--------|
| Invalid email or password | อีเมลหรือรหัสผ่านไม่ถูกต้อง | ตรวจสอบการพิมพ์หรือขอรีเซ็ตรหัสผ่าน |
| Your account is not active… | บัญชีไม่ active ใน workspace | ติดต่อผู้ดูแลระบบ |
| linked to more than one workspace | บัญชีผูกหลาย tenant | ติดต่อผู้ดูแลระบบให้ระบุ workspace |

**หมายเหตุด้านความปลอดภัย:** อย่าแชร์รหัสผ่าน อย่าแคปหน้าจอที่มี token หรือ session แล้วนำไปเผยแพร่

---

## 3. Dashboard และ Team Inbox

หน้า Dashboard คือ **ศูนย์กลางการทำงาน** ประกอบด้วย:

- **แถบสรุปด้านบน** — จำนวน unread, SLA overdue, Follow-up ที่ต้องดำเนินการ (MANAGER/ADMIN)
- **รายการบทสนทนาด้านซ้าย** — แสดงช่องทาง ชื่อลูกค้า ข้อความล่าสุด badge สถานะ
- **พanel แชทด้านขวา** — ประวัติข้อความ และเครื่องมือ Composer / workflow

### มุมมองตามบทบาท

- **SALES:** เห็นเฉพาะบทสนทนาที่ **มอบหมายให้ตนเอง** (หรือตามนโยบาย tenant)
- **MANAGER / ADMIN:** เห็น **Inbox ทั้งทีม** สามารถกรองตาม agent, สถานะ Lead, Follow-up, SLA

### การรีเฟรช

- รายการ Inbox อัปเดตเมื่อเลือกบทสนทนา ส่งข้อความ หรือใช้การรีเฟรชตามที่ UI กำหนด
- **Unread badge** บนรายการบทสนทนา **ไม่ใช่** คิวงาน backend — หากข้อความเข้าแล้วแต่ยัง unread ให้เปิดบทสนทนาเพื่ออ่าน/ตอบ

---

## 4. รายการบทสนทนา (Conversation list)

แต่ละแถวในรายการแสดงข้อมูลโดยสรุป:

- **ช่องทาง** — LINE, Facebook, Instagram
- **ชื่อลูกค้า / รูปโปรไฟล์**
- **ข้อความล่าสุด (preview)**
- **เวลาข้อความล่าสุด**
- **Badge** — เช่น SLA overdue, Follow-up today, Waiting on us
- **สถานะ Lead** (pill สี)
- **สรุปการมอบหมาย** — ใครเป็นเจ้าของบทสนทนา

### การกรอง (MANAGER / ADMIN)

เปิดตัวกรองขั้นสูงเพื่อค้นหา:

- ช่องทาง (channel)
- สถานะบทสนทนา (OPEN, PENDING, RESOLVED, …)
- **Lead status** (New, In progress, Follow-up, Won, Lost, Closed)
- **Follow-up** — today / overdue / upcoming
- **SLA** — overdue / due soon
- **Waiting** — needs response / waiting on customer
- **Assignment** — มอบหมายแล้ว / ยังไม่มอบหมาย / ตาม agent

กด chip กรองที่ active เพื่อล้างกรองนั้น

---

## 5. หน้าต่างแชทและ Composer

เมื่อเลือกบทสนทนา ด้านขวาจะแสดง:

1. **หัวข้อบทสนทนา** — ชื่อลูกค้า, ช่องทาง, badge workflow
2. **ประวัติข้อความ** — inbound (ลูกค้า) และ outbound (พนักงาน)
3. **แถบเครื่องมือ (Chat actions)** — สถานะ Lead, มอบหมาย, Follow-up, สถานะบทสนทนา
4. **Composer** — ช่องพิมพ์ข้อความ, แนบไฟล์, ส่ง

### Composer — ขั้นตอนพื้นฐาน

1. เลือกบทสนทนาจากรายการด้านซ้าย
2. พิมพ์ข้อความใน Composer (ถ้าต้องการส่งข้อความ)
3. (ถ้าต้องการ) แนบรูปภาพหรือ PDF ตามที่ช่องทางรองรับ
4. กด **Send**

**ข้อกำหนด:** ต้องมีข้อความ **หรือ** ไฟล์แนบอย่างน้อยหนึ่งอย่าง จึงจะส่งได้

---

## 6. การส่งข้อความ รูปภาพ และ PDF

### ข้อความ (Text)

- รองรับทุกช่องทางที่ HubChat production เปิดใช้: **LINE, Facebook Messenger, Instagram DM**
- ข้อความส่งออกผ่านคิว outbound — หากส่งแล้วไม่ปรากฏที่ลูกค้า ดู [การแก้ปัญหาเบื้องต้น](#14-การแก้ปัญหาเบื้องต้น)

### รูปภาพ (Image)

| รายการ | ค่า |
|--------|-----|
| ชนิดไฟล์ | JPEG, PNG, WEBP |
| ขนาดสูงสุด (ทั่วไป) | 10 MB |
| Facebook / Instagram | สูงสุด **8 MB** ต่อรูป |

### เอกสาร PDF

| รายการ | ค่า |
|--------|-----|
| ชนิดไฟล์ | PDF (`application/pdf`) |
| ขนาดสูงสุด | 10 MB |

**หมายเหตุ:** Instagram **ไม่รองรับ** การส่ง PDF ใน production ปัจจุบัน

### ผลการส่งบางส่วน (Partial success)

บางครั้งข้อความส่งสำเร็จ แต่รูปหรือ PDF ล้มเหลว — UI จะแจ้ง เช่น *Text sent successfully, but image failed to send.* ให้ตรวจสอบข้อจำกัดช่องทางและลองใหม่

---

## 7. ข้อจำกัดตามช่องทาง LINE / Facebook / Instagram

### LINE

| ประเภท | รองรับ |
|--------|--------|
| ข้อความ | ใช่ |
| รูปภาพ | ใช่ (JPEG/PNG/WEBP, ≤10 MB) |
| PDF | ใช่ (≤10 MB) |

### Facebook Messenger

| ประเภท | รองรับ |
|--------|--------|
| ข้อความ (DM) | ใช่ |
| รูปภาพ (DM) | ใช่ (≤8 MB) |
| PDF (DM) | ใช่ (≤10 MB) |
| **Comment thread (ครั้งแรก)** | **ข้อความเท่านั้น** — Private reply เปิด DM ได้ด้วย text ก่อน ยังไม่รองรับรูป/PDF ในรอบแรก |
| รูปใน comment thread | ไม่รองรับในเฟส production นี้ |

### Instagram DM

| ประเภท | รองรับ |
|--------|--------|
| ข้อความ | ใช่ (ภายใน **หน้าต่างเวลา** ที่ Meta กำหนด) |
| รูปภาพ | ใช่ (≤8 MB; caption รวมในคำสั่งส่งรูป) |
| PDF | **ไม่รองรับ** |

**Instagram นอกหน้าต่างเวลา:** หากลูกค้าไม่ได้ทัก DM มาภายในระยะที่ Meta อนุญาต ระบบจะไม่ส่ง DM ออกได้ — ให้ลูกค้าทักใหม่ก่อน

---

## 8. สถานะ Lead

HubChat ใช้สถานะ Lead สองระดับที่เกี่ยวข้องกัน:

### 8.1 สถานะที่แสดงใน Dashboard (Lead management status)

ใน UI ผู้ใช้เลือกสถานะจากรายการ:

| ค่าในระบบ | ป้ายใน UI | ความหมายโดยสรุป |
|-----------|-----------|------------------|
| `NEW` | New | ลีดใหม่ ยังไม่ดำเนินการ |
| `IN_PROGRESS` | In progress | กำลังติดตาม / อยู่ใน funnel |
| `FOLLOW_UP` | Follow-up | มีนัด Follow-up ที่ตั้งไว้ |
| `WON` | Won | ปิดการขายสำเร็จ |
| `LOST` | Lost | ไม่สำเร็จ / สูญเสีย |
| `CLOSED` | Closed | ปิดเคส (ไม่ qualified) |

เปลี่ยนสถานะได้จาก **Chat actions → Lead status** (เมื่อมีสิทธิ์) ระบบอนุญาตเฉพาะการเปลี่ยนที่ valid ตาม workflow — สถานะ **Won / Lost / Closed** เป็นสถานะสิ้นสุด (เปลี่ยนต่อไม่ได้)

### 8.2 สถานะ funnel เชิงลึก (Lead status ใน backend)

ระบบยังเก็บสถานะ funnel ที่ละเอียดกว่า ได้แก่:

| สถานะ | ความหมาย |
|--------|----------|
| **NEW** | ลีดใหม่ |
| **ASSIGNED** | มอบหมายให้ sales แล้ว |
| **CONTACTED** | ติดต่อลูกค้าแล้ว |
| **QUALIFIED** | ผ่านเกณฑ์ qualified |
| **WON** | ชนะการขาย |
| **LOST** | แพ้การขาย |

เมื่ออัปเดตสถานะจาก UI เป็น **In progress** ระบบจะ map ไปยัง funnel ที่เหมาะสม (เช่น CONTACTED, QUALIFIED) โดยไม่ลดระดับ funnel ลงโดยไม่จำเป็น

**สำหรับผู้ปฏิบัติงาน:** ใช้ dropdown **Lead status** ในแชทเป็นหลัก — ไม่ต้องจัดการ funnel ลึกด้วยตนเอง

---

## 9. การตั้ง Follow-up

Follow-up ช่วยเตือนให้กลับมาติดต่อลูกค้าตามวันเวลาที่กำหนด

### เปิด editor

1. เลือกบทสนทนา
2. ใน Chat actions กด **Follow-up** (หรือ Close follow-up editor เพื่อปิด)
3. กรอก **วันและเวลา** และ **บันทึก (note)** ได้สูงสุด 5,000 ตัวอักษร
4. กดบันทึก

### แก้ไข

- เปลี่ยนวันเวลาหรือ note แล้วบันทึกใหม่

### ล้าง (Clear)

- ลบวันที่ในช่อง datetime แล้วบันทึก — หรือใช้ flow ล้างตาม UI — เพื่อเคลียร์ `followUpAt` และ note

### Badge ที่เกี่ยวข้อง

- **Follow-up today** — ครบกำหนดวันนี้
- **Follow-up overdue** — เลยกำหนดแล้ว
- **Follow-up scheduled** — ยังไม่ถึงกำหนด

**สิทธิ์:**

- **SALES:** แก้ Follow-up ได้เฉพาะบทสนทนาที่มอบหมายให้ตนเอง
- **MANAGER / ADMIN:** แก้ได้ในขอบเขต tenant

**หมายเหตุ:** การตั้ง Follow-up **ไม่เปลี่ยนค่า SLA** โดยอัตโนมัติ

---

## 10. การแสดง SLA

SLA (Service Level Agreement) แสดงว่าบทสนทนาควรได้รับการตอบภายในเวลาที่กำหนด

### สิ่งที่เห็นใน UI

| Badge / ข้อความ | ความหมาย |
|-----------------|----------|
| **SLA overdue** | เลยกำหนดตอบแล้ว — ต้องดำเนินการด่วน |
| **SLA due soon** | ใกล้ครบกำหนด |
| สรุป **SLA overdue** ด้านบน Inbox | จำนวนบทสนทนา overdue ในหน้าที่โหลด |

### ความสัมพันธ์กับข้อความ

- SLA คำนวณจากเวลาข้อความลูกค้าล่าสุดและนโยบาย tenant
- เมื่อมี **first response** แล้ว สถานะ SLA active จะไม่ทำให้เข้าใจผิดหลังปิดเคส

### การกรอง

MANAGER / ADMIN กรอง **SLA: overdue** หรือ **due soon** จากตัวกรอง Inbox

---

## 11. การมอบหมายและความเป็นเจ้าของบทสนทนา

### สถานะ assignment

| สถานะ | ความหมาย |
|--------|----------|
| UNASSIGNED | ยังไม่มีเจ้าของ |
| ASSIGNED | มอบหมายให้ sales แล้ว |
| REASSIGNED | เปลี่ยนผู้รับผิดชอบ |
| UNASSIGNED_AGAIN | ถูกถอนมอบหมายอีกครั้ง |

### การมอบหมาย (MANAGER / ADMIN)

1. เลือกบทสนทนา
2. ใน **Assignment** เลือก sales agent จาก dropdown
3. กด **Assign** หรือ **Reassign**
4. กด **Unassign** เพื่อถอนมอบหมาย

### SALES

- เห็นและตอบได้ตามนโยบาย tenant — โดยทั่วไปเฉพาะบทสนทนาที่ **assigned ให้ตนเอง**
- ไม่สามารถเข้าถึงข้อมูลของ agent คนอื่น

### ความสัมพันธ์กับ Lead status

- การมอบหมายและ Lead status เป็นคนละฟิลด์ — มอบหมายแล้วควรอัปเดต Lead เป็น In progress / Contacted ตาม workflow ทีม

---

## 12. Channel Settings (ADMIN)

**เส้นทาง:** `/dashboard/channel-settings`
**สิทธิ์:** ADMIN เท่านั้น

ใช้ตรวจสอบและจัดการการเชื่อมต่อช่องทาง LINE, Facebook, Instagram

### สิ่งที่ตรวจใน UI

| รายการ | คำอธิบาย |
|--------|----------|
| เปิด/ปิดช่องทาง | Enabled / Disabled |
| **SET / EMPTY** | มี secret เก็บในระบบหรือไม่ (ไม่แสดงค่า secret) |
| ช่อง secret | **write-only** — ว่างเสมอเมื่อโหลดหน้า กรอกเฉพาะเมื่อต้องการเปลี่ยน |
| **Test connection** | ทดสอบว่าช่องทางพร้อมใช้งาน |
| Provider metadata | Facebook Page ID / Instagram account name |
| Save / Reload | บันทึกการตั้งค่าและโหลดสถานะล่าสุด |

### ผล Test connection

| ผล | ความหมายโดยสรุป |
|----|------------------|
| READY | การตั้งค่าครบและเชื่อมต่อได้ |
| NOT_CONFIGURED | ยังขาด secret หรือ metadata |
| ERROR | token หมดอายุ / provider ปฏิเสธ / ตั้งค่าไม่ถูกต้อง |

### Runtime mode (สำหรับผู้ดูแลระบบ)

Production ปัจจุบันใช้โหมดที่ปลอดภัย เช่น **ENV_ONLY** หรือ **DB_WITH_ENV_FALLBACK** — **ไม่ควรเปิด DB_ONLY** โดยไม่มีแผนอนุมัติแยก

**ความปลอดภัย:** อย่า copy token ลงแชทหรือเอกสาร อย่า screenshot ช่อง secret ที่มีค่า

---

## 13. Ops Runtime (ADMIN)

**เส้นทาง:** `/dashboard/ops`
**สิทธิ์:** ADMIN เท่านั้น

หน้านี้สรุปสุขภาพ **คิวงาน (queue)** และ **outbox** แบบ read-only ช่วยแยกปัญหา Vercel (webhook/API) กับ Railway (worker)

### ตัวชี้วัดหลัก

| ตัวชี้วัด | ความหมาย |
|----------|----------|
| **Pending** | งานรอ worker หยิบ — ยังไม่เริ่มประมวลผล |
| **Processing** | worker กำลังทำงาน |
| **Stale processing** | งานค้าง processing นานผิดปกติ — อาจ worker ค้าง/ล่ม |
| **Dead letter** | งานที่ล้มเหลวถาวรในอดีต — เปรียบเทียบกับ baseline ไม่ใช่แค่ตัวเลข > 0 |

แยกดู **Inbound queue**, **Outbound queue**, และ **Outbox**

### Operator guidance (ใน UI)

- Webhook รับแล้วแต่ Dashboard ไม่มีข้อความ → ดู outbox / inbound pending / stale
- Stale processing > 0 → ตรวจ Railway worker `/ready` และ logs
- Dead letter เพิ่มหลัง smoke test → ตรวจ worker logs
- Pending/processing/stale = 0 แต่ยังมี unread badge → ข้อความประมวลผลแล้ว เปิดบทสนทนาเพื่ออ่าน

**หมายเหตุ:** Warning จาก dead letter เก่า (baseline) อาจแสดงแม้ไม่มี outage จริง — ดูว่าตัวเลข **เพิ่มขึ้นหรือไม่**

กด **Refresh** เพื่อโหลดข้อมูลใหม่ (ไม่มี auto-polling)

---

## 14. การแก้ปัญหาเบื้องต้น

### 14.1 เข้าระบบไม่ได้

- ตรวจอีเมล/รหัสผ่าน
- ยืนยันว่าบัญชี active ใน sales_agents
- ติดต่อ ADMIN หากขึ้นข้อความ multi-workspace

### 14.2 ไม่เห็นบทสนทนาใน Inbox

| อาการ | แนวทาง |
|-------|--------|
| SALES ไม่เห็นเคส | ตรวจว่ามอบหมายให้ตนเองหรือยัง |
| MANAGER ไม่เห็นหลังกรอง | ล้าง filter / chip ที่ active |
| ลูกค้าทักแล้วไม่มีข้อความเลย | ADMIN ตรวจ Ops Runtime (inbound/outbox pending, stale) และ Channel Settings |

### 14.3 ส่งข้อความไม่สำเร็จ

- ตรวจข้อจำกัดช่องทาง (Instagram หน้าต่างเวลา, Facebook comment รอบแรก text-only)
- ตรวจขนาด/ชนิดไฟล์
- อ่านข้อความ error ใน Composer
- ADMIN: Test connection ใน Channel Settings + Ops Runtime outbound queue

### 14.4 ส่งแล้วลูกค้าไม่ได้รับ

- รอสักครู่ — outbound ผ่านคิว
- ADMIN ตรวจ outbound pending/stale/dead letter
- ตรวจ token หมดอายุ (Test connection ERROR)

### 14.5 SLA / Follow-up ไม่ตรงที่คาด

- ตรวจ timezone ของเครื่องเมื่อตั้ง Follow-up
- ตรวจว่าแก้ Follow-up ด้วยบัญชีที่มีสิทธิ์
- SLA ไม่อัปเดตจาก Follow-up — เป็นคนละฟิลด์

### 14.6 ข้อควรระวังด้านข้อมูล

- อย่าแชร์ screenshot ที่มีข้อมูลลูกค้าจริง token หรือ log production
- รายงานปัญหาให้ ADMIN พร้อม **เวลา ช่องทาง อาการ** โดยไม่แนบ secret

---

## เอกสารที่เกี่ยวข้อง (ใน repository)

Runbook สำหรับผู้ดูแลระบบ (ภาษาอังกฤษ) อยู่ในโฟลเดอร์ `docs/` เช่น:

- `hubchat-webhook-smoke-runbook.md`
- `hubchat-worker-queue-observability-runbook.md`
- `hubchat-channel-settings-runtime-confidence-runbook.md`
- `hubchat-final-go-no-go-runbook.md`

---

## ประวัติการแก้ไขเอกสาร

| วันที่ | รายการ |
|--------|--------|
| 2026-05 | เวอร์ชัน 1.0 — คู่มือ operator ภาษาไทยฉบับแรก (production v1) |

---

*เอกสารนี้เป็นคู่มือผู้ใช้งาน ไม่ใช่เอกสาร API หรือ runbook ด้านเทคนิคเชิงลึก หากพบความคลาดเคลื่อนเมื่อเทียบกับ UI จริง ให้แจ้งทีมพัฒนาและอัปเดต Markdown ในโฟลเดอร์นี้เป็นหลัก*
