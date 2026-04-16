<#
.SYNOPSIS
  ส่งข้อความข้อความธรรมดาออกทาง LINE โดยตรง (Messaging API push)

  ใช้ Channel Access Token เดียวกับในโปรเจกต์ (LINE_CHANNEL_ACCESS_TOKEN)
  ผู้รับต้องเคยทักบอท / ยอมรับเพื่อน แล้ว (ไม่เช่นนั้น push จะล้ม)

  X-Line-Retry-Key ต้องเป็นรูปแบบ UUID (ตามข้อกำหนด LINE)

  ตัวอย่าง:
    $env:LINE_CHANNEL_ACCESS_TOKEN = "xxxxxxxx..."
    .\scripts\send-line-push.ps1 -To "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" -Text "สวัสดีครับ"
#>
param(
  [string] $ChannelAccessToken = $env:LINE_CHANNEL_ACCESS_TOKEN,
  [Parameter(Mandatory = $true)]
  [string] $To,
  [Parameter(Mandatory = $true)]
  [string] $Text,
  [string] $RetryKey = ""
)

if (-not $ChannelAccessToken) {
  Write-Error "Set LINE_CHANNEL_ACCESS_TOKEN (env) or pass -ChannelAccessToken."
  exit 1
}

if (-not $RetryKey) {
  $RetryKey = [guid]::NewGuid().ToString()
}

$uri = "https://api.line.me/v2/bot/message/push"
$bodyObj = @{
  to       = $To
  messages = @(
    @{
      type = "text"
      text = $Text
    }
  )
}
$body = $bodyObj | ConvertTo-Json -Depth 5 -Compress

$headers = @{
  "Content-Type"      = "application/json"
  "Authorization"     = "Bearer $ChannelAccessToken"
  "X-Line-Retry-Key"  = $RetryKey
}

try {
  $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -UseBasicParsing
  Write-Host "OK ($($response.StatusCode)) X-Line-Retry-Key: $RetryKey"
} catch {
  $err = $_.Exception
  if ($err.Response) {
    $stream = $err.Response.GetResponseStream()
    $reader = [System.IO.StreamReader]::new($stream)
    $detail = $reader.ReadToEnd()
    Write-Error "LINE API failed: $detail"
  } else {
    Write-Error $_
  }
  exit 1
}
