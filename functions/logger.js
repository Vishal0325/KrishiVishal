const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.addSecureAuditLog = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth, rawRequest: request.rawRequest };
  
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated to create an audit log.");
  }

  const { action, module, entityId, details } = data;
  if (!action || !module || !entityId) {
    throw new HttpsError("invalid-argument", "Missing required fields (action, module, entityId).");
  }

  const actorId = context.auth.uid;
  // Get IP address from rawRequest if available, else from headers
  const ipAddress = context.rawRequest ? context.rawRequest.ip : request.rawRequest?.ip || "Unknown IP";

  const db = admin.firestore();
  try {
    await db.collection("audit_logs").add({
      action,
      module,
      entityId,
      details: details || {},
      actorId,
      ipAddress,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userRole: context.auth.token.role || "Unknown",
    });
    return { success: true };
  } catch (error) {
    console.error("Error creating audit log:", error);
    throw new HttpsError("internal", error.message);
  }
});
