<#
.SYNOPSIS
  ส่งข้อความ DM ไป Facebook Messenger ผ่าน Hub API (POST /api/messages/send)

.DESCRIPTION
  เรียก API เหมือน reply comment แต่ใช้:
  - channel = FACEBOOK
  - facebookTargetType = MESSENGER
  - facebookTargetId = <PSID> (Page-Scoped User ID ของผู้รับ)

  ต้องใช้ JWT ของผู้ใช้ที่มีสิทธิ์ SALES/MANAGER/ADMIN ใน tenant
  Worker ต้องมี FACEBOOK_PAGE_ACCESS_TOKEN ใน environment ถึงจะส่งถึง Graph API ได้

.EXAMPLE
  .\scripts\send-facebook-messenger-dm.ps1 `
    -BaseUrl "https://your-app.vercel.app" `
    -AccessToken "eyJhbGciOi..." `
    -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -LeadId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -ConversationId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -RecipientPsid "1234567890123456" `
    -Content "สวัสดีครับ ทดสอบ Messenger"
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

function Normalize-BaseUrl {
  param([string] $Value)
  if (-not $Value) { return "" }
  $v = $Value.Trim()
  if (-not $v) { return "" }
  if ($v -notmatch "^https?://") {
    $v = "https://$v"
  }
  return $v.TrimEnd("/")
}

if (-not $BaseUrl) {
  $BaseUrl = Get-FirstNonEmpty @(
    $env:BASE_URL,
    $env:APP_BASE_URL,
    $env:NEXT_PUBLIC_APP_URL,
    $env:NEXT_PUBLIC_BASE_URL,
    $env:NEXTAUTH_URL,
    $env:SITE_URL,
    $env:NEXT_PUBLIC_SITE_URL,
    $env:VERCEL_PROJECT_PRODUCTION_URL,
    $env:VERCEL_PROJECT_PREVIEW_URL,
    $(if ($env:VERCEL_URL) { "https://$($env:VERCEL_URL)" } else { "" }),
    $env:HUB_CHAT_BASE_URL
  )
  $BaseUrl = Normalize-BaseUrl $BaseUrl
} else {
  $BaseUrl = Normalize-BaseUrl $BaseUrl
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
if (-not $RecipientPsid) {
  $RecipientPsid = Get-FirstNonEmpty @(
    $env:FACEBOOK_MESSENGER_PSID,
    $env:MESSENGER_PSID,
    $env:HUB_CHAT_MESSENGER_PSID
  )
}

$missing = @()
if (-not $BaseUrl) { $missing += "BASE_URL / APP_BASE_URL / NEXT_PUBLIC_APP_URL / SITE_URL / -BaseUrl" }
if (-not $AccessToken) { $missing += "ACCESS_TOKEN or SUPABASE_ACCESS_TOKEN / -AccessToken" }
if (-not $TenantId) { $missing += "DEFAULT_TENANT_ID or TENANT_ID / -TenantId" }
if (-not $LeadId) { $missing += "LEAD_ID / -LeadId" }
if (-not $ConversationId) { $missing += "CONVERSATION_ID / -ConversationId" }
if (-not $RecipientPsid) { $missing += "RecipientPsid / FACEBOOK_MESSENGER_PSID / MESSENGER_PSID" }
if ($missing.Count -gt 0) {
  throw ("Missing required values: " + ($missing -join ", "))
}

$token = $AccessToken.Trim()
if (-not $token.StartsWith("eyJ")) {
  Write-Error "AccessToken must be a Supabase user JWT (starts with eyJ...)"
  exit 1
}

$psid = $RecipientPsid.Trim()
# สอดคล้องกับ reply-facebook-comment.ps1: ส่ง channelThreadId คู่กับ facebookTarget* เพื่อให้ API เก่า/ใหม่ resolve ได้
$messengerThreadId = "user:$psid"

$uri = "$($BaseUrl.TrimEnd('/'))/api/messages/send"
$body = @{
  tenantId           = $TenantId
  leadId             = $LeadId
  conversationId     = $ConversationId
  channel            = "FACEBOOK"
  channelThreadId    = $messengerThreadId
  facebookTargetType = "MESSENGER"
  facebookTargetId   = $psid
  content            = $Content
} | ConvertTo-Json

$headers = @{
  "Authorization" = "Bearer $token"
  "x-tenant-id"   = $TenantId
  "Content-Type"  = "application/json; charset=utf-8"
}

try { chcp 65001 > $null } catch {}
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

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
