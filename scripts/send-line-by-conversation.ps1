<#
.SYNOPSIS
  Find conversation by id, resolve lead/thread, then send outbound LINE message.

.DESCRIPTION
  This script:
  1) Calls GET /api/conversations with cursor pagination until it finds the target conversation id
  2) Extracts leadId + channelThreadId (supports both snake_case and camelCase response fields)
  3) Calls POST /api/messages/send to queue outbound LINE message

  Required:
  - BaseUrl
  - AccessToken (Supabase user JWT)
  - TenantId
  - ConversationId
  - Content

.EXAMPLE
  .\scripts\send-line-by-conversation.ps1 `
    -BaseUrl "https://smartkorp-hub-chat.vercel.app" `
    -AccessToken "eyJ..." `
    -TenantId "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f" `
    -ConversationId "f5c29c9b-53ce-4174-acc4-f7289b70cf29" `
    -Content "ทดสอบส่ง outbound LINE"
#>

param(
  [Parameter(Mandatory = $true)]
  [string] $BaseUrl,

  [Parameter(Mandatory = $true)]
  [string] $AccessToken,

  [Parameter(Mandatory = $true)]
  [string] $TenantId,

  [Parameter(Mandatory = $true)]
  [string] $ConversationId,

  [Parameter(Mandatory = $true)]
  [string] $Content,

  [int] $PageLimit = 100,
  [int] $MaxPages = 100
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Field {
  param(
    [Parameter(Mandatory = $true)] $Obj,
    [Parameter(Mandatory = $true)] [string[]] $Names
  )
  foreach ($n in $Names) {
    if ($null -ne $Obj.PSObject.Properties[$n]) {
      $v = $Obj.$n
      if ($null -ne $v -and "$v".Trim()) { return "$v" }
    }
  }
  return $null
}

function Has-Prop {
  param(
    [Parameter(Mandatory = $true)] $Obj,
    [Parameter(Mandatory = $true)] [string] $Name
  )
  if ($null -eq $Obj) { return $false }
  return $null -ne $Obj.PSObject.Properties[$Name]
}

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)] [string] $Method,
    [Parameter(Mandatory = $true)] [string] $Uri,
    [object] $Body
  )

  $headers = @{
    Authorization = "Bearer $AccessToken"
    "x-tenant-id" = $TenantId
    "Content-Type" = "application/json; charset=utf-8"
  }

  try {
    if ($null -eq $Body) {
      return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
    }

    $json = $Body | ConvertTo-Json -Depth 10
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
  } catch {
    $detail = ""
    if ($_.Exception.Response) {
      $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
      $detail = $reader.ReadToEnd()
    }
    if (-not $detail) { $detail = "$_" }
    throw "API call failed: $Method $Uri`n$detail"
  }
}

$base = $BaseUrl.TrimEnd("/")

# 1) Find conversation with cursor pagination
$cursor = $null
$page = 0
$target = $null

while ($page -lt $MaxPages -and -not $target) {
  $page += 1
  $url = "$base/api/conversations?channel=LINE&limit=$PageLimit"
  if ($cursor) {
    $url += "&cursor=$([uri]::EscapeDataString($cursor))"
  }

  $resp = Invoke-Api -Method "GET" -Uri $url
  $rows = @($resp.data)
  if ($rows.Count -gt 0) {
    $target = $rows | Where-Object { "$($_.id)" -eq $ConversationId } | Select-Object -First 1
  }

  $cursor = $null
  if ((Has-Prop -Obj $resp -Name "pageInfo") -and $resp.pageInfo -and (Has-Prop -Obj $resp.pageInfo -Name "nextCursor")) {
    if ($resp.pageInfo.nextCursor) {
      $cursor = "$($resp.pageInfo.nextCursor)"
    }
  }

  if (-not $cursor) { break }
}

if (-not $target) {
  throw "Conversation not found in LINE channel for tenant. conversationId=$ConversationId"
}

# 2) Resolve leadId + threadId
$leadId = Get-Field -Obj $target -Names @("leadId", "lead_id")
$threadId = Get-Field -Obj $target -Names @("channelThreadId", "channel_thread_id")
$channel = Get-Field -Obj $target -Names @("channelType", "channel_type")

if (-not $leadId) { throw "Conversation found but leadId is missing." }
if (-not $threadId) { throw "Conversation found but channelThreadId is missing." }
if ($channel -and $channel -ne "LINE") {
  throw "Conversation channel is '$channel', expected LINE."
}

# 3) Send outbound LINE message
$sendUri = "$base/api/messages/send"
$payload = @{
  tenantId = $TenantId
  leadId = $leadId
  conversationId = $ConversationId
  channel = "LINE"
  channelThreadId = $threadId
  content = $Content
}

$sendResp = Invoke-Api -Method "POST" -Uri $sendUri -Body $payload

Write-Host "Outbound request submitted."
Write-Host "conversationId: $ConversationId"
Write-Host "leadId: $leadId"
Write-Host "channelThreadId: $threadId"
Write-Host "response:"
$sendResp | ConvertTo-Json -Depth 10
