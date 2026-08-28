param(
    [string]$BaseUrl = "http://localhost:58082",
    [string]$ResultsRoot = "$PSScriptRoot",
    [int]$DateOffsetDays = 0
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

$evidenceDir = Join-Path $ResultsRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$results = New-Object System.Collections.Generic.List[object]
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$userEmail = "integration.$runId@example.com"
$password = "TravelTest123!"
$userId = $null
$token = $null
$travelerId = $null
$postId = $null
$reservationId = $null
$conversationId = $null
$shanghaiDestinationId = $null
$hotelId = $null
$hotelName = $null
$hotelPrice = 100.0
$hotelRoomIds = @()
if ($DateOffsetDays -le 0) {
    $DateOffsetDays = Get-Random -Minimum 30 -Maximum 90
}
$startDate = (Get-Date).Date.AddDays($DateOffsetDays).ToString("yyyy-MM-dd")
$endDate = (Get-Date).Date.AddDays($DateOffsetDays + 2).ToString("yyyy-MM-dd")

function Get-ResponseText {
    param([object]$Response)

    if ($null -eq $Response) {
        return ""
    }

    $stream = $Response.GetResponseStream()
    if ($null -eq $stream) {
        return ""
    }

    $reader = New-Object System.IO.StreamReader($stream)
    try {
        return $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
        $stream.Dispose()
    }
}

function Add-Result {
    param(
        [string]$Id,
        [string]$Module,
        [string]$Flow,
        [string]$Method,
        [string]$Path,
        [int]$Status,
        [int[]]$ExpectedStatus,
        [string]$Result,
        [string]$Note,
        [string]$RequestFile,
        [string]$ResponseFile
    )

    $results.Add([pscustomobject]@{
        id = $Id
        module = $Module
        flow = $Flow
        method = $Method
        endpoint = $Path
        expectedStatus = ($ExpectedStatus -join ",")
        actualStatus = $Status
        result = $Result
        note = $Note
        requestFile = $RequestFile
        responseFile = $ResponseFile
    })
}

function Invoke-ApiTest {
    param(
        [string]$Id,
        [string]$Module,
        [string]$Flow,
        [string]$Method,
        [string]$Path,
        [int[]]$ExpectedStatus = @(200),
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [scriptblock]$Assert = $null,
        [int]$TimeoutSec = 60
    )

    $safeId = $Id -replace "[^A-Za-z0-9_-]", "_"
    $requestFile = Join-Path $evidenceDir "$safeId-request.json"
    $responseFile = Join-Path $evidenceDir "$safeId-response.json"
    $requestRecord = [ordered]@{
        id = $Id
        method = $Method
        url = "$BaseUrl$Path"
        headers = $Headers
        body = $Body
        timestamp = (Get-Date).ToString("o")
    }
    $requestRecord | ConvertTo-Json -Depth 30 | Set-Content -Encoding utf8 $requestFile

    $status = 0
    $responseText = ""
    $note = ""
    $parsed = $null

    try {
        $requestParameters = @{
            UseBasicParsing = $true
            Method = $Method
            Uri = "$BaseUrl$Path"
            Headers = $Headers
            TimeoutSec = $TimeoutSec
        }
        if ($null -ne $Body) {
            $requestParameters.ContentType = "application/json"
            $requestParameters.Body = $Body | ConvertTo-Json -Depth 30 -Compress
        }
        $response = Invoke-WebRequest @requestParameters
        $status = [int]$response.StatusCode
        $responseText = $response.Content
    }
    catch {
        if ($null -ne $_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $responseText = Get-ResponseText $_.Exception.Response
        }
        else {
            $note = $_.Exception.Message
        }
    }

    if ([string]::IsNullOrWhiteSpace($responseText)) {
        Set-Content -Encoding utf8 $responseFile $note
    }
    else {
        Set-Content -Encoding utf8 $responseFile $responseText
        try {
            $parsed = $responseText | ConvertFrom-Json
        }
        catch {
            $note = "Response was not valid JSON."
        }
    }

    $passed = $ExpectedStatus -contains $status
    if ($passed -and $null -ne $Assert) {
        try {
            & $Assert $parsed
        }
        catch {
            $passed = $false
            $note = $_.Exception.Message
        }
    }

    $result = if ($passed) { "PASS" } else { "FAIL" }
    Add-Result -Id $Id -Module $Module -Flow $Flow -Method $Method -Path $Path `
        -Status $status -ExpectedStatus $ExpectedStatus -Result $result -Note $note `
        -RequestFile $requestFile -ResponseFile $responseFile

    return [pscustomobject]@{
        id = $Id
        status = $status
        passed = $passed
        parsed = $parsed
        responseText = $responseText
    }
}

function Add-Skipped {
    param([string]$Id, [string]$Module, [string]$Flow, [string]$Path, [string]$Note)
    Add-Result -Id $Id -Module $Module -Flow $Flow -Method "SKIP" -Path $Path `
        -Status 0 -ExpectedStatus @() -Result "BLOCKED" -Note $Note `
        -RequestFile "" -ResponseFile ""
}

Write-Output "API test run $runId against $BaseUrl"

$r = Invoke-ApiTest -Id "INT-001" -Module "Hotel" -Flow "main" -Method "GET" `
    -Path "/hotels/destinations" -Assert {
        param($body)
        if (@($body).Count -eq 0) { throw "No hotel destinations returned." }
    }
if ($r.passed) {
    $destinationList = @($r.parsed)
    $shanghai = $destinationList | Where-Object { $_.cityId -eq "C005" } | Select-Object -First 1
    if ($null -ne $shanghai) {
        $shanghaiDestinationId = [string]$shanghai.idLocation
    }
}

$r = Invoke-ApiTest -Id "INT-002" -Module "Transport" -Flow "main" -Method "GET" `
    -Path "/transports/available" -Assert {
        param($body)
        if ($null -eq $body.departures -or $null -eq $body.arrivals) { throw "Transport options are incomplete." }
    }

$registerBody = [ordered]@{
    email = $userEmail
    password = $password
    name = "Integration"
    surname = "Tester"
    phone = "13800000000"
}
$r = Invoke-ApiTest -Id "API-USER-001" -Module "User" -Flow "main" -Method "POST" `
    -Path "/users/auth/register" -ExpectedStatus @(201) -Body $registerBody -Assert {
        param($body)
        if ([string]::IsNullOrWhiteSpace($body.token) -or $null -eq $body.user.id) { throw "Register response lacks token or user id." }
    }
if ($r.passed) {
    $token = [string]$r.parsed.token
    $userId = [string]$r.parsed.user.id
}

$loginBody = @{ email = $userEmail; password = $password }
$r = Invoke-ApiTest -Id "API-USER-002" -Module "User" -Flow "main" -Method "POST" `
    -Path "/users/auth/login" -Body $loginBody -Assert {
        param($body)
        if ([string]::IsNullOrWhiteSpace($body.token)) { throw "Login response lacks token." }
    }
if ($r.passed) {
    $token = [string]$r.parsed.token
}

if ($null -ne $token) {
    Invoke-ApiTest -Id "API-USER-003" -Module "User" -Flow "main" -Method "GET" `
        -Path "/users/me" -Headers @{ "X-User-Token" = $token } -Assert {
            param($body)
            if ([string]$body.id -ne $userId) { throw "Current user id does not match registered user." }
        } | Out-Null
}
else {
    Add-Skipped "API-USER-003" "User" "main" "/users/me" "Registration did not return a token."
}

Invoke-ApiTest -Id "API-USER-004" -Module "User" -Flow "exception" -Method "POST" `
    -Path "/users/auth/login" -ExpectedStatus @(401) `
    -Body @{ email = $userEmail; password = "wrong-password" } | Out-Null

Invoke-ApiTest -Id "API-USER-005" -Module "User" -Flow "exception" -Method "GET" `
    -Path "/users/me" -ExpectedStatus @(400) | Out-Null

Invoke-ApiTest -Id "API-USER-006" -Module "User" -Flow "exception" -Method "POST" `
    -Path "/users/auth/register" -ExpectedStatus @(400) `
    -Body @{ email = "invalid-email"; password = "123"; name = "" } | Out-Null

if ($null -ne $token) {
    $travelerBody = @{
        name = "Integration Traveler"
        travelerType = "ADULT"
        documentType = "ID_CARD"
        documentNumber = "TEST-$runId"
        phone = "13800000000"
    }
    $r = Invoke-ApiTest -Id "API-USER-007" -Module "User" -Flow "alternative" -Method "POST" `
        -Path "/users/me/travelers" -ExpectedStatus @(201) -Headers @{ "X-User-Token" = $token } `
        -Body $travelerBody -Assert {
            param($body)
            if ($null -eq $body.id) { throw "Traveler id was not returned." }
        }
    if ($r.passed) {
        $travelerId = [string]$r.parsed.id
        Invoke-ApiTest -Id "API-USER-008" -Module "User" -Flow "alternative" -Method "DELETE" `
            -Path "/users/me/travelers/$travelerId" -ExpectedStatus @(204) `
            -Headers @{ "X-User-Token" = $token } | Out-Null
    }
}
else {
    Add-Skipped "API-USER-007" "User" "alternative" "/users/me/travelers" "Registration did not return a token."
}

if ($null -ne $shanghaiDestinationId) {
    $hotelSearchPath = "/hotels/search?destinationId=$shanghaiDestinationId&dateFrom=$startDate&dateTo=$endDate&adults=2&sortBy=price"
    $r = Invoke-ApiTest -Id "API-HOTEL-001" -Module "Hotel" -Flow "main" -Method "GET" `
        -Path $hotelSearchPath -Assert {
            param($body)
            if (@($body).Count -eq 0) { throw "Hotel search returned no available hotel." }
        }
    if ($r.passed) {
        $hotel = @($r.parsed) | Select-Object -First 1
        $hotelId = [int]$hotel.hotelId
        $hotelName = [string]$hotel.name
        $hotelPrice = [double]$hotel.pricePerAdult
        $r = Invoke-ApiTest -Id "API-HOTEL-004" -Module "Hotel" -Flow "main" -Method "GET" `
            -Path "/hotels/$hotelId`?dateFrom=$startDate&dateTo=$endDate&adults=2" -Assert {
                param($body)
                if (@($body.roomsConfigurations).Count -eq 0) { throw "Hotel details returned no bookable room configuration." }
            }
        if ($r.passed) {
            $configuration = @($r.parsed.roomsConfigurations) | Select-Object -First 1
            $hotelRoomIds = @($configuration.rooms | ForEach-Object { [long]$_.roomId })
        }
    }

    $hotelRatingPath = "/hotels/search?destinationId=$shanghaiDestinationId&dateFrom=$startDate&dateTo=$endDate&adults=2&minRating=4.5&sortBy=rating"
    Invoke-ApiTest -Id "API-HOTEL-002" -Module "Hotel" -Flow "alternative" -Method "GET" `
        -Path $hotelRatingPath -Assert {
            param($body)
            if ($null -eq $body) { throw "Hotel rating-filter search returned no JSON result." }
        } | Out-Null
}
else {
    Add-Skipped "API-HOTEL-001" "Hotel" "main" "/hotels/search" "Shanghai destination id was not returned."
    Add-Skipped "API-HOTEL-002" "Hotel" "alternative" "/hotels/search?minRating=4.5" "Shanghai destination id was not returned."
}

Invoke-ApiTest -Id "API-HOTEL-003" -Module "Hotel" -Flow "exception" -Method "GET" `
    -Path "/hotels/search?dateFrom=$startDate&dateTo=$endDate&adults=2" -ExpectedStatus @(400) | Out-Null

Invoke-ApiTest -Id "API-TRANS-001" -Module "Transport" -Flow "main" -Method "GET" `
    -Path "/transports/tickets/options?type=TRAIN" -Assert {
        param($body)
        if (@($body.departures).Count -eq 0 -or @($body.arrivals).Count -eq 0) { throw "Train options are empty." }
    } | Out-Null

Invoke-ApiTest -Id "API-TRANS-002" -Module "Transport" -Flow "main" -Method "GET" `
    -Path "/transports/tickets/options?type=FLIGHT" -Assert {
        param($body)
        if (@($body.departures).Count -eq 0 -or @($body.arrivals).Count -eq 0) { throw "Flight options are empty." }
    } | Out-Null

Invoke-ApiTest -Id "API-TRANS-003" -Module "Transport" -Flow "main" -Method "GET" `
    -Path "/transports/tickets?type=TRAIN&departureCity=Beijing&arrivalCity=Shanghai&departureDate=$startDate" `
    -Assert {
        param($body)
        if ($null -eq $body) { throw "Train search returned no JSON result." }
    } | Out-Null

Invoke-ApiTest -Id "API-TRANS-004" -Module "Transport" -Flow "alternative" -Method "GET" `
    -Path "/transports/tickets?type=FLIGHT&departureCity=Beijing&arrivalCity=Shanghai&departureDate=$startDate" `
    -Assert {
        param($body)
        if ($null -eq $body) { throw "Flight search returned no JSON result." }
    } | Out-Null

Invoke-ApiTest -Id "API-TRANS-005" -Module "Transport" -Flow "exception" -Method "GET" `
    -Path "/transports/tickets?type=TRAIN&departureCity=Beijing&arrivalCity=Shanghai" `
    -ExpectedStatus @(400) | Out-Null

Invoke-ApiTest -Id "API-COM-001" -Module "Community" -Flow "main" -Method "GET" `
    -Path "/community/posts" -Assert {
        param($body)
        if ($null -eq $body.content) { throw "Community page response lacks content." }
    } | Out-Null

if ($null -ne $token) {
    $postBody = @{
        title = "Integration test post $runId"
        content = "Created by automated integration test."
        contentFormat = "PLAIN_TEXT"
        category = "TRAVEL_NOTE"
        destinationCityId = "C005"
        imageUrls = @()
    }
    $r = Invoke-ApiTest -Id "API-COM-002" -Module "Community" -Flow "main" -Method "POST" `
        -Path "/community/posts" -ExpectedStatus @(201) -Headers @{ "X-User-Token" = $token } `
        -Body $postBody -Assert {
            param($body)
            if ($null -eq $body.id) { throw "Created post id was not returned." }
        }
    if ($r.passed) {
        $postId = [string]$r.parsed.id
        Invoke-ApiTest -Id "API-COM-003" -Module "Community" -Flow "main" -Method "GET" `
            -Path "/community/posts/$postId" -Headers @{ "X-User-Token" = $token } | Out-Null
        Invoke-ApiTest -Id "API-COM-004" -Module "Community" -Flow "alternative" -Method "POST" `
            -Path "/community/posts/$postId/likes" -ExpectedStatus @(200) `
            -Headers @{ "X-User-Token" = $token } | Out-Null
        Invoke-ApiTest -Id "API-COM-006" -Module "Community" -Flow "alternative" -Method "DELETE" `
            -Path "/community/posts/$postId" -ExpectedStatus @(204) `
            -Headers @{ "X-User-Token" = $token } | Out-Null
    }
}
else {
    Add-Skipped "API-COM-002" "Community" "main" "/community/posts" "Registration did not return a token."
}

