-- Clear (delete) queue jobs stuck in PENDING.
-- Run in Supabase → SQL Editor (postgres / service role).
-- Warning: deleted jobs will never be processed (no message insert for inbound, etc.).

-- 1) Preview ก่อนลบ
select id, tenant_id, topic, status, available_at, retry_count, idempotency_key, created_at
from queue_jobs
where status = 'PENDING'
order by created_at asc;

-- 2) ลบทุก PENDING
-- delete from queue_jobs
-- where status = 'PENDING';

-- 3) ลบเฉพาะ inbound (ถ้าต้องการ)
-- delete from queue_jobs
-- where status = 'PENDING'
--   and topic = 'message.inbound.normalized';

-- 4) ลบเฉพาะ tenant
-- delete from queue_jobs
-- where status = 'PENDING'
--   and tenant_id = 'YOUR_TENANT_UUID'::uuid;

-- 5) Worker ค้างตอน PROCESSING (worker crash) — ถ้าต้องการรีเซ็ตให้ poll ได้อีก
--    แก้เป็น PENDING แทนการลบ (หรือจะลบก็ได้ถ้าไม่ต้องการประมวลผลต่อ)
-- update queue_jobs
-- set status = 'PENDING', updated_at = now()
-- where status = 'PROCESSING';
