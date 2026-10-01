<#
.SYNOPSIS
  End-to-end smoke test of the viewer flow against a RUNNING Our Story backend.

.DESCRIPTION
  question -> unlock without CSRF (403) -> unlock with CSRF (204 + cookie) -> status -> experience (6 worlds,
  Our Forever locked and teaser only) -> world detail (open, locked teaser, unknown 404) -> lock -> experience (401).
  Exits non-zero on the first mismatch. Never prints the answer or any cookie value.

  The backend must run with the 'dev' profile (plain http needs a non-Secure cookie) and with the default seeded
  worlds, an unlock question and the given answer configured (OURSTORY_UNLOCK_QUESTION / OURSTORY_UNLOCK_ANSWERS).
  Assumes "now" is before 2027-02-14T00:00:00+05:30, when Our Forever is still locked.

.EXAMPLE
  ./smoke.ps1 -Answer 'the-answer' -BaseUrl http://localhost:8080
#>
param(
    [Parameter(Mandatory = $true)][string]$Answer,
    [string]$BaseUrl = 'http://localhost:8080'
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$failures = 0

function Send-Request {
    param([string]$Method, [string]$Path, [hashtable]$Headers = @{}, [string]$Body = $null)
    $req = @{
        Uri = "$BaseUrl$Path"; Method = $Method; WebSession = $session; Headers = $Headers
        UseBasicParsing = $true; MaximumRedirection = 0
    }
    if (-not [string]::IsNullOrEmpty($Body)) { $req.Body = $Body; $req.ContentType = 'application/json' }
    try {
        $r = Invoke-WebRequest @req
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Content = [string]$r.Content; Headers = $r.Headers }
    } catch {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { throw }
        return [pscustomobject]@{ Status = [int]$resp.StatusCode; Content = ''; Headers = @{} }
    }
}

function Get-XsrfToken {
    $cookie = $session.Cookies.GetCookies([uri]$BaseUrl) | Where-Object { $_.Name -eq 'XSRF-TOKEN' } | Select-Object -First 1
    if ($null -eq $cookie) { return $null }
    return $cookie.Value
}

function Test-Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = '')
    if ($Ok) {
        Write-Host ("PASS  {0}" -f $Name)
    } else {
        Write-Host ("FAIL  {0} {1}" -f $Name, $Detail)
        $script:failures++
        exit 1
    }
}

function Test-Fields {
    param($Object, [string[]]$Expected)
    $actual = @($Object.PSObject.Properties.Name | Sort-Object)
    return (($actual -join ',') -eq ((@($Expected) | Sort-Object) -join ','))
}

# 1. question (also issues the XSRF cookie)
$q = Send-Request GET '/api/auth/question'
Test-Check 'GET /api/auth/question -> 200' ($q.Status -eq 200) "(got $($q.Status))"
$token = Get-XsrfToken
Test-Check 'XSRF-TOKEN cookie issued' (-not [string]::IsNullOrEmpty($token))

$answerBody = (@{ answer = $Answer } | ConvertTo-Json -Compress)

# 2. unlock without the CSRF header must be refused
$noCsrf = Send-Request POST '/api/auth/unlock' @{} $answerBody
Test-Check 'POST /api/auth/unlock without CSRF -> 403' ($noCsrf.Status -eq 403) "(got $($noCsrf.Status))"

# 3. unlock with CSRF
$unlock = Send-Request POST '/api/auth/unlock' @{ 'X-XSRF-TOKEN' = (Get-XsrfToken) } $answerBody
Test-Check 'POST /api/auth/unlock with CSRF -> 204' ($unlock.Status -eq 204) "(got $($unlock.Status); wrong answer or not the dev profile?)"
$viewerCookie = $session.Cookies.GetCookies([uri]$BaseUrl) | Where-Object { $_.Name -eq 'os_viewer' } | Select-Object -First 1
Test-Check 'os_viewer cookie set' ($null -ne $viewerCookie)

# 4. status
$status = Send-Request GET '/api/auth/status'
Test-Check 'GET /api/auth/status -> unlocked' ($status.Status -eq 200 -and ($status.Content | ConvertFrom-Json).unlocked -eq $true)

# 5. experience
$exp = Send-Request GET '/api/experience'
Test-Check 'GET /api/experience -> 200' ($exp.Status -eq 200) "(got $($exp.Status))"
$cacheControl = [string]$exp.Headers['Cache-Control']
Test-Check 'experience is private, no-store' ($cacheControl -match 'no-store' -and $cacheControl -match 'private') "($cacheControl)"
$e = $exp.Content | ConvertFrom-Json
Test-Check 'experience has 6 worlds' (@($e.worlds).Count -eq 6) "(got $(@($e.worlds).Count))"
$forever = $e.worlds | Where-Object { $_.slug -eq 'our-forever' }
Test-Check 'Our Forever is locked' ($null -ne $forever -and $forever.locked -eq $true)
Test-Check 'locked world is teaser only' (Test-Fields $forever @('slug', 'title', 'subtitle', 'layout', 'themeAccent', 'sortOrder', 'locked', 'unlockAt'))
$first = $e.worlds | Where-Object { $_.slug -eq 'where-it-all-began' }
Test-Check 'open world has count and previews' ($null -ne $first -and $first.locked -eq $false -and $null -ne $first.PSObject.Properties['momentCount'] -and $null -ne $first.PSObject.Properties['previewMediaIds'])
Test-Check 'no adminPreview for a viewer' ($null -eq $e.PSObject.Properties['adminPreview'])

# 6. worlds
$open = Send-Request GET '/api/worlds/where-it-all-began'
Test-Check 'GET /api/worlds/where-it-all-began -> 200' ($open.Status -eq 200) "(got $($open.Status))"
$o = $open.Content | ConvertFrom-Json
Test-Check 'open world carries moments and letters' ($o.locked -eq $false -and $null -ne $o.PSObject.Properties['moments'] -and $null -ne $o.PSObject.Properties['letters'])

$lockedWorld = Send-Request GET '/api/worlds/our-forever'
Test-Check 'GET /api/worlds/our-forever -> 200' ($lockedWorld.Status -eq 200) "(got $($lockedWorld.Status))"
$l = $lockedWorld.Content | ConvertFrom-Json
Test-Check 'locked world is teaser only' ($l.locked -eq $true -and (Test-Fields $l @('slug', 'title', 'subtitle', 'layout', 'themeAccent', 'locked', 'unlockAt', 'serverTime')))

$nope = Send-Request GET '/api/worlds/nope'
Test-Check 'GET /api/worlds/nope -> 404' ($nope.Status -eq 404) "(got $($nope.Status))"
$bad = Send-Request GET '/api/worlds/Not_A_Slug'
Test-Check 'GET /api/worlds/Not_A_Slug -> 400' ($bad.Status -eq 400) "(got $($bad.Status))"

# 7. lock, then the viewer API must be closed again
$lock = Send-Request POST '/api/auth/lock' @{ 'X-XSRF-TOKEN' = (Get-XsrfToken) }
Test-Check 'POST /api/auth/lock -> 204' ($lock.Status -eq 204) "(got $($lock.Status))"
$after = Send-Request GET '/api/experience'
Test-Check 'GET /api/experience after lock -> 401' ($after.Status -eq 401) "(got $($after.Status))"

Write-Host 'Smoke test passed.'
exit 0
