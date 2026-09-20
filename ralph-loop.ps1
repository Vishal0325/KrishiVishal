param (
    [string] = "Run tests and fix errors until all pass"
)

Write-Host "Starting Ralph Loop..." -ForegroundColor Green
$MaxIterations = 10
$Iteration = 1

while ($Iteration -le $MaxIterations) {
    Write-Host "--- Iteration $Iteration ---" -ForegroundColor Cyan
    
    # 1. Run tests (replace with actual test command, e.g., ./gradlew test)
    Write-Host "Running tests to check current state..."
    # $TestResult = Invoke-Expression "./gradlew test"
    # if ($LASTEXITCODE -eq 0) {
    #     Write-Host "All tests passed! Task complete." -ForegroundColor Green
    #     break
    # }

    # 2. If tests fail, run the AI agent (e.g., Claude Code, Cursor, or agy) with fresh context
    Write-Host "Tests failed or incomplete. Triggering AI agent with task: $Task"
    # Example: agy --task "$Task. Review the recent test failures and fix the code."
    
    Write-Host "Agent finished this iteration. Re-evaluating..."
    
    $Iteration++
}

if ($Iteration -gt $MaxIterations) {
    Write-Host "Ralph Loop stopped: Reached max iterations ($MaxIterations)." -ForegroundColor Yellow
}
