<#
.SYNOPSIS
  ตอบกลับข้อความที่เพิ่งได้รับจาก LINE ผ่าน Reply Message API

  ต้องใช้ replyToken จาก webhook body ของ event นั้น (events[].replyToken)
  Token ใช้ได้ครั้งเดียว และหมดอายุเร็ว — ควรเรียก API ทันทีหลังรับ webhook

  ถ้าไม่มี replyToken แล้ว (ประมวลผลช้า / worker ทีหลัง) ให้ใช้ send-line-push.ps1
  ส่งไปที่ LINE User ID แทน

  ตัวอย่าง (token จาก JSON ที่ LINE ส่งมา):
    $env:LINE_CHANNEL_ACCESS_TOKEN = "..."
    .\scripts\reply-line-message.ps1 `
      -ReplyToken "nHuyWiB7yP5Zw52FIkcQobQuG8CTZUv..." `
      -Text "รับทราบครับ ขอบคุณที่ติดต่อ"

  หรือดึง replyToken จากไฟล์ webhook ที่บันทึกไว้ (event แรกที่มี replyToken):
    .\scripts\reply-line-message.ps1 -WebhookPayloadPath ".\last-webhook.json" -Text "รับทราบครับ"
#>
param(
  [string] $ChannelAccessToken = $env:LINE_CHANNEL_ACCESS_TOKEN,
  [string] $ReplyToken = "",
  [string] $WebhookPayloadPath = "",
  [Parameter(Mandatory = $true)]
  [string] $Text
)

if (-not $ChannelAccessToken) {
  Write-Error "Set LINE_CHANNEL_ACCESS_TOKEN (env) or pass -ChannelAccessToken."
  exit 1
}

if ($WebhookPayloadPath) {
  if (-not (Test-Path -LiteralPath $WebhookPayloadPath)) {
    Write-Error "File not found: $WebhookPayloadPath"
    exit 1
  }
  $raw = Get-Content -LiteralPath $WebhookPayloadPath -Raw -Encoding UTF8
  $payload = $raw | ConvertFrom-Json
  foreach ($ev in @($payload.events)) {
    if ($ev.replyToken) {
      $ReplyToken = [string]$ev.replyToken
      break
    }
  }
}

if (-not $ReplyToken) {
  Write-Error "Provide -ReplyToken or -WebhookPayloadPath with an event that contains replyToken."
  exit 1
}

$uri = "https://api.line.me/v2/bot/message/reply"
$bodyObj = @{
  replyToken = $ReplyToken
  messages   = @(
    @{
      type = "text"
      text = $Text
    }
  )
}
$body = $bodyObj | ConvertTo-Json -Depth 5 -Compress

$headers = @{
  "Content-Type"  = "application/json"
  "Authorization" = "Bearer $ChannelAccessToken"
}

try {
  $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -UseBasicParsing
  Write-Host "OK ($($response.StatusCode))"
} catch {
  $err = $_.Exception
  if ($err.Response) {
    $stream = $err.Response.GetResponseStream()
    $reader = [System.IO.StreamReader]::new($stream)
    $detail = $reader.ReadToEnd()
    Write-Error "LINE reply API failed: $detail"
  } else {
    Write-Error $_
  }
  exit 1
}
