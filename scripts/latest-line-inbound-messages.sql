-- ข้อความ LINE ที่รับเข้า (INBOUND) ล่าสุด
-- รันใน Supabase → SQL Editor

-- แบบมี channel_thread_id ของลูกค้า (LINE user id)
select
  m.id,
  m.tenant_id,
  m.conversation_id,
  c.channel_thread_id as line_user_id,
  m.external_message_id,
  m.content,
  m.created_at
from messages m
join conversations c on c.id = m.conversation_id
where m.channel_type = 'LINE'
  and m.direction = 'INBOUND'
  -- and m.tenant_id = 'YOUR_TENANT_UUID'::uuid
order by m.created_at desc
limit 50;
