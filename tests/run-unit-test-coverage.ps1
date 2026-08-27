<#
.SYNOPSIS
Runs the repository's local test suites and writes a consolidated result.

.DESCRIPTION
The generated artifacts/test-results/summary.json contains generatedAt,
overallStatus, and one module object per executed suite. Each module records
its command, status, durationSeconds, test counts, coverage metrics, native
report paths, log path, and parsing warnings. latest.md presents the same
information in a compact human-readable table.

The script attempts every configured suite even after a failure. Its exit
code is nonzero when any suite command fails. Missing machine-readable reports
are warnings only and do not change a successful command into a failed suite.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifactDirectory = Join-Path $repositoryRoot 'artifacts/test-results'
$logsDirectory = Join-Path $artifactDirectory 'logs'
$summaryPath = Join-Path $artifactDirectory 'summary.json'
$markdownPath = Join-Path $artifactDirectory 'latest.md'
$pythonJUnitPath = Join-Path $artifactDirectory 'python-junit.xml'
$frontendJunitPath = Join-Path $artifactDirectory 'frontend-junit.json'

New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null

function New-TestCounts {
    param(
        [Nullable[int]]$Total = $null,
        [Nullable[int]]$Passed = $null,
        [Nullable[int]]$Failed = $null,
        [Nullable[int]]$Errors = $null,
        [Nullable[int]]$Skipped = $null
    )

    return [pscustomobject][ordered]@{
        total = $Total
        passed = $Passed
        failed = $Failed
        errors = $Errors
        skipped = $Skipped
    }
}

function New-CoverageMetric {
    param(
        [Nullable[double]]$Covered = $null,
        [Nullable[double]]$Missed = $null,
        [Nullable[double]]$Percent = $null
    )

    $total = $null
    if ($null -ne $Covered -and $null -ne $Missed) {
        $total = $Covered + $Missed
        if ($total -gt 0) {
            $Percent = [math]::Round(($Covered / $total) * 100, 2)
        }
    }

    return [pscustomobject][ordered]@{
        covered = $Covered
        missed = $Missed
        total = $total
        percent = $Percent
    }
}

function New-CoverageSummary {
    return [pscustomobject][ordered]@{
        lines = New-CoverageMetric
        branches = New-CoverageMetric
        statements = New-CoverageMetric
        functions = New-CoverageMetric
    }
}

function ConvertTo-NullableInt {
    param($Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }
    return [int]$Value
}

function Get-JUnitResults {
    param(
        [string]$ReportDirectory,
        [string]$Filter = 'TEST-*.xml',
        [datetime]$NotOlderThan
    )

    $warnings = [System.Collections.Generic.List[string]]::new()
    if (-not (Test-Path $ReportDirectory)) {
        $warnings.Add("JUnit report directory was not created: $ReportDirectory")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }

    $reports = @(Get-ChildItem -Path $ReportDirectory -Filter $Filter -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $NotOlderThan })
    if ($reports.Count -eq 0) {
        $warnings.Add("No JUnit reports matching $Filter were updated during this execution in $ReportDirectory")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }

    $total = 0
    $failed = 0
    $errors = 0
    $skipped = 0
    foreach ($report in $reports) {
        try {
            [xml]$document = Get-Content -Raw $report.FullName
            $root = $document.DocumentElement
            $total += ConvertTo-NullableInt $root.tests
            $failed += ConvertTo-NullableInt $root.failures
            $errors += ConvertTo-NullableInt $root.errors
            $skipped += (ConvertTo-NullableInt $root.skipped) + (ConvertTo-NullableInt $root.disabled)
        }
        catch {
            $warnings.Add("Could not parse JUnit report $($report.FullName): $($_.Exception.Message)")
        }
    }

    $passed = $null
    if ($null -ne $total) { $passed = $total - $failed - $errors - $skipped }
    return [pscustomobject]@{
        tests = New-TestCounts -Total $total -Passed $passed -Failed $failed -Errors $errors -Skipped $skipped
        warnings = $warnings
    }
}

