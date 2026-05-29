param(
    [string]$GatewayBaseUrl = "http://localhost:8000",
    [string]$BackendBaseUrl = "http://localhost:5678",
    [string]$AdminBaseUrl = "http://localhost:8001",
    [string]$Origin = "http://localhost:3000",
    [string]$RateLimitPath = "/api/orders",
    [string]$RateLimitMethod = "POST",
    [int]$MaxRateLimitRequests = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Title)

    Write-Host ""
    Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Get-HttpResult {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )

    $requestParams = @{
        Uri         = $Uri
        Method      = $Method
        Headers     = $Headers
        ErrorAction = "Stop"
    }

    if ($null -ne $Body) {
        $requestParams.Body = $Body
    }

    if ((Get-Command Invoke-WebRequest).Parameters.ContainsKey("UseBasicParsing")) {
        $requestParams.UseBasicParsing = $true
    }

    try {
        $response = Invoke-WebRequest @requestParams
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Content    = [string]$response.Content
            Headers    = $response.Headers
        }
    }
    catch {
        $exception = $_.Exception
        $response = $exception.Response

        if ($null -ne $response) {
            $statusCode = [int]$response.StatusCode
            $responseHeaders = $response.Headers
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            $content = $reader.ReadToEnd()
            $reader.Dispose()

            return [pscustomobject]@{
                StatusCode = $statusCode
                Content    = $content
                Headers    = $responseHeaders
            }
        }

        throw
    }
}

function Get-ComposeServices {
    $jsonOutput = docker compose ps --format json
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose ps --format json failed."
    }

    $services = @($jsonOutput | ConvertFrom-Json)
    if (-not $services -or $services.Count -eq 0) {
        throw "docker compose ps returned no services."
    }

    return $services
}

function Wait-ForServiceReady {
    param(
        [string]$ServiceName,
        [bool]$RequireHealthy = $true,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $matchingService = Get-ComposeServices | Where-Object { $_.Service -eq $ServiceName }
        if ($matchingService -and [string]$matchingService.State -eq "running") {
            if (-not $RequireHealthy) {
                return
            }

            if ([string]$matchingService.Health -eq "healthy") {
                return
            }
        }

        Start-Sleep -Seconds 2
    }

    if ($RequireHealthy) {
        throw "Service '$ServiceName' did not become healthy within $TimeoutSeconds seconds."
    }

    throw "Service '$ServiceName' did not become ready within $TimeoutSeconds seconds."
}

function Invoke-Check {
    param(
        [string]$Name,
        [scriptblock]$Script
    )

    try {
        $details = & $Script
        Write-Host "[PASS] $Name" -ForegroundColor Green
        if ($details) {
            Write-Host "       $details"
        }
        return $true
    }
    catch {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "       $($_.Exception.Message)"
        return $false
    }
}

$results = @()

Write-Section "Docker Compose"
$results += Invoke-Check "Containers are up" {
    Wait-ForServiceReady -ServiceName "backend" -RequireHealthy $true
    Wait-ForServiceReady -ServiceName "mysql_db" -RequireHealthy $true
    Wait-ForServiceReady -ServiceName "redis" -RequireHealthy $true
    Wait-ForServiceReady -ServiceName "kong" -RequireHealthy $false
    $services = Get-ComposeServices
    $requiredServices = @("backend", "kong", "mysql_db", "redis")

    foreach ($service in $requiredServices) {
        $matchingService = $services | Where-Object { $_.Service -eq $service }
        if (-not $matchingService) {
            throw "Service '$service' is missing from docker compose ps output."
        }

        $serviceState = [string]$matchingService.State
        $serviceHealth = [string]$matchingService.Health

        if ($serviceState -ne "running") {
            throw "Service '$service' is in unexpected state '$serviceState'."
        }

        if ($service -ne "kong" -and $serviceHealth -and $serviceHealth -ne "healthy") {
            throw "Service '$service' health is '$serviceHealth', expected 'healthy'."
        }
    }

    ($services | Select-Object Service, State, Health | Format-Table -AutoSize | Out-String).Trim()
}

