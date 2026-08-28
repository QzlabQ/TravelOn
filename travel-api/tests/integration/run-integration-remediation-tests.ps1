param(
    [string]$GatewayBaseUrl = "http://localhost:58082",
    [string]$ComposeFile = "",
    [string]$ResultsRoot = "",
    [int]$PaymentTimeoutSeconds = 10,
    [int]$RecoveryTimeoutSeconds = 120,
    [int]$AiTimeoutSeconds = 300,
    [string]$PostgresUser = "admin"
)

$ErrorActionPreference = "Stop"
$GatewayBaseUrl = $GatewayBaseUrl.TrimEnd("/")
$apiRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$repoRoot = Split-Path $apiRoot -Parent

if ([string]::IsNullOrWhiteSpace($ComposeFile)) {
    $ComposeFile = Join-Path $apiRoot "docker-compose.yml"
}
if ([string]::IsNullOrWhiteSpace($ResultsRoot)) {
    $ResultsRoot = Join-Path (Join-Path $repoRoot "test-results") "$(Get-Date -Format 'yyyy-MM-dd')\remediation"
}

$evidenceDir = Join-Path $ResultsRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
$results = New-Object System.Collections.Generic.List[object]
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$testUserId = $null
$testUserToken = $null
$startDate = (Get-Date).Date.AddDays(75).ToString("yyyy-MM-dd")
$endDate = (Get-Date).Date.AddDays(77).ToString("yyyy-MM-dd")
$hotelSelection = $null
$timeoutReservationId = $null

function Get-ResponseText {
    param([object]$Response)

    if ($null -eq $Response -or $null -eq $Response.GetResponseStream()) {
        return ""
    }

    $stream = $Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    try {
        return $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
        $stream.Dispose()
    }
}

function Write-Evidence {
    param(
        [string]$Name,
        [string]$Suffix,
        [object]$Value
    )

    $safeName = $Name -replace "[^A-Za-z0-9_-]", "_"
    $path = Join-Path $evidenceDir "$safeName-$Suffix.json"
    if ($Value -is [string]) {
        Set-Content -Encoding utf8 -Path $path -Value $Value
    }
    else {
        $Value | ConvertTo-Json -Depth 50 | Set-Content -Encoding utf8 -Path $path
    }
    return $path
}

function Invoke-Http {
    param(
        [string]$EvidenceName,
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [int]$TimeoutSeconds = 60,
        [int[]]$ExpectedStatus = @(),
        [hashtable]$Headers = @{},
        [string]$Url = ""
    )

    $uri = if ($Url) { $Url } else { "$GatewayBaseUrl$Path" }
    $request = [ordered]@{
        method = $Method
        url = $uri
        body = $Body
        timestamp = (Get-Date).ToString("o")
    }
    Write-Evidence -Name $EvidenceName -Suffix "request" -Value $request | Out-Null

    $status = 0
    $responseText = ""
    $errorMessage = ""
    try {
        $requestHeaders = @{
            Accept = "application/json"
        }
        foreach ($headerName in $Headers.Keys) {
            $requestHeaders[$headerName] = $Headers[$headerName]
        }
        $parameters = @{
            UseBasicParsing = $true
            Method = $Method
            Uri = $uri
            TimeoutSec = $TimeoutSeconds
            Headers = $requestHeaders
        }
        if ($null -ne $Body) {
            $parameters.ContentType = "application/json"
            $parameters.Body = $Body | ConvertTo-Json -Depth 50 -Compress
        }
        $response = Invoke-WebRequest @parameters
        $status = [int]$response.StatusCode
        $responseText = $response.Content
    }
    catch {
        $errorMessage = $_.Exception.Message
        if ($null -ne $_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $responseText = Get-ResponseText $_.Exception.Response
        }
    }

    $parsed = $null
    if ($responseText) {
        try {
            $parsed = $responseText | ConvertFrom-Json
        }
        catch {
            $parsed = $null
        }
    }
    Write-Evidence -Name $EvidenceName -Suffix "response" -Value ([ordered]@{
        status = $status
        error = $errorMessage
        body = if ($parsed) { $parsed } else { $responseText }
    }) | Out-Null

    if ($ExpectedStatus.Count -gt 0 -and $ExpectedStatus -notcontains $status) {
        throw "$EvidenceName expected HTTP $($ExpectedStatus -join ', '), received $status. $errorMessage"
    }

    return [pscustomobject]@{
        status = $status
        text = $responseText
        json = $parsed
        error = $errorMessage
    }
}

