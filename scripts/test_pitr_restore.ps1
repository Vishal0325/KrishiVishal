<#
.SYNOPSIS
    Automated Firestore PITR Backup & Test Restore Verification Script for KrishiVishal
.DESCRIPTION
    Verifies Point-in-Time Recovery readiness by cloning the (default) database snapshot to a temporary database (pitr-test-restore), validating completion, and enforcing guaranteed cleanup via try/finally.
.PARAMETER RecoveryPoint
    Optional recovery timestamp in ISO 8601 UTC format (e.g. 2026-10-01T15:00:00.00Z). Defaults to 1 hour ago.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory=$false)]
    [string]$RecoveryPoint
)

$ErrorActionPreference = "Continue"

$PROJECT_ID = "krishivishal-a9ed7"
$SOURCE_DB = "(default)"
$TARGET_DB = "pitr-test-restore"
$dbCreatedOrAttempted = $false

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " FIRESTORE PITR TEST RESTORE VERIFICATION ($PROJECT_ID) " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[NOTICE] Yeh script cloud par temporary instance ('$TARGET_DB') banati hai, yeh offline mock nahi hai." -ForegroundColor Yellow

# 1. Check gcloud CLI
Write-Host "`n[1/5] Checking gcloud CLI environment..." -ForegroundColor Yellow
$null = gcloud --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "gcloud CLI is not installed or not in PATH."
    exit 1
}
Write-Host "gcloud CLI available." -ForegroundColor Green

# 2. Get Database details & PITR status
Write-Host "`n[2/5] Fetching PITR configuration for ${SOURCE_DB}..." -ForegroundColor Yellow
$dbDetailsJson = gcloud firestore databases describe --database=$SOURCE_DB --project=$PROJECT_ID --format="json" 2>$null | Out-String

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($dbDetailsJson)) {
    Write-Error "Failed to describe database ${SOURCE_DB}."
    exit 1
}

$dbDetails = $dbDetailsJson | ConvertFrom-Json
$pitrStatus = $dbDetails.pointInTimeRecoveryEnablement
$earliestVersionTimeStr = $dbDetails.earliestVersionTime

Write-Host "PITR Enablement Status: $pitrStatus" -ForegroundColor Green
Write-Host "Earliest Version Time: $earliestVersionTimeStr" -ForegroundColor Green

if ($pitrStatus -ne "POINT_IN_TIME_RECOVERY_ENABLED") {
    Write-Error "PITR is NOT enabled for database ${SOURCE_DB}!"
    exit 1
}

# 3. Determine and Validate Recovery Point
Write-Host "`n[3/5] Validating recovery point timestamp..." -ForegroundColor Yellow
if ([string]::IsNullOrWhiteSpace($RecoveryPoint)) {
    # Default to 1 hour ago in UTC (rounded to minute for snapshot-time requirements)
    $utcNow = [DateTime]::UtcNow.AddHours(-1)
    $RecoveryPoint = (Get-Date $utcNow -Format "yyyy-MM-ddTHH:mm:00.00Z")
    Write-Host "No timestamp provided. Defaulting to 1 hour ago: $RecoveryPoint" -ForegroundColor Yellow
} else {
    Write-Host "Target Recovery Point: $RecoveryPoint" -ForegroundColor Green
}

$targetTime = [DateTime]::Parse($RecoveryPoint).ToUniversalTime()
$earliestTime = [DateTime]::Parse($earliestVersionTimeStr).ToUniversalTime()

if ($targetTime -lt $earliestTime) {
    Write-Error "Target recovery time ($targetTime) is older than earliestVersionTime ($earliestTime)."
    exit 1
}

