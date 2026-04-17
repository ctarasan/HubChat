<#
.SYNOPSIS
  ดึง LeadId และ ConversationId ล่าสุดจาก Facebook Comment ID

.DESCRIPTION
  ใช้ Supabase REST API โดยค้นจากตาราง messages (channel_type=FACEBOOK, external_message_id=CommentId)
  แล้วตาม conversation_id ไปดึง lead_id จากตาราง conversations

  รองรับการดึง env จาก Vercel ด้วย -PullFromVercel

.EXAMPLE
  .\scripts\get-facebook-comment-context.ps1 `
    -PullFromVercel `
    -VercelEnvironment production `
    -CommentId "122098025780693891_1602995387449256"
#>
param(
  [string] $EnvFile = ".env.vercel.local",
  [ValidateSet("development", "preview", "production")]
  [string] $VercelEnvironment = "production",
  [switch] $PullFromVercel,
  [switch] $SkipLocalEnvFile,
  [string] $SupabaseUrl = "",
  [string] $SupabaseServiceRoleKey = "",
  [Parameter(Mandatory = $true)]
  [string] $CommentId
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

if (-not $SupabaseUrl) {
  $SupabaseUrl = Get-FirstNonEmpty @(
    $env:SUPABASE_URL,
    $env:NEXT_PUBLIC_SUPABASE_URL
  )
}
if (-not $SupabaseServiceRoleKey) {
  $SupabaseServiceRoleKey = Get-FirstNonEmpty @(
    $env:SUPABASE_SERVICE_ROLE_KEY,
    $env:SUPABASE_SERVICE_KEY
  )
}
$missing = @()
if (-not $SupabaseUrl) { $missing += "SUPABASE_URL / -SupabaseUrl" }
if (-not $SupabaseServiceRoleKey) { $missing += "SUPABASE_SERVICE_ROLE_KEY / -SupabaseServiceRoleKey" }
if ($missing.Count -gt 0) {
  throw ("Missing required values: " + ($missing -join ", "))
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  throw "node not found. Please install Node.js or run this in project environment with Node."
}

$helperScript = Join-Path $PSScriptRoot "get-facebook-comment-context.cjs"
if (-not (Test-Path -LiteralPath $helperScript)) {
  throw "Helper script not found: $helperScript"
}

& node $helperScript `
  --supabase-url $SupabaseUrl `
  --service-role-key $SupabaseServiceRoleKey `
  --comment-id $CommentId
