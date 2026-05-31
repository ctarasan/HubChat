# HubChat SLA Operator Runbook

คู่มือสำหรับผู้ดำเนินการ (Admin / Manager) ที่ต้อง **ตั้งค่า ตรวจสอบ และแก้ปัญหา SLA Policy** ใน HubChat

**โดเมน production มาตรฐาน:** `https://smartkorp-hub-chat.vercel.app`

**หน้าตั้งค่า SLA Policy:** `https://smartkorp-hub-chat.vercel.app/dashboard/sla-policy`

---

## วัตถุประสงค์

เอกสารนี้อธิบายวิธีใช้งานหน้า **SLA Policy** อย่างปลอดภัย รวมถึงความหมายของแต่ละฟิลด์ ขั้นตอนหลังบันทึก และการแก้ปัญหาเบื้องต้น

เหมาะสำหรับ:

- **ADMIN** — ดู แก้ไข บันทึก และ reload นโยบาย
- **MANAGER** — ดูอย่างเดียว (read-only) เพื่อตรวจสอบมาตรฐานทีม
- ไม่เหมาะสำหรับ **SALES** — ไม่มีสิทธิ์เข้าถึงหน้านี้

---

## สถานะ production ปัจจุบัน (อ้างอิงหลัง smoke ผ่าน)

| รายการ | สถานะ |
|--------|--------|
| หน้า `/dashboard/sla-policy` | เปิดใช้งานบน production |
| ตาราง `tenant_sla_policies` | มีอยู่บน production (ยืนยันแล้ว) |
| ADMIN | แก้ไขและบันทึก policy ได้ |
| MANAGER | ดูอย่างเดียว |
| SALES | ไม่มีเมนู SLA / เข้า URL โดยตรงถูกปฏิเสธ |
| **businessHours** | Coming soon — ยังไม่รองรับ |
| **channelOverrides** | Coming soon — ยังไม่รองรับ |
| **auditHistory** | Coming soon — ยังไม่รองรับ |

**หมายเหตุ:** ค่า SLA ที่ใช้จริงใน Inbox (deadline inbound, ฟิลเตอร์ **due soon**, badge) มาจากนโยบาย tenant ผ่าน API — ไม่ใช่ค่าคงที่ใน UI อีกต่อไป

---

## สิทธิ์ตามบทบาท (Role)

### ADMIN

- เปิด `/dashboard/sla-policy` ได้
- ดูและแก้ไขทุกฟิลด์ที่รองรับ
- ใช้ **Save Policy**, **Reset Changes**, **Reload** ได้
- บันทึกแล้ว reload ต้องเห็นค่าเดิม (persist)

### MANAGER

- เปิด `/dashboard/sla-policy` ได้
- เห็นแบนเนอร์: *「คุณมีสิทธิ์ดู SLA Policy แต่ไม่สามารถแก้ไขได้」*
- ช่องกรอกและสวิตช์ **disabled**
- **ไม่มี** ปุ่ม Save ที่ใช้งานได้

### SALES

- **ไม่มี**รายการนำทาง SLA ในแถบด้านข้าง
- เปิด `/dashboard/sla-policy` โดยตรง → **Access denied** / ไม่มีสิทธิ์

---

## วิธีเปิดหน้า SLA Policy

1. เข้าสู่ระบบ HubChat ด้วยบัญชีที่มีสิทธิ์ (ADMIN หรือ MANAGER)
2. ไปที่แถบนำทาง → **SLA** (ไอคอน SLA)
3. หรือเปิด URL โดยตรง: `/dashboard/sla-policy`

---

## คำอธิบายฟิลด์ SLA Policy

### ระดับ Policy (ทั้ง tenant)

