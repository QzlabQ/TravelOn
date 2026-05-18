param(
    [string]$GatewayBaseUrl = "http://localhost:8082",
    [string]$UserId = "00000000-0000-0000-0000-000000000001",
    [string]$City = "Shanghai",
    [string]$TravelStartDate = "2026-06-01",
    [string]$TravelEndDate = "2026-06-03",
    [int]$PeopleCount = 2,
    [string]$Message = "I want a relaxed three-day plan for the Bund, the Shanghai Museum, and one local meal.",
    [int]$CreateRetrySeconds = 90,
    [switch]$AutoSelectFirstPlace,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Send-TextWebSocketMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [string]$Text
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    $null = $Socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [System.Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()
}

function Receive-TextWebSocketMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [int]$TimeoutSeconds = 120
    )

    $buffer = New-Object byte[] 8192
    $stream = New-Object System.IO.MemoryStream
    $tokenSource = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))

    try {
        while ($true) {
            $segment = [System.ArraySegment[byte]]::new($buffer)
            try {
                $result = $Socket.ReceiveAsync($segment, $tokenSource.Token).GetAwaiter().GetResult()
            }
            catch {
                if ($_.Exception.InnerException -is [System.OperationCanceledException]) {
                    return $null
                }
                throw
            }

            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                return $null
            }

            if ($result.Count -gt 0) {
                $stream.Write($buffer, 0, $result.Count)
            }

            if ($result.EndOfMessage) {
                return [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
            }
        }
    }
    finally {
        $stream.Dispose()
        $tokenSource.Dispose()
    }
}

function Get-FirstPlaceIdFromRefresh {
    param(
        [object]$Message,
        [string]$RawText
    )

    if ($Message -and $Message.payload -and $Message.payload.places) {
        $places = @($Message.payload.places)
        if ($places.Count -gt 0 -and $places[0].placeId) {
            return [string]$places[0].placeId
        }
    }

    $match = [regex]::Match($RawText, '"places"\s*:\s*\[\s*\{\s*"placeId"\s*:\s*"([^"]+)"')
    if ($match.Success) {
        return $match.Groups[1].Value
    }

    return $null
}

function Invoke-CreateConversationWithRetry {
    param(
        [string]$Uri,
        [string]$Body,
        [int]$TimeoutSeconds
    )

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)

    while ($true) {
        try {
            return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body $Body
        }
        catch {
            $statusCode = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }

            $isGatewayStartupError = $statusCode -eq 502 -or $statusCode -eq 503 -or $statusCode -eq 504
            if (-not $isGatewayStartupError -or [DateTimeOffset]::UtcNow -ge $deadline) {
                throw
            }

            $remainingSeconds = [int][Math]::Ceiling(($deadline - [DateTimeOffset]::UtcNow).TotalSeconds)
            Write-Host "Gateway returned $statusCode. Waiting for ai-arrange-service registration ($remainingSeconds seconds left)..."
            Start-Sleep -Seconds ([Math]::Min(5, [Math]::Max(1, $remainingSeconds)))
        }
    }
}

function Get-SnapshotsWithSelectionRetry {
    param(
        [string]$Uri,
        [string]$SelectedPlaceId,
        [int]$TimeoutSeconds = 15
    )

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)

    while ($true) {
        $snapshots = @(Invoke-RestMethod -Method Get -Uri $Uri)

        if (-not $SelectedPlaceId -or $snapshots.Count -eq 0) {
            return $snapshots
        }

        $latest = $snapshots | Select-Object -First 1
        $latestSelectedIds = @($latest.selectedPlaceIds) | ForEach-Object { [string]$_ }
        if ($latestSelectedIds -contains $SelectedPlaceId -or [DateTimeOffset]::UtcNow -ge $deadline) {
            return $snapshots
        }

        Start-Sleep -Seconds 1
    }
}

$gateway = $GatewayBaseUrl.TrimEnd("/")
$createUri = "$gateway/ai-arrange/api/conversations"
$wsBaseUrl = $gateway -replace "^http", "ws"
$wsUri = "$wsBaseUrl/ai-arrange/ws/planner"

$createBody = [ordered]@{
    userId = $UserId
    coreSlots = [ordered]@{
        city = $City
        travelStartDate = $TravelStartDate
        travelEndDate = $TravelEndDate
        peopleCount = $PeopleCount
    }
}

$createJson = $createBody | ConvertTo-Json -Depth 10

Write-Host "POST $createUri"
Write-Host $createJson

if ($DryRun) {
    Write-Host "Dry run only. No request was sent."
    return
}

$conversation = Invoke-CreateConversationWithRetry -Uri $createUri -Body $createJson -TimeoutSeconds $CreateRetrySeconds
$conversationId = [string]$conversation.id