Write-Section "HTTP Routing"
$results += Invoke-Check "Backend status endpoint responds directly" {
    $response = Get-HttpResult -Uri "$BackendBaseUrl/status"
    if ($response.StatusCode -ne 200) {
        throw "Expected 200 from backend, got $($response.StatusCode)."
    }

    "GET $BackendBaseUrl/status -> 200"
}

$results += Invoke-Check "Kong proxies the status endpoint" {
    $response = Get-HttpResult -Uri "$GatewayBaseUrl/status"
    if ($response.StatusCode -ne 200) {
        throw "Expected 200 via Kong, got $($response.StatusCode)."
    }

    "GET $GatewayBaseUrl/status -> 200"
}

$results += Invoke-Check "Kong exposes Swagger UI" {
    $response = Get-HttpResult -Uri "$GatewayBaseUrl/api-docs"
    if ($response.StatusCode -ne 200) {
        throw "Expected 200 from /api-docs, got $($response.StatusCode)."
    }

    "GET $GatewayBaseUrl/api-docs -> 200"
}

$results += Invoke-Check "Kong Admin API is reachable" {
    $response = Get-HttpResult -Uri "$AdminBaseUrl/services"
    if ($response.StatusCode -ne 200) {
        throw "Expected 200 from admin API, got $($response.StatusCode)."
    }

    $serviceCount = ([regex]::Matches($response.Content, '"name"\s*:')).Count
    if ($serviceCount -lt 4) {
        throw "Expected at least 4 declarative services, found $serviceCount."
    }

    "GET $AdminBaseUrl/services -> 200 ($serviceCount services detected)"
}

Write-Section "CORS"
$results += Invoke-Check "Gateway CORS preflight allows frontend origin" {
    $headers = @{
        Origin                         = $Origin
        "Access-Control-Request-Method"  = "POST"
        "Access-Control-Request-Headers" = "Authorization, Content-Type"
    }
    $response = Get-HttpResult -Uri "$GatewayBaseUrl/api/auth" -Method "OPTIONS" -Headers $headers

    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
        throw "Expected successful preflight, got $($response.StatusCode)."
    }

    $allowOrigin = [string]$response.Headers["Access-Control-Allow-Origin"]
    if ($allowOrigin -ne $Origin) {
        throw "Expected Access-Control-Allow-Origin '$Origin', got '$allowOrigin'."
    }

    "OPTIONS $GatewayBaseUrl/api/auth -> $($response.StatusCode)"
}

Write-Section "WebSocket Handshake"
$results += Invoke-Check "Socket.IO polling handshake works through Kong" {
    $response = Get-HttpResult -Uri "$GatewayBaseUrl/socket.io/?EIO=4&transport=polling"
    if ($response.StatusCode -ne 200) {
        throw "Expected 200 from Socket.IO handshake, got $($response.StatusCode)."
    }

    if ($response.Content -notmatch '"sid"' -and $response.Content -notmatch '^\d+\{') {
        throw "Handshake response did not look like a Socket.IO session payload."
    }

    "GET $GatewayBaseUrl/socket.io/?EIO=4&transport=polling -> 200"
}

Write-Section "Rate Limiting"
$results += Invoke-Check "Rate limit returns HTTP 429 after repeated calls" {
    $lastStatus = $null

    for ($i = 1; $i -le $MaxRateLimitRequests; $i++) {
        $response = Get-HttpResult -Uri "$GatewayBaseUrl$RateLimitPath" -Method $RateLimitMethod -Headers @{ "Content-Type" = "application/json" } -Body "{}"
        $lastStatus = $response.StatusCode

        if ($lastStatus -eq 429) {
            return "Received 429 on request #$i to $RateLimitMethod $RateLimitPath"
        }
    }

    throw "Did not receive 429 after $MaxRateLimitRequests requests. Last status: $lastStatus."
}

$failedCount = @($results | Where-Object { -not $_ }).Count

Write-Section "Summary"
if ($failedCount -eq 0) {
    Write-Host "All Kong verification checks passed." -ForegroundColor Green
    exit 0
}

Write-Host "$failedCount check(s) failed." -ForegroundColor Red
exit 1