| ฟิลด์ (ไทย) | คำศัพท์อังกฤษ | ความหมาย |
|-------------|----------------|----------|
| เปิดใช้งาน SLA Policy | Policy enabled | ถ้าปิด — ระบบจะไม่ตั้ง `sla_due_at` ใหม่จาก inbound ตามนโยบาย tenant |
| เตือนก่อนครบ SLA (ทั้งระบบ) | Global **warning before breach** | ช่วงเวลาก่อนถึง deadline ที่ใช้จัดกลุ่ม **due soon** ใน Inbox/Leads (นาที) |
| ไม่นับ SLA เมื่อ conversation เป็น Resolved | Exclude resolved | ลูกค้าทักขณะสถานะ Resolved อาจไม่ตั้ง SLA (ตามนโยบาย) |
| ไม่นับ SLA เมื่อถูก Archive | Exclude archived | ลูกค้าทักขณะ ARCHIVED อาจไม่ตั้ง SLA (ตามนโยบาย) |
| Business hours | — | **Coming soon** — อย่าถือว่าใช้งานได้ |
| Channel-specific SLA | — | **Coming soon** — อย่าถือว่าใช้งานได้ |

### กฎตาม Rule / Stage (แต่ละแถว)

| Rule key | ชื่อที่แสดง | พฤติกรรมโดยสรุป |
|----------|------------|------------------|
| **NEW_FIRST_RESPONSE** | New first response / ลูกค้าใหม่ | ครั้งแรกที่ยังไม่มี first response — ต้องตอบก่อนครบเป้าหมาย |
| **ONGOING_INBOUND_RESPONSE** | Ongoing inbound response | ลูกค้าส่งข้อความเข้ามาระหว่างคุยอยู่ — เริ่มนับ SLA ใหม่เมื่อมี inbound |
| **QUALIFIED_FOLLOW_UP** | Qualified follow-up | เป้าหมาย follow-up สำหรับ Lead คุณภาพสูง — **เก็บใน policy ได้** แต่ runtime follow-up SLA อาจยังไม่ครบทุกจุด |
| **GENERAL_FOLLOW_UP** | General follow-up | เป้าหมาย follow-up ทั่วไป — **เก็บใน policy ได้** แต่ runtime follow-up SLA อาจยังไม่ครบทุกจุด |
| **REOPENED_RESPONSE** | Reopened response | ลูกค้ากลับมาทักหลังปิดเคส — นับ SLA ใหม่เมื่อ reopen |

แต่ละ rule มี:

- **เปิดใช้งาน rule** — ถ้าปิด จะไม่ใช้เป้าหมายนั้นสำหรับ inbound ที่ตรงเงื่อนไข
- **เป้าหมาย SLA** — ระยะเวลา (นาที / ชั่วโมง / วัน) ก่อนครบ deadline
- **เตือนก่อนครบ (ต่อ rule)** — ว่าง = ใช้ค่า **Global warning**; ถ้ากรอก ต้องน้อยกว่าเป้าหมาย rule

### สิ่งที่ Inbox แสดง (อ้างอิง)

| สถานะ | ความหมาย |
|--------|----------|
| **overdue** | เลย `sla_due_at` แล้ว |
| **due soon** | ยังไม่ overdue แต่อยู่ในช่วง **warning before breach** จาก policy |
| **ok** | ยังเหลือเวลามากกว่าช่วง due soon |

Badge **due soon** บน Dashboard/Leads ใช้ค่า warning จาก API (`pageInfo.slaWarningBeforeBreachMinutes`) ให้สอดคล้องกับฟิลเตอร์ **due_soon**

---

## ขั้นตอนปฏิบัติการที่แนะนำ (ปลอดภัย)

### ก่อนเปลี่ยน

1. เปิด `/dashboard/sla-policy` แล้ว **Reload** เพื่อดูค่าปัจจุบัน
2. จดหรือ screenshot ค่าสำคัญ (อย่าใส่ข้อมูลลูกค้าจริงในที่สาธารณะ)
3. ปรึกษาทีมก่อนตั้งเป้าหมายสั้นมาก (เช่น 5–15 นาที) — จะทำให้ overdue เพิ่มเร็ว
4. เข้าใจว่า **ไม่มี** RESOLVED / ARCHIVED เป็นแถว rule แยก — ใช้ toggle **Exclude resolved / archived** แทน

### ขั้นตอนเปลี่ยน

