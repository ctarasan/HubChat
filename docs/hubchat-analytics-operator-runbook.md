# HubChat Analytics Operator Runbook

คู่มือสำหรับผู้ดำเนินการ (**ADMIN** / **MANAGER**) ที่ต้องดู **ภาพรวม tenant** ผ่านหน้า Analytics ใน HubChat

**โดเมน production มาตรฐาน:** `https://smartkorp-hub-chat.vercel.app`

**หน้า Analytics:** `https://smartkorp-hub-chat.vercel.app/dashboard/analytics`

---

## วัตถุประสงค์

เอกสารนี้อธิบายวิธีเปิดหน้า Analytics สิทธิ์ตามบทบาท ความหมายของตัวเลขที่แสดง การสูบข้อมูลจาก API แบบ read-only และหลักฐาน production smoke ที่ผ่านแล้ว

เหมาะสำหรับ:

- **ADMIN** — เปิด Analytics ได้เต็มรูปแบบ
- **MANAGER** — เปิด Analytics ได้เต็มรูปแบบ (read-only เช่นเดียวกับ ADMIN บนหน้านี้)
- **ไม่เหมาะสำหรับ SALES** — ไม่มีเมนู Analytics / เข้า URL โดยตรงถูกปฏิเสธ

---

## สถานะ production ปัจจุบัน (อ้างอิงหลัง smoke ผ่าน)

| รายการ | สถานะ |
|--------|--------|
| หน้า `/dashboard/analytics` | เปิดใช้งานบน production |
| API `GET /api/analytics/overview` | ใช้งานได้สำหรับ ADMIN / MANAGER |
| ADMIN | เปิดหน้า + สลับ range ได้ |
| MANAGER | เปิดหน้า + สลับ range ได้ |
| SALES | ไม่มีเมนู Analytics / URL โดยตรง = access denied |
| การแก้ไขข้อมูลจากหน้านี้ | **ไม่มี** — read-only, GET เท่านั้น |

---

## วิธีเปิด Analytics

1. เข้าสู่ระบบ HubChat ด้วยบัญชี **ADMIN** หรือ **MANAGER**
2. แถบนำทางด้านซ้าย → **Analytics** (ไอคอน AN)
3. หรือเปิด URL โดยตรง: `/dashboard/analytics`

---

## สิทธิ์ตามบทบาท (Role)

### ADMIN และ MANAGER

- เปิด `/dashboard/analytics` ได้
- สลับช่วงเวลา: **วันนี้** (`today`), **7 วัน** (`7d`), **30 วัน** (`30d`)
- กด **Reload** เพื่อโหลด snapshot ใหม่จาก API
- **ไม่มี** ปุ่ม Save / แก้ไข lead / ส่งข้อความบนหน้านี้

### SALES

- **ไม่มี**รายการ **Analytics** ในแถบนำทาง
- เปิด `/dashboard/analytics` โดยตรง → **Access denied** (ไม่เรียก overview API)

---

## ช่วงเวลา (Range selector)

| ปุ่มใน UI | Query `range=` | ความหมายโดยสรุป |
|-----------|----------------|------------------|
| วันนี้ | `today` | ตั้งแต่ต้นวัน UTC ของเวลาที่โหลด ถึง `period.endAt` |
| 7 วัน | `7d` | ย้อนหลัง 7 วันจากเวลาที่โหลด (ค่าเริ่มต้นถ้าไม่ส่ง query) |
| 30 วัน | `30d` | ย้อนหลัง 30 วันจากเวลาที่โหลด |

หัวข้อหน้าแสดง **ช่วงเวลา** และ **อัปเดต** จากฟิลด์ API:

- `period.startAt` / `period.endAt` — ช่วงที่ใช้นับข้อความใน period (เช่น inbound/outbound ต่อ channel)
- `generatedAt` — เวลาที่ระบบสร้าง snapshot ของการนับ (ไม่ใช่ live stream)

**Analytics ไม่ใช่ real-time dashboard:** ตัวเลขเป็นผลรวม/จำนวนที่คำนวณเมื่อเรียก API ครั้งนั้น หลังเปลี่ยน range หรือ Reload จะได้ snapshot ใหม่

---

## ข้อมูลที่แสดง (aggregate / count-only)

หน้า Analytics แสดงเฉพาะ **ตัวเลขสรุปและตารางทีม** จาก `GET /api/analytics/overview` เท่านั้น

**มีในหน้า (โดยสรุป):**

- Summary cards (เช่น open conversations, SLA overdue, qualified leads, ฯลฯ)
- Conversation / SLA snapshot
- Lead pipeline (สถานะ CRM + management rollup)
- Channel breakdown (LINE / Facebook / Instagram — รวมถึงช่วงที่ count = 0)
- Team workload (ต่อ sales agent)
- Follow-up counts

**ไม่มีในหน้า / ไม่มีใน API response สำหรับ operator:**

