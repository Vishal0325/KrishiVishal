const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Ensure db is available
const db = admin.firestore();

/**
 * Triggers when a new Notification is added to Firestore (e.g. from Expiry Cron).
 * Checks the App Settings for enabled integrations and pushes the notification to
 * WhatsApp or Email via 3rd-party APIs.
 */
exports.sendAutomatedNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    
    // 1. Fetch Global Settings
    const settingsDoc = await db.collection('settings').doc('config').get();
    if (!settingsDoc.exists) {
      console.log('Settings not found, skipping external notification');
      return null;
    }
    
    const settings = settingsDoc.data();
    const severity = data.severity || 'LOW';

    // Only send HIGH or MEDIUM severity to external providers to save cost
    if (severity !== 'HIGH' && severity !== 'MEDIUM') {
      return null;
    }

    try {
      // Fetch target user info
      let targetPhone = null;
      let targetEmail = null;

      if (data.ownerId) {
        const userDoc = await db.collection('users').doc(data.ownerId).get();
        if (userDoc.exists) {
          targetPhone = userDoc.data().phoneNumber;
          targetEmail = userDoc.data().email;
        }
      }

      // Default to Admin Alert WhatsApp if user has no phone or if it's an admin-level alert
      if (!targetPhone && settings.adminAlertWhatsApp) {
        targetPhone = settings.adminAlertWhatsApp;
      }

      // --- SEND WHATSAPP ---
      if (targetPhone && settings.whatsappApiKey) {
        console.log(`Sending WhatsApp to ${targetPhone} via ${settings.whatsappProvider}: ${data.title}`);
        
        // [FIXED] Point #55: Enabled live external notifications (requires valid API keys in settings)
        if (settings.whatsappProvider === 'GENERIC_WEBHOOK' && settings.whatsappEndpointUrl) {
          const axios = require('axios');
          await axios.post(settings.whatsappEndpointUrl, {
            to: targetPhone,
            text: data.message
          }, {
            headers: { 'Authorization': `Bearer ${settings.whatsappApiKey}` }
          });
        }
      }

      // --- SEND EMAIL ---
      if (targetEmail && settings.emailApiKey) {
        console.log(`Sending Email to ${targetEmail} via ${settings.emailProvider}: ${data.title}`);
        
        if (settings.emailProvider === 'SENDGRID') {
          const axios = require('axios');
          await axios.post('https://api.sendgrid.com/v3/mail/send', {
            personalizations: [{ to: [{ email: targetEmail }] }],
            from: { email: settings.supportEmail || 'noreply@krishivishal.com' },
            subject: data.title,
            content: [{ type: 'text/plain', value: data.message }]
          }, {
            headers: {
              'Authorization': `Bearer ${settings.emailApiKey}`,
              'Content-Type': 'application/json'
            }
          });
        }
      }
      
      // Update notification as processed
      await snap.ref.update({
        processedForExternal: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error sending external notification:', error);
      return null;
    }
  });
