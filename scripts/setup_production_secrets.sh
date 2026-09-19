#!/usr/bin/env bash
# ==============================================================================
# Krishi Vishal - Production Firebase Secrets Setup Helper (Bash)
# Run this before production deployment to populate Secret Manager in Google Cloud.
# NOTE: Never commit secret values into git or configuration files!
# ==============================================================================

set -e

echo "=========================================================="
echo "   Krishi Vishal Production Cloud Secret Setup Helper     "
echo "=========================================================="
echo ""
echo "This script configures Google Cloud Secret Manager for Firebase Cloud Functions (v2)."
echo ""

declare -A SECRETS
SECRETS["RAZORPAY_KEY_SECRET"]="Razorpay API Key Secret for payment verification & refunds"
SECRETS["RAZORPAY_WEBHOOK_SECRET"]="Razorpay Webhook Secret for signature validation"
SECRETS["QR_HMAC_SECRET"]="HMAC SHA256 Secret for tamper-proof QR code generation & pickup verification"
SECRETS["CLEARTAX_AUTH_TOKEN"]="ClearTax / GSP Auth Token for GST E-Invoicing & E-Way Bills"

for SECRET_NAME in "${!SECRETS[@]}"; do
    echo "----------------------------------------------------------"
    echo "Secret: $SECRET_NAME"
    echo "Purpose: ${SECRETS[$SECRET_NAME]}"
    read -p "Do you want to set $SECRET_NAME now? (y/N): " choice
    if [[ "$choice" == "y" || "$choice" == "Y" ]]; then
        echo "Running: firebase secrets:set $SECRET_NAME"
        firebase secrets:set "$SECRET_NAME"
    else
        echo "Skipped $SECRET_NAME"
    fi
done

echo ""
echo "=========================================================="
echo "Setup finished. To view active secret names, run:"
echo "firebase secrets:access <SECRET_NAME>"
echo "=========================================================="