function Get-PytestResults {
    param([string]$ReportPath, [datetime]$NotOlderThan)

    $warnings = [System.Collections.Generic.List[string]]::new()
    if (-not (Test-Path $ReportPath)) {
        $warnings.Add("pytest JUnit report was not created: $ReportPath")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }
    if ((Get-Item $ReportPath).LastWriteTime -lt $NotOlderThan) {
        $warnings.Add("pytest JUnit report was not updated during this execution: $ReportPath")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }

    try {
        [xml]$document = Get-Content -Raw $ReportPath
        $root = $document.DocumentElement
        $total = ConvertTo-NullableInt $root.tests
        $failed = ConvertTo-NullableInt $root.failures
        $errors = ConvertTo-NullableInt $root.errors
        $skipped = ConvertTo-NullableInt $root.skipped
        $passed = $null
        if ($null -ne $total) { $passed = $total - $failed - $errors - $skipped }
        return [pscustomobject]@{
            tests = New-TestCounts -Total $total -Passed $passed -Failed $failed -Errors $errors -Skipped $skipped
            warnings = $warnings
        }
    }
    catch {
        $warnings.Add("Could not parse pytest JUnit report ${ReportPath}: $($_.Exception.Message)")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }
}

function Get-JacocoCoverage {
    param([string]$ReportPath, [datetime]$NotOlderThan)

    $coverage = New-CoverageSummary
    $warnings = [System.Collections.Generic.List[string]]::new()
    if (-not (Test-Path $ReportPath)) {
        $warnings.Add("JaCoCo CSV report was not created: $ReportPath")
        return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
    }
    if ((Get-Item $ReportPath).LastWriteTime -lt $NotOlderThan) {
        $warnings.Add("JaCoCo CSV report was not updated during this execution: $ReportPath")
        return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
    }

    try {
        $rows = @(Import-Csv -Path $ReportPath)
        if ($rows.Count -eq 0) {
            $warnings.Add("JaCoCo CSV report has no data rows: $ReportPath")
            return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
        }
        $lineCovered = ($rows | Measure-Object -Property LINE_COVERED -Sum).Sum
        $lineMissed = ($rows | Measure-Object -Property LINE_MISSED -Sum).Sum
        $branchCovered = ($rows | Measure-Object -Property BRANCH_COVERED -Sum).Sum
        $branchMissed = ($rows | Measure-Object -Property BRANCH_MISSED -Sum).Sum
        $coverage.lines = New-CoverageMetric -Covered $lineCovered -Missed $lineMissed
        $coverage.branches = New-CoverageMetric -Covered $branchCovered -Missed $branchMissed
    }
    catch {
        $warnings.Add("Could not parse JaCoCo CSV report ${ReportPath}: $($_.Exception.Message)")
    }

    return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
}

function Get-CoberturaCoverage {
    param([string]$ReportPath, [datetime]$NotOlderThan)

    $coverage = New-CoverageSummary
    $warnings = [System.Collections.Generic.List[string]]::new()
    if (-not (Test-Path $ReportPath)) {
        $warnings.Add("Python coverage report was not created: $ReportPath")
        return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
    }
    if ((Get-Item $ReportPath).LastWriteTime -lt $NotOlderThan) {
        $warnings.Add("Python coverage report was not updated during this execution: $ReportPath")
        return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
    }

    try {
        [xml]$document = Get-Content -Raw $ReportPath
        $root = $document.DocumentElement
        $coverage.lines = New-CoverageMetric -Percent ([math]::Round(([double]$root.'line-rate') * 100, 2))
        $coverage.branches = New-CoverageMetric -Percent ([math]::Round(([double]$root.'branch-rate') * 100, 2))
    }
    catch {
        $warnings.Add("Could not parse Python coverage report ${ReportPath}: $($_.Exception.Message)")
    }

    return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
}