Invoke-ApiTest -Id "API-COM-005" -Module "Community" -Flow "exception" -Method "POST" `
    -Path "/community/posts" -ExpectedStatus @(400) -Body @{
        title = ""
        content = ""
        category = "TRAVEL_NOTE"
    } | Out-Null

if ($null -ne $userId -and $null -ne $hotelId -and $hotelRoomIds.Count -gt 0) {
    $reservationBody = @{
        userId = $userId
        hotelId = $hotelId
        hotelName = $hotelName
        dateFrom = $startDate
        dateTo = $endDate
        adultsQuantity = 2
        childrenUnder3Quantity = 0
        childrenUnder10Quantity = 0
        childrenUnder18Quantity = 0
        price = $hotelPrice
        roomName = "Integration Test Room"
        travelers = @()
        roomIds = $hotelRoomIds
    }
    $r = Invoke-ApiTest -Id "API-ORDER-001" -Module "Reservation" -Flow "main" -Method "POST" `
        -Path "/reservations/hotels" -Headers @{ "X-User-Token" = $token } -Body $reservationBody -Assert {
            param($body)
            if ($null -eq $body.id) { throw "Reservation id was not returned." }
        }
    if ($r.passed) {
        $reservationId = [string]$r.parsed.id
        Invoke-ApiTest -Id "API-ORDER-002" -Module "Reservation" -Flow "main" -Method "GET" `
            -Path "/reservations/$reservationId" -Headers @{ "X-User-Token" = $token } | Out-Null
        Invoke-ApiTest -Id "API-ORDER-003" -Module "Payment" -Flow "exception" -Method "POST" `
            -Path "/reservations/purchase" -Headers @{ "X-User-Token" = $token } -Body @{
                reservationId = $reservationId
                cardNumber = "6200000000000000"
            } -ExpectedStatus @(400) | Out-Null
        Invoke-ApiTest -Id "API-ORDER-004" -Module "Payment" -Flow "main" -Method "POST" `
            -Path "/reservations/purchase" -Headers @{ "X-User-Token" = $token } -Body @{
                reservationId = $reservationId
                cardNumber = "6200000000000005"
            } | Out-Null
        Invoke-ApiTest -Id "API-ORDER-005" -Module "Payment" -Flow "alternative" -Method "GET" `
            -Path "/reservations/$reservationId/payments" -Headers @{ "X-User-Token" = $token } | Out-Null
        Invoke-ApiTest -Id "API-ORDER-006" -Module "Payment" -Flow "alternative" -Method "POST" `
            -Path "/reservations/purchase" -Headers @{ "X-User-Token" = $token } -Body @{
                reservationId = $reservationId
                cardNumber = "6200000000000005"
            } | Out-Null
    }
}
else {
    Add-Skipped "API-ORDER-001" "Reservation" "main" "/reservations/hotels" "Registration or hotel room lookup did not return a bookable room."
}

if ($null -ne $userId) {
    $conversationBody = @{
        userId = $userId
        coreSlots = @{
            city = "Shanghai"
            travelStartDate = $startDate
            travelEndDate = $endDate
            peopleCount = 2
        }
    }
    $r = Invoke-ApiTest -Id "API-AI-001" -Module "AI" -Flow "main" -Method "POST" `
        -Path "/ai-arrange/api/conversations" -Body $conversationBody -Assert {
            param($body)
            if ($null -eq $body.id) { throw "Conversation id was not returned." }
        } -TimeoutSec 90
    if ($r.passed) {
        $conversationId = [string]$r.parsed.id
        Invoke-ApiTest -Id "API-AI-002" -Module "AI" -Flow "main" -Method "GET" `
            -Path "/ai-arrange/api/conversations/$conversationId`?userId=$userId" -TimeoutSec 60 | Out-Null
        Invoke-ApiTest -Id "API-AI-003" -Module "AI" -Flow "alternative" -Method "GET" `
            -Path "/ai-arrange/api/conversations/$conversationId/snapshots`?userId=$userId" -TimeoutSec 60 | Out-Null
    }
}
else {
    Add-Skipped "API-AI-001" "AI" "main" "/ai-arrange/api/conversations" "Registration did not return a user id."
}

Invoke-ApiTest -Id "API-AI-004" -Module "AI" -Flow "exception" -Method "POST" `
    -Path "/ai-arrange/api/conversations" -ExpectedStatus @(400) -Body @{ userId = $userId } | Out-Null

$summaryFile = Join-Path $ResultsRoot "api-results.json"
$results | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 $summaryFile

$counts = $results | Group-Object result | Sort-Object Name
Write-Output ""
Write-Output "API test results:"
$counts | ForEach-Object { Write-Output ("{0}: {1}" -f $_.Name, $_.Count) }
Write-Output "Results: $summaryFile"