function Invoke-Compose {
    param([string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & docker compose -f $ComposeFile @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "docker compose $($Arguments -join ' ') failed: $($output | Out-String)"
    }
    return ($output | Out-String).Trim()
}

function Get-PostgresScalar {
    param(
        [string]$Database,
        [string]$Query
    )

    return (Invoke-Compose -Arguments @(
            "exec", "-T", "postgres", "psql",
            "-U", $PostgresUser,
            "-d", $Database,
            "-tAc", $Query
        )).Trim()
}

function Assert-HttpErrorResponse {
    param(
        [object]$Response,
        [int]$ExpectedStatus,
        [string[]]$ExpectedTerms
    )

    if ($Response.status -ne $ExpectedStatus) {
        throw "Expected HTTP $ExpectedStatus, received $($Response.status)."
    }
    $details = @(
        [string]$Response.json.code,
        [string]$Response.json.error,
        [string]$Response.json.message,
        [string]$Response.json.detail,
        [string]$Response.json.errors,
        [string]$Response.text
    ) -join " "
    if ([string]::IsNullOrWhiteSpace($details)) {
        throw "Error response lacks code, error, message, detail, or validation errors."
    }
    if (@($ExpectedTerms | Where-Object { $details -match [regex]::Escape($_) }).Count -eq 0) {
        throw "Error response did not contain any expected term: $($ExpectedTerms -join ', ')."
    }
}

function Get-RabbitQueueSnapshot {
    $json = Invoke-Compose -Arguments @(
        "exec", "-T", "rabbitmq", "rabbitmqctl", "list_queues",
        "--formatter=json", "name", "messages", "messages_ready", "messages_unacknowledged", "consumers"
    )
    $allQueues = ConvertFrom-Json -InputObject $json
    return @($allQueues | Where-Object {
        $_.name -like "hotels.events.createHotelReservation.queue.*"
    })
}

function Assert-RabbitQueueSnapshotUnchanged {
    param(
        [object[]]$Before,
        [object[]]$After
    )

    if ($Before.Count -eq 0) {
        throw "No hotel reservation consumer queue was found before the invalid requests."
    }
    foreach ($beforeQueue in $Before) {
        $afterQueue = @($After | Where-Object { $_.name -eq $beforeQueue.name } | Select-Object -First 1)
        if ($afterQueue.Count -eq 0) {
            throw "Hotel reservation queue $($beforeQueue.name) disappeared during the assertion window."
        }
        if ([int]$beforeQueue.consumers -lt 1 -or [int]$afterQueue[0].consumers -lt 1) {
            throw "Hotel reservation queue $($beforeQueue.name) had no active consumer."
        }
        foreach ($field in @("messages", "messages_ready", "messages_unacknowledged")) {
            if ([int]$beforeQueue.$field -ne [int]$afterQueue[0].$field) {
                throw "Queue $($beforeQueue.name) field $field changed from $($beforeQueue.$field) to $($afterQueue[0].$field)."
            }
        }
    }
}

function Get-ConsumerLogsSince {
    param([string]$Since)

    return Invoke-Compose -Arguments @("logs", "--no-color", "--since", $Since, "reservation", "hotel")
}

function Wait-Until {
    param(
        [string]$Description,
        [int]$TimeoutSeconds,
        [scriptblock]$Condition
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = ""
    while ((Get-Date) -lt $deadline) {
        try {
            if (& $Condition) {
                return
            }
        }
        catch {
            $lastError = $_.Exception.Message
        }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for $Description. $lastError"
}

function Invoke-Case {
    param(
        [string]$Id,
        [string]$Scenario,
        [scriptblock]$Action
    )

    $started = Get-Date
    try {
        $detail = & $Action
        $results.Add([pscustomobject]@{
            id = $Id
            scenario = $Scenario
            result = "PASS"
            detail = [string]$detail
            durationSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
        })
        Write-Host "PASS $Id $Scenario"
    }
    catch {
        $results.Add([pscustomobject]@{
            id = $Id
            scenario = $Scenario
            result = "FAIL"
            detail = $_.Exception.Message
            durationSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
        })
        Write-Warning "FAIL $Id ${Scenario}: $($_.Exception.Message)"
    }
}

function Get-EurekaCommunityInstances {
    $response = Invoke-Http -EvidenceName "INT-COM-EUREKA-$runId" -Method "GET" `
        -Path "" -Url "http://localhost:58010/eureka/apps/COMMUNITY-SERVICE" -ExpectedStatus @(200, 404)
    if ($response.status -eq 404) {
        return @()
    }
    if ($null -eq $response.json.application -or $null -eq $response.json.application.instance) {
        return @()
    }
    return @($response.json.application.instance)
}

function Stop-CommunityService {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & docker compose -f $ComposeFile stop community 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    Write-Evidence -Name "INT-COM-STOP-COMPOSE-$runId" -Suffix "response" -Value ([ordered]@{
        exitCode = $exitCode
        output = ($output | Out-String).Trim()
    }) | Out-Null

    $stateOutput = & docker compose -f $ComposeFile ps -a --format json community 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect the stopped community service: $($stateOutput | Out-String)"
    }
    $stateLine = @($stateOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1)
    if ($stateLine.Count -eq 0) {
        throw "Community service is missing after stop."
    }
    $state = $stateLine[0] | ConvertFrom-Json
    Write-Evidence -Name "INT-COM-STOP-STATE-$runId" -Suffix "response" -Value $state | Out-Null
    if ($state.State -ne "exited") {
        throw "Community service did not stop. Compose exit=$exitCode, state=$($state.State)."
    }
    return $state
}

Invoke-Compose -Arguments @("ps") | Out-Null

Invoke-Case -Id "INT-SETUP-001" -Scenario "Gateway and hotel lookup are ready" -Action {
    $registration = Invoke-Http -EvidenceName "INT-SETUP-REGISTER-$runId" -Method "POST" `
        -Path "/users/auth/register" -ExpectedStatus @(201) -Body ([ordered]@{
            email = "remediation-$runId@example.test"
            password = "remediation-pass-123"
            name = "Remediation"
            surname = "Tester"
            phone = "13800000000"
        })
    $script:testUserId = [string]$registration.json.user.id
    $script:testUserToken = [string]$registration.json.token
    if ([string]::IsNullOrWhiteSpace($testUserId) -or [string]::IsNullOrWhiteSpace($testUserToken)) {
        throw "Test user registration did not return an id and session token."
    }

    $destinations = Invoke-Http -EvidenceName "INT-SETUP-DESTINATIONS-$runId" -Method "GET" `
        -Path "/hotels/destinations" -ExpectedStatus @(200)
    $destination = @($destinations.json | Where-Object { $_.cityId -eq "C005" } | Select-Object -First 1)
    if ($destination.Count -eq 0) {
        $destination = @($destinations.json | Select-Object -First 1)
    }
    if ($destination.Count -eq 0) {
        throw "No hotel destination is available."
    }

    $search = Invoke-Http -EvidenceName "INT-SETUP-HOTEL-SEARCH-$runId" -Method "GET" `
        -Path "/hotels/search?destinationId=$($destination[0].idLocation)&dateFrom=$startDate&dateTo=$endDate&adults=2&sortBy=price" `
        -ExpectedStatus @(200)
    $hotel = @($search.json | Select-Object -First 1)
    if ($hotel.Count -eq 0) {
        throw "No available hotel was returned for the test dates."
    }

    $details = Invoke-Http -EvidenceName "INT-SETUP-HOTEL-DETAILS-$runId" -Method "GET" `
        -Path "/hotels/$($hotel[0].hotelId)?dateFrom=$startDate&dateTo=$endDate&adults=2" -ExpectedStatus @(200)
    $configuration = @($details.json.roomsConfigurations | Select-Object -First 1)
    $roomIds = @($configuration[0].rooms | ForEach-Object { [long]$_.roomId })
    if ($configuration.Count -eq 0 -or $roomIds.Count -eq 0) {
        throw "Hotel details returned no bookable room configuration."
    }

    $script:hotelSelection = [pscustomobject]@{
        hotelId = [int]$hotel[0].hotelId
        hotelName = [string]$hotel[0].name
        price = [decimal]$configuration[0].pricePerAdult
        roomIds = $roomIds
    }
    "hotelId=$($hotelSelection.hotelId); roomIds=$($hotelSelection.roomIds -join ',')"
}

Invoke-Case -Id "INT-HOTEL-001" -Scenario "Missing or invalid room IDs are rejected before RabbitMQ publish" -Action {
    if ($null -eq $hotelSelection) {
        throw "Hotel selection setup failed."
    }

    $missingRoomPayload = [ordered]@{
        userId = $testUserId
        hotelId = $hotelSelection.hotelId
        hotelName = $hotelSelection.hotelName
        dateFrom = $startDate
        dateTo = $endDate
        adultsQuantity = 2
        childrenUnder3Quantity = 0
        childrenUnder10Quantity = 0
        childrenUnder18Quantity = 0
        price = $hotelSelection.price
        roomName = "integration room"
        travelers = @()
    }
    $logSince = (Get-Date).ToUniversalTime().ToString("o")
    $queueBefore = @(Get-RabbitQueueSnapshot)
    Write-Evidence -Name "INT-HOTEL-QUEUE-BEFORE-INVALID-$runId" -Suffix "response" -Value $queueBefore | Out-Null

    $missingRoomResponse = Invoke-Http -EvidenceName "INT-HOTEL-MISSING-ROOMS-$runId" -Method "POST" `
        -Path "/reservations/hotels" -Headers @{ "X-User-Token" = $testUserToken } `
        -Body $missingRoomPayload -ExpectedStatus @(400)
    Assert-HttpErrorResponse -Response $missingRoomResponse -ExpectedStatus 400 `
        -ExpectedTerms @("Bad Request", "roomIds", "must not be empty")

    $invalidRoomPayload = [ordered]@{
        userId = $testUserId
        hotelId = $hotelSelection.hotelId
        hotelName = $hotelSelection.hotelName
        dateFrom = $startDate
        dateTo = $endDate
        adultsQuantity = 2
        childrenUnder3Quantity = 0
        childrenUnder10Quantity = 0
        childrenUnder18Quantity = 0
        price = $hotelSelection.price
        roomName = "integration room"
        travelers = @()
        roomIds = @(999999999)
    }
    $invalidRoomResponse = Invoke-Http -EvidenceName "INT-HOTEL-INVALID-ROOM-$runId" -Method "POST" `
        -Path "/reservations/hotels" -Headers @{ "X-User-Token" = $testUserToken } `
        -Body $invalidRoomPayload -ExpectedStatus @(400)
    Assert-HttpErrorResponse -Response $invalidRoomResponse -ExpectedStatus 400 `
        -ExpectedTerms @("Selected hotel rooms are unavailable or invalid", "Bad Request", "invalid")

    Start-Sleep -Seconds 2
    $queueAfter = @(Get-RabbitQueueSnapshot)
    Write-Evidence -Name "INT-HOTEL-QUEUE-AFTER-INVALID-$runId" -Suffix "response" -Value $queueAfter | Out-Null
    Assert-RabbitQueueSnapshotUnchanged -Before $queueBefore -After $queueAfter

    $consumerLogs = Get-ConsumerLogsSince -Since $logSince
    Write-Evidence -Name "INT-HOTEL-CONSUMER-LOGS-$runId" -Suffix "response" -Value $consumerLogs | Out-Null
    if ($consumerLogs -match "(?im)Creating hotel reservations|\bERROR\b|[A-Za-z0-9_.]+Exception(?:\s|:)|Caused by:|Optional\.orElseThrow") {
        throw "Reservation or hotel consumer processed a create event or logged an exception while invalid requests were rejected."
    }
    "invalid room IDs returned 400; hotel reservation queue counters stayed unchanged; consumer logs contained no errors"
}

Invoke-Case -Id "INT-HOTEL-002" -Scenario "Real hotel room reservation is created and consumed" -Action {
    if ($null -eq $hotelSelection) {
        throw "Hotel selection setup failed."
    }

    $payload = [ordered]@{
        userId = $testUserId
        hotelId = $hotelSelection.hotelId
        hotelName = $hotelSelection.hotelName
        dateFrom = $startDate
        dateTo = $endDate
        adultsQuantity = 2
        childrenUnder3Quantity = 0
        childrenUnder10Quantity = 0
        childrenUnder18Quantity = 0
        price = $hotelSelection.price
        roomName = "integration room"
        travelers = @()
        roomIds = $hotelSelection.roomIds
    }
    $created = Invoke-Http -EvidenceName "INT-HOTEL-CREATE-$runId" -Method "POST" `
        -Path "/reservations/hotels" -Headers @{ "X-User-Token" = $testUserToken } `
        -Body $payload -ExpectedStatus @(200)
    $script:timeoutReservationId = [string]$created.json.id
    if ([string]::IsNullOrWhiteSpace($timeoutReservationId)) {
        throw "Reservation creation did not return an id."
    }

    $deadline = [datetimeoffset]$created.json.paymentDeadline
    $remainingSeconds = ($deadline - [datetimeoffset]::Now).TotalSeconds
    if ($remainingSeconds -gt ($PaymentTimeoutSeconds + 20)) {
        throw "Payment deadline is $([math]::Round($remainingSeconds, 1)) seconds away; start Compose with APP_PAYMENT_TIMEOUT_SECONDS=$PaymentTimeoutSeconds."
    }

    Wait-Until -Description "hotel room reservation projection" -TimeoutSeconds $PaymentTimeoutSeconds -Condition {
        $count = Get-PostgresScalar -Database "hotel_db" `
            -Query "select count(*) from room_reservation where main_reservation_id = '$timeoutReservationId';"
        return [int]$count -eq $hotelSelection.roomIds.Count
    }

    $count = Get-PostgresScalar -Database "hotel_db" `
        -Query "select count(*) from room_reservation where main_reservation_id = '$timeoutReservationId';"
    "reservationId=$timeoutReservationId; projectedRooms=$count"
}

Invoke-Case -Id "INT-PAY-001" -Scenario "Unpaid hotel reservation expires and rolls back database state" -Action {
    if ([string]::IsNullOrWhiteSpace($timeoutReservationId)) {
        throw "Hotel reservation creation failed."
    }

    Wait-Until -Description "payment timeout rollback" -TimeoutSeconds ($PaymentTimeoutSeconds + 45) -Condition {
        $reservationCount = Get-PostgresScalar -Database "reservation_db" `
            -Query "select count(*) from reservation where id = '$timeoutReservationId';"
        $roomCount = Get-PostgresScalar -Database "hotel_db" `
            -Query "select count(*) from room_reservation where main_reservation_id = '$timeoutReservationId';"
        return [int]$reservationCount -eq 0 -and [int]$roomCount -eq 0
    }

    $reservationCount = Get-PostgresScalar -Database "reservation_db" `
        -Query "select count(*) from reservation where id = '$timeoutReservationId';"
    $roomCount = Get-PostgresScalar -Database "hotel_db" `
        -Query "select count(*) from room_reservation where main_reservation_id = '$timeoutReservationId';"
    "reservationRows=$reservationCount; roomReservationRows=$roomCount"
}

Invoke-Case -Id "INT-COM-001" -Scenario "Community restart unregisters stale Eureka instance and recovers through Gateway" -Action {
    Invoke-Http -EvidenceName "INT-COM-BEFORE-$runId" -Method "GET" -Path "/community/posts" -ExpectedStatus @(200) | Out-Null

    $stoppedState = Stop-CommunityService
    $unavailable = Invoke-Http -EvidenceName "INT-COM-STOPPED-$runId" -Method "GET" -Path "/community/posts" -TimeoutSeconds 30
    if ($unavailable.status -eq 200) {
        throw "Community endpoint remained available after the service was stopped."
    }
    Wait-Until -Description "community Eureka deregistration" -TimeoutSeconds 60 -Condition {
        return @(Get-EurekaCommunityInstances).Count -eq 0
    }

    Invoke-Compose -Arguments @("start", "community") | Out-Null
    Wait-Until -Description "community Gateway recovery" -TimeoutSeconds $RecoveryTimeoutSeconds -Condition {
        $response = Invoke-Http -EvidenceName "INT-COM-RECOVERY-POLL-$runId" -Method "GET" `
            -Path "/community/posts" -TimeoutSeconds 30
        return $response.status -eq 200
    }

    Wait-Until -Description "community Eureka registration" -TimeoutSeconds $RecoveryTimeoutSeconds -Condition {
        return @(Get-EurekaCommunityInstances).Count -eq 1
    }
    $instances = @(Get-EurekaCommunityInstances)
    if ($instances.Count -ne 1) {
        throw "Expected exactly one Eureka COMMUNITY-SERVICE instance after restart, found $($instances.Count)."
    }

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        Invoke-Http -EvidenceName "INT-COM-RECOVERY-$runId-$attempt" -Method "GET" `
            -Path "/community/posts" -ExpectedStatus @(200) | Out-Null
    }
    "stopExit=$($stoppedState.ExitCode); recovered with $($instances.Count) Eureka instance"
}

Invoke-Case -Id "INT-AI-001" -Scenario "Java planner persists a real DeepSeek FLASH response" -Action {
    $aiUserId = [guid]::NewGuid().ToString()
    $conversationPayload = [ordered]@{
        userId = $aiUserId
        coreSlots = [ordered]@{
            city = "Shanghai"
            departureCity = "Beijing"
            travelStartDate = $startDate
            travelEndDate = $startDate
            peopleCount = 2
            budget = "moderate"
            travelStyle = "relaxed"
        }
    }
    $conversation = Invoke-Http -EvidenceName "INT-AI-CREATE-$runId" -Method "POST" `
        -Path "/ai-arrange/api/conversations" -Body $conversationPayload -ExpectedStatus @(200) -TimeoutSeconds 90
    $conversationId = [string]$conversation.json.id
    if ([string]::IsNullOrWhiteSpace($conversationId)) {
        throw "Conversation creation did not return an id."
    }

    $plannerPayload = [ordered]@{
        userId = $aiUserId
        message = "Create a concise one-day Shanghai itinerary with two attractions, one local meal, transit advice, and backup plans."
        planningMode = "INITIAL_PLAN"
        planningScope = "DAY_PLAN"
        modelVariant = "FLASH"
        targetDayIndex = 1
        targetDate = $startDate
        selectedPlaceIds = @()
    }
    $snapshot = Invoke-Http -EvidenceName "INT-AI-RUN-$runId" -Method "POST" `
        -Path "/ai-arrange/api/conversations/$conversationId/planner/run" -Body $plannerPayload `
        -ExpectedStatus @(200) -TimeoutSeconds $AiTimeoutSeconds
    $traceId = [string]$snapshot.json.traceId
    $deepseekCall = @($snapshot.json.agentToolCalls | Where-Object { $_.tool -eq "deepseek_chat_completion" } | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($traceId) -or $deepseekCall.Count -eq 0) {
        throw "Planner snapshot lacks DeepSeek trace evidence."
    }
    if (@("SUCCESS", "PARTIAL_SUCCESS") -notcontains [string]$deepseekCall[0].status) {
        throw "DeepSeek tool call status is $($deepseekCall[0].status), not a successful model response."
    }

    $snapshots = Invoke-Http -EvidenceName "INT-AI-SNAPSHOTS-$runId" -Method "GET" `
        -Path "/ai-arrange/api/conversations/$conversationId/snapshots?userId=$aiUserId" -ExpectedStatus @(200)
    if (@($snapshots.json | Where-Object { $_.traceId -eq $traceId }).Count -eq 0) {
        throw "Saved snapshots do not contain DeepSeek traceId $traceId."
    }

    $mongoCount = Invoke-Compose -Arguments @(
        "exec", "-T", "mongo", "mongosh", "--quiet",
        "--eval", "db.getSiblingDB('ai-arrange-db').planner_snapshots.countDocuments({traceId: '$traceId'})"
    )
    Write-Evidence -Name "INT-AI-MONGO-$runId" -Suffix "response" -Value $mongoCount | Out-Null
    if ([int]$mongoCount -lt 1) {
        throw "MongoDB did not persist the DeepSeek planner snapshot."
    }
    "traceId=$traceId; deepseekStatus=$($deepseekCall[0].status); mongoSnapshots=$mongoCount"
}

$summaryPath = Join-Path $ResultsRoot "remediation-results.json"
$results | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 -Path $summaryPath
$passed = @($results | Where-Object { $_.result -eq "PASS" }).Count
$failed = @($results | Where-Object { $_.result -eq "FAIL" }).Count

Write-Host ""
Write-Host "Remediation integration results: PASS=$passed FAIL=$failed"
Write-Host "Evidence: $ResultsRoot"

if ($failed -gt 0) {
    exit 1
}