function Get-FrontendTestResults {
    param([string]$ReportPath, [datetime]$NotOlderThan)

    $warnings = [System.Collections.Generic.List[string]]::new()
    if (-not (Test-Path $ReportPath)) {
        $warnings.Add("Jest JSON report was not created: $ReportPath")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }
    if ((Get-Item $ReportPath).LastWriteTime -lt $NotOlderThan) {
        $warnings.Add("Jest JSON report was not updated during this execution: $ReportPath")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }

    try {
        $report = Get-Content -Raw $ReportPath | ConvertFrom-Json
        $total = ConvertTo-NullableInt $report.numTotalTests
        $failed = ConvertTo-NullableInt $report.numFailedTests
        $skipped = ConvertTo-NullableInt $report.numPendingTests
        $passed = ConvertTo-NullableInt $report.numPassedTests
        return [pscustomobject]@{
            tests = New-TestCounts -Total $total -Passed $passed -Failed $failed -Errors 0 -Skipped $skipped
            warnings = $warnings
        }
    }
    catch {
        $warnings.Add("Could not parse Jest JSON report ${ReportPath}: $($_.Exception.Message)")
        return [pscustomobject]@{ tests = New-TestCounts; warnings = $warnings }
    }
}

function Get-IstanbulCoverage {
    param([string]$ReportPath, [datetime]$NotOlderThan)

    $coverage = New-CoverageSummary
    $warnings = [System.Collections.Generic.List[string]]::new()
    if (-not (Test-Path $ReportPath)) {
        $warnings.Add("Istanbul coverage report was not created: $ReportPath")
        return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
    }
    if ((Get-Item $ReportPath).LastWriteTime -lt $NotOlderThan) {
        $warnings.Add("Istanbul coverage report was not updated during this execution: $ReportPath")
        return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
    }

    try {
        $report = Get-Content -Raw $ReportPath | ConvertFrom-Json
        $statementCovered = 0; $statementMissed = 0
        $functionCovered = 0; $functionMissed = 0
        $branchCovered = 0; $branchMissed = 0
        $lineHits = @{}

        foreach ($file in $report.PSObject.Properties.Value) {
            foreach ($property in $file.s.PSObject.Properties) {
                $hits = [int]$property.Value
                if ($hits -gt 0) { $statementCovered++ } else { $statementMissed++ }
                $line = [string]$file.statementMap.($property.Name).start.line
                if (-not $lineHits.ContainsKey($line) -or $hits -gt $lineHits[$line]) { $lineHits[$line] = $hits }
            }
            foreach ($property in $file.f.PSObject.Properties) {
                if ([int]$property.Value -gt 0) { $functionCovered++ } else { $functionMissed++ }
            }
            foreach ($property in $file.b.PSObject.Properties) {
                foreach ($hits in $property.Value) {
                    if ([int]$hits -gt 0) { $branchCovered++ } else { $branchMissed++ }
                }
            }
        }

        $lineCovered = @($lineHits.Values | Where-Object { $_ -gt 0 }).Count
        $lineMissed = @($lineHits.Values | Where-Object { $_ -eq 0 }).Count
        $coverage.statements = New-CoverageMetric -Covered $statementCovered -Missed $statementMissed
        $coverage.functions = New-CoverageMetric -Covered $functionCovered -Missed $functionMissed
        $coverage.branches = New-CoverageMetric -Covered $branchCovered -Missed $branchMissed
        $coverage.lines = New-CoverageMetric -Covered $lineCovered -Missed $lineMissed
    }
    catch {
        $warnings.Add("Could not parse Istanbul coverage report ${ReportPath}: $($_.Exception.Message)")
    }

    return [pscustomobject]@{ coverage = $coverage; warnings = $warnings }
}

