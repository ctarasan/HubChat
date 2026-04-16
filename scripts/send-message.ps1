<#
.SYNOPSIS
  ส่ง outbound message ผ่าน API POST /api/messages/send
  (ชื่อไฟล์ทางเลือก: send-outbound-message.ps1 — เรียกสคริปต์นี้พร้อมรองรับ HUB_CHAT_BASE_URL)

  ต้องมี JWT จาก Supabase Auth (เช่น จากแอปหลัง login) และ user ต้องเป็น SALES/MANAGER/ADMIN
  ใน tenant นั้น (ตาม sales_agents หรือ metadata)

  ตัวอย่าง:
    .\scripts\send-message.ps1 `
      -BaseUrl "http://localhost:3000" `
      -AccessToken "eyJhbG..." `
      -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
      -LeadId "..." `
      -ConversationId "..." `
      -Channel "LINE" `
      -ChannelThreadId "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" `
      -Content "สวัสดีครับ"
#>
param(
  [string] $BaseUrl = $(if ($env:HUB_CHAT_BASE_URL) { $env:HUB_CHAT_BASE_URL } else { "http://localhost:3000" }),
  [Parameter(Mandatory = $true)]
  [string] $AccessToken,
  [Parameter(Mandatory = $true)]
  [string] $TenantId,
  [Parameter(Mandatory = $true)]
  [string] $LeadId,
  [Parameter(Mandatory = $true)]
  [string] $ConversationId,
  [ValidateSet("LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA")]
  [string] $Channel = "LINE",
  [Parameter(Mandatory = $true)]
  [string] $ChannelThreadId,
  [Parameter(Mandatory = $true)]
  [string] $Content
)

$t = $AccessToken.Trim()
if ($t -like "sb_publishable_*" -or $t -like "sb_secret_*") {
  Write-Error 'AccessToken: use Supabase user JWT (starts with eyJ), not API key. Or use scripts/send-line-push.ps1 with LINE_CHANNEL_ACCESS_TOKEN.'
  exit 1
}
if (-not $t.StartsWith("eyJ")) {
  Write-Error 'AccessToken: expected Supabase JWT (eyJ...). Your value looks like LINE Channel Access Token. For direct LINE send: scripts/send-line-push.ps1 -To <userId> -Text "..."'
  exit 1
}

$uri = "$($BaseUrl.TrimEnd('/'))/api/messages/send"
$body = @{
  tenantId        = $TenantId
  leadId          = $LeadId
  conversationId  = $ConversationId
  channel         = $Channel
  channelThreadId = $ChannelThreadId
  content         = $Content
} | ConvertTo-Json

$headers = @{
  "Authorization" = "Bearer $AccessToken"
  "x-tenant-id"   = $TenantId
  "Content-Type"  = "application/json; charset=utf-8"
}

try {
  $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
  $response | ConvertTo-Json -Depth 10
} catch {
  if ($_.Exception.Response) {
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    Write-Error $reader.ReadToEnd()
  } else {
    Write-Error $_
  }
  exit 1
}
