<#
.SYNOPSIS
  ส่ง outbound message ผ่าน Hub API — POST /api/messages/send

  ข้อความจะถูกบันทึกและ enqueue ให้ worker ส่งไปช่องทาง (เช่น LINE) ตาม flow ในระบบ

  ทางเลือกอื่น:
  - ส่ง LINE ตรง (ไม่ผ่าน Hub): scripts/send-line-push.ps1

  ขอ JWT จาก email/password (โปรเจกต์นี้ยังไม่มีหน้า login): scripts/get-supabase-access-token.ps1

  ตัวอย่าง:
    $env:HUB_CHAT_BASE_URL = "https://your-app.vercel.app"
    .\scripts\send-outbound-message.ps1 `
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

$target = Join-Path $PSScriptRoot "send-message.ps1"
& $target `
  -BaseUrl $BaseUrl `
  -AccessToken $AccessToken `
  -TenantId $TenantId `
  -LeadId $LeadId `
  -ConversationId $ConversationId `
  -Channel $Channel `
  -ChannelThreadId $ChannelThreadId `
  -Content $Content