function Invoke-TestModule {
    param(
        [string]$Name,
        [string]$Command,
        [scriptblock]$Action,
        [string[]]$NativeReports
    )

    $logPath = Join-Path $logsDirectory "$Name.log"
    $started = Get-Date
    $exitCode = 1
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Maven and pytest can emit non-fatal diagnostics on stderr. Preserve
        # them in the module log and decide status from the process exit code.
        $ErrorActionPreference = 'Continue'
        & $Action *> $logPath
        $actionSucceeded = $?
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            if ($actionSucceeded) { $exitCode = 0 } else { $exitCode = 1 }
        }
    }
    catch {
        $_ | Out-File -FilePath $logPath -Append
        $exitCode = 1
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    return [pscustomobject][ordered]@{
        name = $Name
        command = $Command
        status = if ($exitCode -eq 0) { 'passed' } else { 'failed' }
        durationSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
        tests = New-TestCounts
        coverage = New-CoverageSummary
        nativeReports = @($NativeReports)
        logPath = "artifacts/test-results/logs/$Name.log"
        warnings = @()
    }
}

function Add-ParsingWarning {
    param($Module, [string[]]$Warnings)
    foreach ($warning in $Warnings) { $Module.warnings += $warning }
}

$startedAt = Get-Date
$modules = [System.Collections.Generic.List[object]]::new()
$javaModules = @(
    'ai-arrange-service',
    'api-gateway',
    'community-service',
    'discovery-service',
    'hotel-service',
    'offer-provider-service',
    'payment-service',
    'reservation-service',
    'transport-service',
    'user-service'
)

foreach ($moduleName in $javaModules) {
    $moduleRoot = Join-Path $repositoryRoot "travel-api/$moduleName"
    $jacocoPath = Join-Path $moduleRoot 'target/site/jacoco/jacoco.csv'
    $result = Invoke-TestModule -Name $moduleName -Command 'mvn verify' -NativeReports @(
        "travel-api/$moduleName/target/surefire-reports/",
        "travel-api/$moduleName/target/site/jacoco/index.html",
        "travel-api/$moduleName/target/site/jacoco/jacoco.csv"
    ) -Action {
        Push-Location $moduleRoot
        try { mvn verify } finally { Pop-Location }
    }
    $junit = Get-JUnitResults -ReportDirectory (Join-Path $moduleRoot 'target/surefire-reports') -NotOlderThan $startedAt
    $jacoco = Get-JacocoCoverage -ReportPath $jacocoPath -NotOlderThan $startedAt
    $result.tests = $junit.tests
    $result.coverage = $jacoco.coverage
    Add-ParsingWarning -Module $result -Warnings $junit.warnings
    Add-ParsingWarning -Module $result -Warnings $jacoco.warnings
    $modules.Add($result)
}

$pythonRoot = Join-Path $repositoryRoot 'travel-api/ai-arrange-agent-service'
$pythonResult = Invoke-TestModule -Name 'ai-arrange-agent-service' -Command 'python -m pytest -q --junitxml=artifacts/test-results/python-junit.xml' -NativeReports @(
    'artifacts/test-results/python-junit.xml',
    'travel-api/ai-arrange-agent-service/coverage.xml',
    'travel-api/ai-arrange-agent-service/htmlcov/index.html'
) -Action {
    Push-Location $pythonRoot
    try { python -m pytest -q "--junitxml=$pythonJUnitPath" } finally { Pop-Location }
}
$pythonJUnit = Get-PytestResults -ReportPath $pythonJUnitPath -NotOlderThan $startedAt
$pythonCoverage = Get-CoberturaCoverage -ReportPath (Join-Path $pythonRoot 'coverage.xml') -NotOlderThan $startedAt
$pythonResult.tests = $pythonJUnit.tests
$pythonResult.coverage = $pythonCoverage.coverage
Add-ParsingWarning -Module $pythonResult -Warnings $pythonJUnit.warnings
Add-ParsingWarning -Module $pythonResult -Warnings $pythonCoverage.warnings
$modules.Add($pythonResult)