- เนื้อหาข้อความลูกค้า (message body)
- raw webhook payload
- media URLs
- ชื่อ/เบอร์/อีเมลลูกค้า
- `follow_up_note`
- tokens / secrets

**ไม่ถือว่า Analytics เป็นรายงานข้อความดิบ** — ใช้สำหรับภาพรวม workload และ pipeline เท่านั้น

---

## ความหมายตัวเลขสำคัญ (Metric semantics)

### SLA breach rate (`sla.rates.breachRate`)

| หัวข้อ | รายละเอียด |
|--------|------------|
| ค่าใน API | **อัตราส่วน (ratio) 0..1** เช่น `0.25` |
| การแสดงใน UI | **เปอร์เซ็นต์ ทศนิยม 2 ตำแหน่ง** — `0.25` → **25.00%** |
| สูตร (snapshot) | `overdue ÷ active` เมื่อ `active > 0` (`active` = conversations ที่มี `sla_due_at` ไม่เป็น null) |
| คำอธิบายใน UI | overdue ÷ active SLA (snapshot) — **ไม่ใช่**อัตรา breach ตลอดช่วง 7/30 วันแบบ time-series |

### Management rollup — `FOLLOW_UP`

| หัวข้อ | รายละเอียด |
|--------|------------|
| ป้ายใน UI | **Follow-up scheduled** |
| ความหมาย | จำนวน conversations ที่มี **`follow_up_at` ตั้งค่าไว้** (scheduled) |
| **ไม่ใช่** | สถานะ lead management ชื่อ `FOLLOW_UP` โดยตรงจาก dropdown Inbox |

### Management rollup — `CLOSED`

| หัวข้อ | รายละเอียด |
|--------|------------|
| ป้ายใน UI | **ไม่ผ่านคุณสมบัติ (Unqualified)** |
| ความหมายใน API | นับจาก lead status **`UNQUALIFIED`** |
| **ห้ามตีความ** | ว่าเป็น “resolved conversations” หรือเคสปิดแล้ว |

### Team workload

| คอลัมน์ที่มี | คอลัมน์ที่ **ไม่มี** |
|-------------|---------------------|
| Agent, Open conversations, SLA overdue, Follow-up overdue, Assigned leads | **`resolvedInRange`** — API ไม่ส่งฟิลด์นี้ หน้า UI ไม่แสดง |

### สถานะ conversation ใน snapshot

| ค่า | ความหมายโดยสรุป |
|-----|------------------|
| open / pending | workload ที่ยังเปิดอยู่ |
| resolved / archived | จำนวน snapshot ตามสถานะใน DB (ไม่ใช่ “resolved ในช่วง range” ทุกกรณี) |
| new in period | conversations สร้างใหม่ระหว่าง `period.startAt`–`period.endAt` |

---

## Production smoke evidence (บันทึกแล้ว)

อ้างอิง: deploy หลัง PR **#146** (AN-2 UI) บน `https://smartkorp-hub-chat.vercel.app` — smoke production ผ่านตามรายการด้านล่าง

```
[x] ADMIN: เปิด /dashboard/analytics ได้
[x] MANAGER: เปิด /dashboard/analytics ได้
[x] SALES: ไม่เห็นเมนู Analytics
[x] SALES: เปิด /dashboard/analytics โดยตรง → access denied (ไม่ crash)
[x] Range วันนี้ (today): โหลดได้, GET overview สำเร็จ
[x] Range 7 วัน (7d): โหลดได้
[x] Range 30 วัน (30d): โหลดได้
[x] Network: มีเฉพาะ GET /api/analytics/overview?range=...
[x] ไม่มี POST / PATCH / DELETE จากหน้า Analytics
[x] Response ไม่มี token/secret/stack trace/raw payload ใน body ที่ operator เห็น
[x] Desktop: layout / cards / tables แสดงครบ
[x] Mobile (~375px): layout ไม่แตก (rail + scroll ได้)
```