# 4. Main Restore & Polling Logic wrapped in Try / Finally for Guaranteed Cleanup
try {
    Write-Host "`n[4/5] Restoring PITR snapshot to temporary database '$TARGET_DB'..." -ForegroundColor Yellow
    Write-Host "Executing gcloud firestore databases clone..." -ForegroundColor Gray

    $sourceDbPath = "projects/${PROJECT_ID}/databases/${SOURCE_DB}"
    $dbCreatedOrAttempted = $true

    $restoreOutput = gcloud firestore databases clone `
      --source-database=$sourceDbPath `
      --destination-database=$TARGET_DB `
      --snapshot-time=$RecoveryPoint `
      --project=$PROJECT_ID 2>&1 | Out-String

    if ($LASTEXITCODE -ne 0) {
        Write-Error "gcloud firestore databases clone failed with exit code $LASTEXITCODE:`n$restoreOutput"
        throw "Clone command execution failed."
    }

    Write-Host "Restore operation triggered:" -ForegroundColor Green
    Write-Host $restoreOutput

    # Wait & Monitor LRO
    Write-Host "Monitoring database restoration status..." -ForegroundColor Yellow
    $maxAttempts = 36
    $attempt = 0
    $restoredSuccess = $false

    while ($attempt -lt $maxAttempts) {
        Start-Sleep -Seconds 5
        $attempt++
        $dbJson = gcloud firestore databases describe --database=$TARGET_DB --project=$PROJECT_ID --format="json" 2>$null | Out-String
        if (-not [string]::IsNullOrWhiteSpace($dbJson)) {
            $dbObj = $dbJson | ConvertFrom-Json
            $progress = $dbObj.sourceInfo.progress
            if ([string]::IsNullOrWhiteSpace($progress) -or $progress -eq "COMPLETED") {
                Write-Host "Database '$TARGET_DB' restore operation completed successfully!" -ForegroundColor Green
                $restoredSuccess = $true
                break
            }
        }
        Write-Host "Waiting for clone operation to complete... (Attempt $attempt/$maxAttempts)" -ForegroundColor Gray
    }

    if (-not $restoredSuccess) {
        throw "Restore operation timed out or failed to complete for target database $TARGET_DB."
    }

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host " PITR TEST RESTORE VERIFICATION PASSED SUCCESSFULLY! " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green

} catch {
    Write-Error "Error occurred during PITR test restore: $_"
} finally {
    # 5. Guaranteed Cleanup in Finally block
    Write-Host "`n[5/5] [CLEANUP] Ensuring temporary database '$TARGET_DB' is deleted..." -ForegroundColor Yellow

    if ($dbCreatedOrAttempted) {
        $deleted = $false
        for ($cleanupAttempt = 1; $cleanupAttempt -le 12; $cleanupAttempt++) {
            # Check if database exists
            $checkJson = gcloud firestore databases describe --database=$TARGET_DB --project=$PROJECT_ID --format="json" 2>$null | Out-String
            if ([string]::IsNullOrWhiteSpace($checkJson)) {
                Write-Host "Database '$TARGET_DB' is not present or already deleted." -ForegroundColor Green
                $deleted = $true
                break
            }

            Write-Host "Attempting deletion of '$TARGET_DB' (Attempt $cleanupAttempt/12)..." -ForegroundColor Gray
            $deleteOutput = gcloud firestore databases delete --database=$TARGET_DB --project=$PROJECT_ID --quiet 2>&1 | Out-String

            if ($LASTEXITCODE -eq 0) {
                Write-Host "Temporary database '$TARGET_DB' successfully deleted." -ForegroundColor Green
                $deleted = $true
                break
            } else {
                Write-Host "Deletion pending (operation in progress or locking database). Waiting 10s before retry..." -ForegroundColor Gray
                Start-Sleep -Seconds 10
            }
        }

        if (-not $deleted) {
            Write-Warning "Could not immediately delete '$TARGET_DB'. Please run manually:`ngcloud firestore databases delete --database=$TARGET_DB --project=$PROJECT_ID --quiet"
        }
    } else {
        Write-Host "No clone operation was attempted; no cleanup required." -ForegroundColor Gray
    }

    # Final Confirmation
    Write-Host "`nConfirming active database list:" -ForegroundColor Yellow
    gcloud firestore databases list --project=$PROJECT_ID --format="table(name,type,locationId,pointInTimeRecoveryEnablement)"
}
