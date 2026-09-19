# ==============================================================================
# Krishi Vishal - Production Firebase Secrets Setup Helper (PowerShell)
# Run this before production deployment to populate Secret Manager in Google Cloud.
# NOTE: Never commit secret values into git or configuration files!
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Krishi Vishal Production Cloud Secret Setup Helper     " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script configures Google Cloud Secret Manager for Firebase Cloud Functions (v2)."
Write-Host ""

$secrets = @(
    @{ Name = "RAZORPAY_KEY_SECRET"; Description = "Razorpay API Key Secret for payment verification & refunds" },
    @{ Name = "RAZORPAY_WEBHOOK_SECRET"; Description = "Razorpay Webhook Secret for signature validation" },
    @{ Name = "QR_HMAC_SECRET"; Description = "HMAC SHA256 Secret for tamper-proof QR code generation & pickup verification" },
    @{ Name = "CLEARTAX_AUTH_TOKEN"; Description = "ClearTax / GSP Auth Token for GST E-Invoicing & E-Way Bills" }
)

foreach ($sec in $secrets) {
    Write-Host "----------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "Secret: $($sec.Name)" -ForegroundColor White
    Write-Host "Purpose: $($sec.Description)" -ForegroundColor Gray
    Write-Host ""
    $choice = Read-Host "Do you want to set $($sec.Name) now? (y/N)"
    if ($choice -eq 'y' -or $choice -eq 'Y') {
        Write-Host "Running: firebase secrets:set $($sec.Name)" -ForegroundColor Cyan
        firebase secrets:set $($sec.Name)
    } else {
        Write-Host "Skipped $($sec.Name)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Setup finished. To view active secret names, run:" -ForegroundColor Green
Write-Host "firebase secrets:access <SECRET_NAME>" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
