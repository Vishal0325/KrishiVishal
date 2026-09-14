# KrishiVishal — Certificate Pin Generator
# Run this script to generate SHA-256 certificate pins for HTTPS pinning.
# Output the pins and add them to gradle.properties (gitignored).
#
# USAGE: .\scripts\generate_cert_pins.ps1
# REQUIRES: OpenSSL installed (or use Git Bash / WSL)
#
# STEP 1: Run this script
# STEP 2: Copy the output pins to gradle.properties:
#   PIN_FIRESTORE_PRIMARY=sha256/XXXXXXXX
#   PIN_FIRESTORE_BACKUP=sha256/YYYYYYYY
#   PIN_STORAGE_PRIMARY=sha256/AAAAAAAA
#   PIN_STORAGE_BACKUP=sha256/BBBBBBBB
# STEP 3: gradle.properties is gitignored — NEVER commit it

$domains = @(
    "firestore.googleapis.com",
    "firebasestorage.googleapis.com"
)

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " KrishiVishal Certificate Pin Generator" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTE: This uses OpenSSL. Make sure it is installed." -ForegroundColor Yellow
Write-Host "On Windows: Install via Git (includes OpenSSL) or chocolatey: choco install openssl" -ForegroundColor Yellow
Write-Host ""

foreach ($domain in $domains) {
    Write-Host "Fetching certificate pins for: $domain" -ForegroundColor Green
    
    $certCmd = "openssl s_client -connect ${domain}:443 -servername $domain"
    Write-Host "Command: $certCmd" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Run this in bash/WSL/Git Bash for Leaf Cert:" -ForegroundColor Yellow
    Write-Host "echo | openssl s_client -connect ${domain}:443 -servername $domain 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64" -ForegroundColor White
    Write-Host ""
    Write-Host "Intermediate / Backup Cert Pin:" -ForegroundColor Yellow  
    Write-Host "echo | openssl s_client -connect ${domain}:443 -servername $domain -showcerts 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64" -ForegroundColor White
    Write-Host "" 
    Write-Host "----------------------------------------------------" -ForegroundColor Gray
}

Write-Host ""
Write-Host "AFTER generating pins, add to gradle.properties (root):" -ForegroundColor Cyan
Write-Host "PIN_FIRESTORE_PRIMARY=sha256/<paste-primary-pin>" -ForegroundColor White
Write-Host "PIN_FIRESTORE_BACKUP=sha256/<paste-backup-pin>" -ForegroundColor White
Write-Host "PIN_STORAGE_PRIMARY=sha256/<paste-primary-pin>" -ForegroundColor White
Write-Host "PIN_STORAGE_BACKUP=sha256/<paste-backup-pin>" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: gradle.properties is in .gitignore — NEVER commit sensitive data!" -ForegroundColor Red