$frontendRoot = Join-Path $repositoryRoot 'travel-ui'
$frontendResult = Invoke-TestModule -Name 'travel-ui' -Command 'npm run test:coverage -- --json --outputFile artifacts/test-results/frontend-junit.json' -NativeReports @(
    'artifacts/test-results/frontend-junit.json',
    'travel-ui/coverage/coverage-final.json',
    'travel-ui/coverage/lcov.info'
) -Action {
    Push-Location $frontendRoot
    $previousCi = $env:CI
    try {
        $env:CI = 'true'
        npm run test:coverage -- --json --outputFile $frontendJunitPath
    }
    finally {
        $env:CI = $previousCi
        Pop-Location
    }
}
$frontendJUnit = Get-FrontendTestResults -ReportPath $frontendJunitPath -NotOlderThan $startedAt
$frontendCoverage = Get-IstanbulCoverage -ReportPath (Join-Path $frontendRoot 'coverage/coverage-final.json') -NotOlderThan $startedAt
$frontendResult.tests = $frontendJUnit.tests
$frontendResult.coverage = $frontendCoverage.coverage
Add-ParsingWarning -Module $frontendResult -Warnings $frontendJUnit.warnings
Add-ParsingWarning -Module $frontendResult -Warnings $frontendCoverage.warnings
$modules.Add($frontendResult)

$overallStatus = if (@($modules | Where-Object { $_.status -eq 'failed' }).Count -eq 0) { 'passed' } else { 'failed' }
$completedAt = Get-Date
$summary = [pscustomobject][ordered]@{
    generatedAt = $completedAt.ToUniversalTime().ToString('o')
    startedAt = $startedAt.ToUniversalTime().ToString('o')
    completedAt = $completedAt.ToUniversalTime().ToString('o')
    overallStatus = $overallStatus
    modules = @($modules)
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryPath -Encoding UTF8

$markdown = [System.Collections.Generic.List[string]]::new()
$markdown.Add('# Local Test and Coverage Summary')
$markdown.Add('')
$markdown.Add("- Started: $($summary.startedAt)")
$markdown.Add("- Completed: $($summary.completedAt)")
$markdown.Add("- Overall status: $($summary.overallStatus)")
$markdown.Add('')
$markdown.Add('| Module | Command | Status | Tests (pass/total) | Line coverage | Branch coverage | Reports | Log |')
$markdown.Add('| --- | --- | --- | ---: | ---: | ---: | --- | --- |')
foreach ($module in $modules) {
    $tests = if ($null -eq $module.tests.total) { 'unavailable' } else { "$($module.tests.passed)/$($module.tests.total)" }
    $lineCoverage = if ($null -eq $module.coverage.lines.percent) { 'unavailable' } else { "$($module.coverage.lines.percent)%" }
    $branchCoverage = if ($null -eq $module.coverage.branches.percent) { 'unavailable' } else { "$($module.coverage.branches.percent)%" }
    $reports = $module.nativeReports -join '<br>'
    $markdown.Add("| $($module.name) | ``$($module.command)`` | $($module.status) | $tests | $lineCoverage | $branchCoverage | $reports | $($module.logPath) |")
}
$markdown.Add('')
$markdown.Add('## Parsing Warnings')
$markdown.Add('')
foreach ($module in $modules) {
    foreach ($warning in $module.warnings) {
        $markdown.Add("- $($module.name): $warning")
    }
}
if (@($modules | ForEach-Object { $_.warnings }).Count -eq 0) {
    $markdown.Add('- None')
}
$markdown | Set-Content -Path $markdownPath -Encoding UTF8

Write-Host "Consolidated summary: $summaryPath"
Write-Host "Readable summary: $markdownPath"
if ($overallStatus -eq 'failed') { exit 1 }