if (-not $conversationId) {
    throw "Create conversation did not return an id."
}

Write-Host ""
Write-Host "Conversation created: $conversationId"

    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
    $connectUri = [Uri]"${wsUri}?conversationId=$conversationId&userId=$UserId"
    Write-Host "CONNECT $connectUri"
    $null = $socket.ConnectAsync($connectUri, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()

    $chatEnvelope = [ordered]@{
        type = "PLANNER_CHAT_SEND"
        conversationId = $conversationId
        userId = $UserId
        payload = [ordered]@{
            message = $Message
            selectedPlaceIds = @()
        }
    }

    Send-TextWebSocketMessage -Socket $socket -Text ($chatEnvelope | ConvertTo-Json -Depth 10 -Compress)

    $selectedPlaceId = $null
    $selectionSent = $false
    $refreshCount = 0
    $shouldStop = $false

    :messageLoop while ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open -and -not $shouldStop) {
        $receiveTimeoutSeconds = if ($AutoSelectFirstPlace -and $selectionSent) { 10 } else { 120 }
        $payloadText = Receive-TextWebSocketMessage -Socket $socket -TimeoutSeconds $receiveTimeoutSeconds
        if ($null -eq $payloadText) {
            break
        }

        Write-Host "WS <- $payloadText"

        $isDataRefresh = $payloadText.Contains('"type":"PLANNER_DATA_REFRESH"')
        if ($isDataRefresh -and -not $AutoSelectFirstPlace) {
            break messageLoop
        }
        if ($isDataRefresh -and $AutoSelectFirstPlace -and $payloadText.Contains('"places":[]')) {
            Write-Host "No places were returned, so there is nothing to auto-select."
            break messageLoop
        }

        try {
            $message = $payloadText | ConvertFrom-Json
        }
        catch {
            $message = $null
        }

        $messageType = if ($message -and $message.type) { [string]$message.type } elseif ($isDataRefresh) { "PLANNER_DATA_REFRESH" } else { $null }

        switch ($messageType) {
            "PLANNER_ERROR" {
                throw "Planner error: $($message.payload.code) $($message.payload.message)"
            }
            "PLANNER_DATA_REFRESH" {
                $refreshCount++

                if ($AutoSelectFirstPlace -and -not $selectionSent) {
                    $selectedPlaceId = Get-FirstPlaceIdFromRefresh -Message $message -RawText $payloadText
                    if ($selectedPlaceId) {
                        $selectionEnvelope = [ordered]@{
                            type = "PLANNER_PLACE_SELECTION"
                            conversationId = $conversationId
                            userId = $UserId
                            payload = [ordered]@{
                                selectedPlaceIds = @($selectedPlaceId)
                            }
                        }
                        Send-TextWebSocketMessage -Socket $socket -Text ($selectionEnvelope | ConvertTo-Json -Depth 10 -Compress)
                        $selectionSent = $true
                        Write-Host "Selected placeId: $selectedPlaceId"
                        continue
                    }
                    break messageLoop
                }

                $shouldStop = $true
            }
        }

        $shouldStop = $shouldStop -or (-not $AutoSelectFirstPlace -and $refreshCount -ge 1)
    }

    if ($refreshCount -eq 0) {
        throw "No PLANNER_DATA_REFRESH message was received."
    }
    if ($AutoSelectFirstPlace -and -not $selectionSent) {
        throw "AutoSelectFirstPlace was requested, but no selectable place was returned."
    }
}
finally {
    if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $socket.Abort()
    }
    $socket.Dispose()
}

$snapshotUri = "$gateway/ai-arrange/api/conversations/$conversationId/snapshots?userId=$UserId"
Write-Host ""
Write-Host "GET $snapshotUri"
$snapshots = Get-SnapshotsWithSelectionRetry -Uri $snapshotUri -SelectedPlaceId $selectedPlaceId
Write-Host "Snapshot count: $($snapshots.Count)"

if ($snapshots.Count -gt 0) {
    $latest = $snapshots | Select-Object -First 1
    Write-Host "Latest snapshot version: $($latest.version)"
    Write-Host "Latest title: $($latest.title)"

    if ($AutoSelectFirstPlace -and $selectedPlaceId) {
        $latestSelectedIds = @($latest.selectedPlaceIds) | ForEach-Object { [string]$_ }
        if (-not ($latestSelectedIds -contains $selectedPlaceId)) {
            throw "Selection was sent, but latest snapshot does not include selected placeId $selectedPlaceId."
        }
        Write-Host "Latest snapshot includes selected placeId: $selectedPlaceId"
    }
}
