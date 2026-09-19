const { defineSecret, defineString } = require("firebase-functions/params");

const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecret = defineSecret("RAZORPAY_WEBHOOK_SECRET");
const qrHmacSecret = defineSecret("QR_HMAC_SECRET");
const cleartaxAuthToken = defineSecret("CLEARTAX_AUTH_TOKEN");

const razorpayKeyId = defineString("RAZORPAY_KEY_ID", { default: "" });
const storeGstin = defineString("STORE_GSTIN", { default: "" });

function getSecretVal(secretParam, envName) {
    try {
        if (secretParam && typeof secretParam.value === 'function') {
            const val = secretParam.value();
            if (val) return val;
        }
    } catch (e) {
        // Fallback when running outside Firebase runtime in unit tests
    }
    const isEmulatorOrTest = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test';
    if (!isEmulatorOrTest) {
        throw new Error(`Secret ${envName} is missing or undefined in production environment.`);
    }
    return process.env[envName] || "";
}

module.exports = {
    razorpayKeySecret,
    razorpayWebhookSecret,
    qrHmacSecret,
    cleartaxAuthToken,
    razorpayKeyId,
    storeGstin,
    getSecretVal
};
