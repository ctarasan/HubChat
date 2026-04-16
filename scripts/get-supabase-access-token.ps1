<#
.SYNOPSIS
  ขอ Supabase access_token (JWT) ด้วย email/password — ใช้กับ send-outbound-message.ps1 -AccessToken

  ต้องมี user ใน Supabase Auth แล้ว และเปิด Email provider
  ห้าม commit รหัสผ่าน — ใช้ env หรือพิมพ์เมื่อถูกถาม

  ตัวอย่าง:
    $env:SUPABASE_URL = "https://xxxxx.supabase.co"
    $env:SUPABASE_ANON_KEY = "eyJhbG..."   # anon / publishable client key
    $env:SUPABASE_AUTH_EMAIL = "sales@yourcompany.com"
    $env:SUPABASE_AUTH_PASSWORD = "your-password"
    .\scripts\get-supabase-access-token.ps1

  หรือ:
    .\scripts\get-supabase-access-token.ps1 -Email "sales@..." -Password (Read-Host -AsSecureString)
#>
param(
  [string] $SupabaseUrl = $env:SUPABASE_URL,
  [string] $AnonKey = $env:SUPABASE_ANON_KEY,
  [string] $Email = $env:SUPABASE_AUTH_EMAIL,
  [SecureString] $PasswordSecure = $null,
  [string] $PasswordPlain = $env:SUPABASE_AUTH_PASSWORD,
  [switch] $Clip
)

if (-not $SupabaseUrl -or -not $AnonKey) {
  Write-Error "Set SUPABASE_URL and SUPABASE_ANON_KEY (Dashboard → Project Settings → API)."
  exit 1
}
if (-not $Email) {
  $Email = Read-Host "Email (Supabase Auth user)"
}
if (-not $PasswordPlain -and -not $PasswordSecure) {
  $sec = Read-Host "Password" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try {
    $PasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
} elseif ($PasswordSecure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PasswordSecure)
  try {
    $PasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

$base = $SupabaseUrl.TrimEnd('/')
$uri = "$base/auth/v1/token?grant_type=password"
$bodyObj = @{ email = $Email; password = $PasswordPlain }
$body = $bodyObj | ConvertTo-Json -Compress
$headers = @{
  "apikey"        = $AnonKey
  "Content-Type"  = "application/json"
}

try {
  $resp = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body
  $token = $resp.access_token
  if (-not $token) {
    Write-Error "No access_token in response: $($resp | ConvertTo-Json -Compress)"
    exit 1
  }
  Write-Host "access_token (JWT):"
  Write-Host $token
  if ($Clip) {
    $token | Set-Clipboard
    Write-Host "(Copied to clipboard)"
  }
} catch {
  $err = $_.ErrorDetails.Message
  if (-not $err -and $_.Exception.Response) {
    $r = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $err = $r.ReadToEnd()
  }
  Write-Error "Auth failed: $err"
  exit 1
} finally {
  $PasswordPlain = $null
}