**Sign-off:** **PASS** — production smoke completed **2026-05-29** (post PR #146 deploy on `https://smartkorp-hub-chat.vercel.app`; operator checklist above all checked).

---

## Post-change / regression smoke (คัดลอกใส่ ticket)

ใช้หลัง deploy ที่แตะ Analytics UI หรือ overview API (ทีม tech เป็นผู้ deploy)

```
[ ] ADMIN + MANAGER: เปิด /dashboard/analytics
[ ] SALES: nav ซ่อน + direct URL denied
[ ] today / 7d / 30d โหลดได้
[ ] Reload ทำงาน
[ ] GET overview เท่านั้น (ไม่มี mutation)
[ ] breach rate แสดงเป็น % (เช่น 25.00%)
[ ] ไม่มีข้อความลูกค้าใน Network response body
```

---

## การแก้ปัญหา (Troubleshooting)

### หน้าแสดง "Missing session" / ให้ Sign in

- Session หมดอายุ
- **แก้:** Sign in ใหม่ที่ `/login` แล้วเปิด `/dashboard/analytics`

### Access denied / ไม่มีสิทธิ์

- บัญชีเป็น **SALES** (พฤติกรรมถูกต้อง)
- บัญชีไม่ใช่ ADMIN หรือ MANAGER ที่ active ใน tenant
- **แก้:** ยืนยันบทบาทใน Team / ใช้บัญชี MANAGER หรือ ADMIN

### ตัวเลขเป็นศูนย์ทั้งหมด / sparse empty

- Tenant ยังไม่มี conversations/leads/messages ในช่วงที่เลือก
- ช่วง **วันนี้** อาจว่างถ้ายังไม่มีกิจกรรมวันนี้ (UTC)
- **แก้:** ลอง **7 วัน** หรือ **30 วัน**; ยืนยันว่ามีข้อมูลใน Inbox/Leads; กด Reload

### เปลี่ยน range แล้ว error

- Session หมด / network
- **แก้:** Reload หน้า; เปิด DevTools → Network → ดู `GET /api/analytics/overview?range=...` (status 200/401/403/500); อย่า copy response ทั้งก้อนเข้า ticket ถ้ามี auth header

### ADMIN/MANAGER ได้ HTTP 403 จาก overview

- **ไม่ปกติ** — ควรได้ 200
- **แก้:** แจ้งทีม tech (auth / sales_agents role / tenant header); อย่าแชร์ Bearer token หรือ `x-tenant-id` ค่าจริงในที่สาธารณะ

### ตัวเลขไม่ตรงกับ Inbox ทีละแถว

- Analytics เป็น **ภาพรวม tenant** และ snapshot — Inbox เป็นหน้าแรกของ list + filter คนละมิติ
- SLA due soon ใน Inbox ใช้ policy warning เดียวกัน แต่การนับไม่ใช่ “แถวเดียวกับที่เห็นในหน้าแรกของ Inbox”
- **แก้:** ใช้ Analytics สำหรับ trend/workload; ใช้ Inbox/Leads สำหรับรายการราย conversation

### สนับสนุน / ticket hygiene

- **ห้าม** วาง access token, service role key, webhook secret, หรือ raw API response ที่มี PII ใน Slack/email/ticket
- อธิบาย role, range, เวลา (`generatedAt`), และ HTTP status แทน

---

## E2E automation (optional)

Spec: `tests/e2e/analytics-dashboard-smoke.spec.ts`

```bash
npx playwright test tests/e2e/analytics-dashboard-smoke.spec.ts
```

**ต้องมี env (อย่า commit ค่าจริง):**

| ตัวแปร | ใช้สำหรับ |
|--------|-----------|
| `E2E_BASE_URL` | URL เป้าหมาย (staging หรือ production ตามนโยบายทีม) |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | เทส ADMIN path + range switch |
| `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD` | เทส MANAGER (optional ใน spec — skip ถ้าไม่ตั้ง) |
| `E2E_SALES_EMAIL` / `E2E_SALES_PASSWORD` | เทส SALES denied |

โดยทั่วไปใช้ `.env.e2e.local` (gitignored) ตาม `docs/hubchat-smoke-test-inventory.md`

---

## สิ่งที่ห้ามทำ (Do-not-do)

1. **ห้าม** คาดหวังให้ Analytics แก้ lead / ส่งข้อความ / ตั้ง SLA policy
2. **ห้าม** ตีความ **CLOSED** ใน rollup ว่าเป็น resolved conversations
3. **ห้าม** ตีความ **FOLLOW_UP** ใน rollup ว่าเท่ากับสถานะ follow-up SLA runtime ทุกจุด (เป็น scheduled count)
4. **ห้าม** แชร์ tokens, secrets, message body, หรือ raw webhook ในเอกสารสนับสนุน
5. **ห้าม** ใช้ Analytics แทน Ops Runtime หรือ Channel Settings สำหรับปัญหา queue/channel

---

## Quick operator checklist (ฉบับย่อ)

| # | ขั้นตอน | ADMIN | MANAGER | SALES |
|---|--------|-------|---------|-------|
| 1 | Login production | ✓ | ✓ | ✓ |
| 2 | เห็นเมนู Analytics | ✓ | ✓ | ✗ |
| 3 | เปิด `/dashboard/analytics` | ✓ | ✓ | ✗ (denied) |
| 4 | สลับ today / 7d / 30d | ✓ | ✓ | ✗ |
| 5 | เฉพาะ GET overview (read-only) | ✓ | ✓ | — |

---

## เอกสารที่เกี่ยวข้อง

- Smoke inventory: `docs/hubchat-smoke-test-inventory.md` (§ Analytics dashboard)
- SLA Policy (แยกจาก Analytics): `docs/hubchat-sla-operator-runbook.md`
- Launch evidence template: `docs/hubchat-final-smoke-evidence-template.md`
- E2E spec: `tests/e2e/analytics-dashboard-smoke.spec.ts`

---

*อัปเดตล่าสุด: AN-3 — หลัง AN-1 API, AN-2 UI (#146), และ production smoke PASS*