1. แก้ทีละกลุ่ม (เช่น แค่ Global warning ก่อน แล้วค่อย rule หนึ่งตัว)
2. ตรวจว่าไม่มีข้อความ error สีแดงใต้ฟิลด์
3. กด **Save Policy** (ปุ่มจะเปิดเมื่อมีการแก้และ validation ผ่าน)
4. รอข้อความสำเร็จ: *「บันทึก SLA Policy แล้ว」*
5. กด **Reload** — ค่าต้องตรงกับที่บันทึก
6. เปิด **Dashboard (Inbox)** และ **Leads** — ทดสอบฟิลเตอร์ **due_soon** / badge / overdue ว่าสมเหตุสมผล

### หลังบันทึก (smoke สั้น)

- ADMIN: save + reload persist
- MANAGER: ยัง read-only
- SALES: ยังไม่เห็นเมนู SLA
- Inbox/Leads: due_soon และ badge สอดคล้องกันโดยประมาณ

---

## Post-change smoke checklist (คัดลอกใส่ ticket ได้)

```
[ ] ADMIN: Save สำเร็จ → Reload → ค่า persist
[ ] MANAGER: แบนเนอร์ read-only + ช่อง disabled + ไม่มี Save
[ ] SALES: ไม่มี nav SLA + URL โดยตรง = access denied
[ ] Dashboard: โหลด Inbox ได้, ฟิลเตอร์ due_soon ทำงาน
[ ] Leads: โหลดได้, badge due soon / overdue แสดงตาม policy
[ ] Desktop: ช่องตัวเลข duration พิมพ์ได้ (ไม่แคบเกินไป)
[ ] Mobile (~375px): duration ไม่ล้นจอแนวนอน
```

---

## การแก้ปัญหา (Troubleshooting)

### หน้าแสดง "Missing session" / ให้ Sign in

- Session หมดอายุหรือยังไม่ login
- **แก้:** Sign in ใหม่ที่ `/login` แล้วเปิด `/dashboard/sla-policy` อีกครั้ง

### ผู้ใช้เปิดหน้า SLA ไม่ได้ (ไม่ใช่ ADMIN/MANAGER)

- **SALES** — ตั้งใจไม่ให้เข้า
- บทบาทอื่นที่ไม่ใช่ MANAGER/ADMIN — API คืน 403
- **แก้:** ใช้บัญชี MANAGER หรือ ADMIN

### ปุ่ม Save กดไม่ได้ (disabled)

- ยังไม่มีการแก้ฟอร์ม (dirty)
- มี validation error (ดูข้อความแดงใต้ฟิลด์)
- บทบาทไม่ใช่ ADMIN
- **แก้:** แก้ค่าให้ถูกต้อง หรือใช้บัญชี ADMIN

### บันทึกแล้วได้ validation error

- เป้าหมาย rule ที่เปิดอยู่ต้องมีตัวเลข ≥ 1
- เตือนก่อนครบ (ต่อ rule) ต้องน้อยกว่าเป้าหมาย rule
- **แก้:** ปรับตัวเลขหรือปิด rule ที่ไม่ใช้

### Conflict / HTTP 409

- มี ADMIN คนอื่นบันทึก policy ไปแล้ว (version ไม่ตรง)
- **แก้:** อ่านข้อความ *「Policy ถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดข้อมูลใหม่ก่อนบันทึก」* → กด **Reload** → บันทึกใหม่ถ้าจำเป็น

### Reload แล้วค่าไม่คง (ไม่ persist)

- ตาราง `tenant_sla_policies` อาจยังไม่มีบน environment นั้น (migration SLA-1 ยังไม่ apply)
- บันทึกล้มเหลวแต่ไม่สังเกต error
- **แก:** ตรวจ migration / ดู error หลัง Save / ให้ทีม tech ตรวจ API `GET/PATCH /api/sla-policy`

### ช่องตัวเลขแคบ พิมพ์ยาก

- ควรแก้แล้วใน release **SLA-4.1** (CSS grid ให้ input กว้าง ~7rem+)
- **แก:** hard refresh (Ctrl+F5) หรือยืนยันว่า deploy ล่าสุดบน Vercel แล้ว

