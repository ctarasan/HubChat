<#
.SYNOPSIS
  ดึงข้อความ LINE ที่รับเข้า (INBOUND) ล่าสุด ผ่าน Supabase PostgREST

  ต้องใช้ Service Role Key เพราะตาราง messages เปิด RLS แต่ใน repo ไม่มี policy ให้ anon อ่าน

  ตัวอย่าง:
    $env:SUPABASE_URL = "https://xxxxx.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbG..."
    .\scripts\latest-line-inbound-messages.ps1 -Limit 20 -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#>
param(
  [string] $SupabaseUrl = $env:SUPABASE_URL,
  [string] $ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [int] $Limit = 50,
  [string] $TenantId = ""
)

if (-not $SupabaseUrl -or -not $ServiceRoleKey) {
  Write-Error "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or parameters)."
  exit 1
}

$base = $SupabaseUrl.TrimEnd('/')
# เลือกเฉพาะคอลัมน์ที่ใช้ + embed conversations เพื่อได้ channel_thread_id (LINE user)
$select = "id,tenant_id,conversation_id,external_message_id,content,created_at,conversations(channel_thread_id)"
$selectEnc = [uri]::EscapeDataString($select)
$query = "channel_type=eq.LINE&direction=eq.INBOUND&order=created_at.desc&limit=$Limit&select=$selectEnc"
if ($TenantId) {
  $query = "tenant_id=eq.$TenantId&$query"
}

$uri = "$base/rest/v1/messages?$query"
$headers = @{
  "apikey"        = $ServiceRoleKey
  "Authorization" = "Bearer $ServiceRoleKey"
}

try {
  $rows = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
  $rows | ForEach-Object {
    [PSCustomObject]@{
      id                  = $_.id
      tenant_id           = $_.tenant_id
      conversation_id     = $_.conversation_id
      line_user_id        = $_.conversations.channel_thread_id
      external_message_id = $_.external_message_id
      content             = $_.content
      created_at          = $_.created_at
    }
  } | Format-Table -AutoSize
} catch {
  Write-Error $_
  exit 1
}
