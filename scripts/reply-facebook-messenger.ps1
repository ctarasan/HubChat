<#
.SYNOPSIS
  ตอบกลับผู้ใช้ Facebook Messenger ผ่าน Hub API (เรียก send-facebook-messenger-dm.ps1)

.DESCRIPTION
  ใช้เมื่อมีข้อความเข้าแล้วต้องการส่งข้อความตอบกลับไปที่ PSID เดิม

  ค่าเริ่มต้นของ -Content ออกแบบให้ตอบรับข้อความทดสอบเช้านี้ — ส่ง -Content ใหม่ได้ทุกเมื่อ

  รันจากไฟล์เท่านั้น: .\scripts\reply-facebook-messenger.ps1 (อย่าวางเนื้อสคริปต์ลงใน console โดยตรง เพราะ $PSScriptRoot จะว่าง)

.EXAMPLE
  .\scripts\reply-facebook-messenger.ps1 `
    -BaseUrl "https://your-app.vercel.app" `
    -AccessToken "eyJhbG..." `
    -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -LeadId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -ConversationId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -RecipientPsid "1234567890123456"
#>
param(
  [string] $EnvFile = ".env.vercel.local",
  [ValidateSet("development", "preview", "production")]
  [string] $VercelEnvironment = "production",
  [switch] $PullFromVercel,
  [switch] $SkipLocalEnvFile,
  [string] $BaseUrl = "",
  [string] $AccessToken = "",
  [string] $TenantId = "",
  [string] $LeadId = "",
  [string] $ConversationId = "",
  [string] $RecipientPsid = "",
  [string] $Content = 'รับทราบครับ ขอบคุณสำหรับข้อความทดสอบ «ทดสอบ dm เช้านี้ 20/4/69 @ 10:53» ครับ'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# $PSScriptRoot มีค่าเมื่อรันจากไฟล์ .ps1 เท่านั้น; ถ้าวางโค้ดใน console จะว่าง — จึงมี fallback
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptDir)) {
  $invPath = $MyInvocation.MyCommand.Path
  if ($invPath) {
    $scriptDir = Split-Path -LiteralPath $invPath -Parent
  }
}
if ([string]::IsNullOrWhiteSpace($scriptDir)) {
  $cand = Join-Path (Get-Location).Path "scripts"
  if (Test-Path -LiteralPath (Join-Path $cand "send-facebook-messenger-dm.ps1")) {
    $scriptDir = $cand
  }
}
if ([string]::IsNullOrWhiteSpace($scriptDir)) {
  throw "Cannot resolve scripts folder. Run: .\scripts\reply-facebook-messenger.ps1 from the repo root (do not paste the script body into the console)."
}

$target = Join-Path $scriptDir "send-facebook-messenger-dm.ps1"
if (-not (Test-Path -LiteralPath $target)) {
  throw "Expected helper script not found: $target"
}
$params = @{
  EnvFile           = $EnvFile
  VercelEnvironment = $VercelEnvironment
  Content           = $Content
}
if ($PullFromVercel) { $params.PullFromVercel = $true }
if ($SkipLocalEnvFile) { $params.SkipLocalEnvFile = $true }
if ($BaseUrl) { $params.BaseUrl = $BaseUrl }
if ($AccessToken) { $params.AccessToken = $AccessToken }
if ($TenantId) { $params.TenantId = $TenantId }
if ($LeadId) { $params.LeadId = $LeadId }
if ($ConversationId) { $params.ConversationId = $ConversationId }
if ($RecipientPsid) { $params.RecipientPsid = $RecipientPsid }

& $target @params