### Badge due soon ไม่ตรงกับฟิลเตอร์ due_soon

- ต้อง reload หน้า Inbox/Leads หลังเปลี่ยน policy (ให้ได้ `pageInfo.slaWarningBeforeBreachMinutes` ใหม่)
- บทสนทนาเก่าอาจมี `sla_due_at` ที่ตั้งก่อนเปลี่ยน policy (apply-forward — ไม่ recalc ย้อนหลัง)
- **แก:** ทดสอบ inbound ใหม่หรือบทสนทนาที่มี SLA ถูกตั้งหลัง save

### MANAGER แก้ไม่ได้

- **พฤติกรรมถูกต้อง** — MANAGER เป็น read-only เท่านั้น

### SALES เห็นเมนูหรือเข้าได้

- **ไม่ควรเกิด** — แจ้งทีม tech; ตรวจ role ของบัญชี

### API error หลัง deploy / migration

- `GET /api/sla-policy` ล้มเหลว — ตรวจว่า migration `tenant_sla_policies` มีบน DB ของ environment นั้น
- **แก:** ให้ทีม tech apply migration SLA-1 บน staging/production ตามแผน (operator ไม่รัน migration เอง)

---

## Migration และการ audit

| หัวข้อ | คำแนะนำ |
|--------|---------|
| Migration SLA-1 | ต้องมีก่อน tenant จะ **persist** policy เฉพาะ tenant ได้ |
| Production | ยืนยันแล้วว่ามีตาราง `tenant_sla_policies` |
| ตรวจใน Supabase | ดู migration history / SQL ที่ apply แล้ว (ผ่าน Dashboard ของทีม tech) |
| ลบตาราง | **ห้าม** drop `tenant_sla_policies` เว้นแต่มีการอนุมัติชัดเจน |

ไฟล์ migration อ้างอิงใน repo (สำหรับทีม tech): `supabase/migrations/20260601120000_phase_ii_sla1_tenant_sla_policies.sql`

---

## สิ่งที่ห้ามทำ (Do-not-do)

1. **ห้าม** reset production database
2. **ห้าม** drop ตาราง `tenant_sla_policies`
3. **ห้าม** ตั้ง SLA สั้นมากโดยไม่ตกลงทีม — จะกระทบ overdue และภาระงานทันที
4. **ห้าม** ถือว่า **businessHours / channelOverrides / auditHistory** ใช้งานได้ (Coming soon)
5. **ห้าม** แก้ Retention execute หรือ Channel Settings secrets เพื่อแก้ปัญหา SLA
6. **ห้าม** วาง secrets, service role key, หรือ raw env ใน ticket / chat / screenshot

---

## Quick operator checklist (ฉบับย่อ)

| # | ขั้นตอน | ADMIN | MANAGER | SALES |
|---|--------|-------|---------|-------|
| 1 | Login production | ✓ | ✓ | ✓ |
| 2 | เห็นเมนู SLA | ✓ | ✓ | ✗ |
| 3 | เปิด `/dashboard/sla-policy` | ✓ | ✓ | ✗ (denied) |
| 4 | แก้และ Save ได้ | ✓ | ✗ | ✗ |
| 5 | Reload แล้วค่า persist | ✓ | — | — |
| 6 | Inbox/Leads due_soon สมเหตุสมผล | ✓ | ดูได้ | ✓ (inbox) |

---

## เอกสารที่เกี่ยวข้อง

- คู่มือผู้ใช้ (ภาพรวม SLA ใน Inbox): `docs/user-manual/hubchat-operator-user-manual-th.md` § การแสดง SLA
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`
- Retention (แยกจาก SLA): `docs/hubchat-retention-operator-runbook.md`
- Channel Settings (แยกจาก SLA): `docs/hubchat-channel-settings-runtime-confidence-runbook.md`

---

*อัปเดตล่าสุด: หลัง SLA-1 ถึง SLA-4.1 และ production smoke ผ่าน (มี notes ตามรายงานทีม)*
