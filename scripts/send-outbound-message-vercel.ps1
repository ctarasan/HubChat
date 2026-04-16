<#
.SYNOPSIS
  ส่ง outbound message ภาษาไทยผ่าน Hub API โดยใช้ค่าจาก Vercel environment เป็นหลัก

.DESCRIPTION
  สคริปต์นี้อ่านค่าจากไฟล์ env ที่ pull มาจาก Vercel (เช่น .env.vercel.local)
  แล้วเรียก scripts/send-outbound-message.ps1 ให้อัตโนมัติ

  รองรับค่า env:
    HUB_CHAT_BASE_URL
    HUB_CHAT_ACCESS_TOKEN
    HUB_CHAT_TENANT_ID
    HUB_CHAT_LEAD_ID
    HUB_CHAT_CONVERSATION_ID
    HUB_CHAT_CHANNEL
    HUB_CHAT_CHANNEL_THREAD_ID

  ถ้าอยากดึง env จาก Vercel อัตโนมัติ ให้ใช้ -PullFromVercel
  (ต้องติดตั้งและ login Vercel CLI ก่อน)

.EXAMPLE
  .\scripts\send-outbound-message-vercel.ps1 -PullFromVercel -Content "สวัสดีครับ ทดสอบส่งภาษาไทย"

.EXAMPLE
  .\scripts\send-outbound-message-vercel.ps1 `
    -EnvFile ".env.vercel.local" `
    -Content "ทดสอบ outbound ภาษาไทย"
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
  [ValidateSet("LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA")]
  [string] $Channel = "",
  [string] $ChannelThreadId = "",
  [Parameter(Mandatory = $true)]
  [string] $Content
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Env file not found: $Path"
  }

  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($k, $v, "Process")
  }
}

if ($PullFromVercel) {
  $vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
  if (-not $vercelCmd) {
    throw "vercel CLI not found. Install with: npm i -g vercel"
  }
  $tempEnvFile = Join-Path $env:TEMP ("hub-chat-vercel-env-{0}.tmp" -f ([guid]::NewGuid().ToString("N")))
  Write-Host "Pulling env from Vercel ($VercelEnvironment) ..."
  try {
    & vercel env pull $tempEnvFile --environment $VercelEnvironment > $null
    Import-DotEnv -Path $tempEnvFile
  } finally {
    if (Test-Path -LiteralPath $tempEnvFile) {
      Remove-Item -LiteralPath $tempEnvFile -Force -ErrorAction SilentlyContinue
    }
  }
} elseif (-not $SkipLocalEnvFile -and (Test-Path -LiteralPath $EnvFile)) {
  Import-DotEnv -Path $EnvFile
}

function Get-FirstNonEmpty {
  param([string[]] $Values)
  foreach ($v in $Values) {
    if ($v -and $v.Trim()) { return $v.Trim() }
  }
  return ""
}

# Prefer existing/common env names first, then HUB_CHAT_* fallback.
if (-not $BaseUrl) {
  $BaseUrl = Get-FirstNonEmpty @(
    $env:BASE_URL,
    $env:APP_BASE_URL,
    $env:NEXT_PUBLIC_APP_URL,
    $env:NEXT_PUBLIC_BASE_URL,
    $env:VERCEL_PROJECT_PRODUCTION_URL,
    $(if ($env:VERCEL_URL) { "https://$($env:VERCEL_URL)" } else { "" }),
    $env:HUB_CHAT_BASE_URL
  )
}
if (-not $AccessToken) {
  $AccessToken = Get-FirstNonEmpty @(
    $env:ACCESS_TOKEN,
    $env:SUPABASE_ACCESS_TOKEN,
    $env:HUB_CHAT_ACCESS_TOKEN
  )
}
if (-not $TenantId) {
  $TenantId = Get-FirstNonEmpty @(
    $env:DEFAULT_TENANT_ID,
    $env:TENANT_ID,
    $env:HUB_CHAT_TENANT_ID
  )
}
if (-not $LeadId) {
  $LeadId = Get-FirstNonEmpty @(
    $env:LEAD_ID,
    $env:HUB_CHAT_LEAD_ID
  )
}
if (-not $ConversationId) {
  $ConversationId = Get-FirstNonEmpty @(
    $env:CONVERSATION_ID,
    $env:HUB_CHAT_CONVERSATION_ID
  )
}
if (-not $Channel) {
  $Channel = Get-FirstNonEmpty @(
    $env:CHANNEL,
    $env:HUB_CHAT_CHANNEL,
    "LINE"
  )
}
if (-not $ChannelThreadId) {
  $ChannelThreadId = Get-FirstNonEmpty @(
    $env:CHANNEL_THREAD_ID,
    $env:LINE_USER_ID,
    $env:HUB_CHAT_CHANNEL_THREAD_ID
  )
}

$missing = @()
if (-not $BaseUrl) {
  $missing += "BASE_URL or APP_BASE_URL or NEXT_PUBLIC_APP_URL or VERCEL_URL / -BaseUrl"
}
if (-not $AccessToken) {
  $missing += "ACCESS_TOKEN or SUPABASE_ACCESS_TOKEN / -AccessToken"
}
if (-not $TenantId) {
  $missing += "DEFAULT_TENANT_ID or TENANT_ID / -TenantId"
}
if (-not $LeadId) {
  $missing += "LEAD_ID / -LeadId"
}
if (-not $ConversationId) {
  $missing += "CONVERSATION_ID / -ConversationId"
}
if (-not $ChannelThreadId) {
  $missing += "CHANNEL_THREAD_ID or LINE_USER_ID / -ChannelThreadId"
}
if ($missing.Count -gt 0) {
  throw ("Missing required values: " + ($missing -join ", "))
}

# Ensure console + payload use UTF-8 for Thai text
try { chcp 65001 > $null } catch {}
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$target = Join-Path $PSScriptRoot "send-outbound-message.ps1"
& $target `
  -BaseUrl $BaseUrl `
  -AccessToken $AccessToken `
  -TenantId $TenantId `
  -LeadId $LeadId `
  -ConversationId $ConversationId `
  -Channel $Channel `
  -ChannelThreadId $ChannelThreadId `
  -Content $Content
