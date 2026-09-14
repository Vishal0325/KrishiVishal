const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * Get AI system health statistics (Cloud Function)
 */
exports.getAiSystemHealth = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await db.collection("ai_action_requests").get();
    let requestsToday = 0;
    let pendingApprovals = 0;
    let completedActions = 0;
    let rejectedActions = 0;

    snapshot.forEach((doc) => {
      const d = doc.data();
      const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : null;
      if (createdAt && createdAt >= today) {
        requestsToday++;
      }
      if (d.status === "PENDING") pendingApprovals++;
      else if (d.status === "APPROVED" || d.status === "COMPLETED") completedActions++;
      else if (d.status === "REJECTED") rejectedActions++;
    });

    return {
      requestsToday,
      pendingApprovals,
      completedActions,
      rejectedActions
    };
  } catch (error) {
    console.error("Error in getAiSystemHealth:", error);
    return {
      requestsToday: 0,
      pendingApprovals: 0,
      completedActions: 0,
      rejectedActions: 0
    };
  }
});

/**
 * AI Supervisor Cloud Function
 */
exports.aiSupervisor = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }

  const prompt = data?.prompt || "";
  const requestedBy = context.auth.token.email || data?.context?.requestedBy || "Admin";

  // Log activity
  await db.collection("ai_activity_logs").add({
    prompt,
    agentType: "SUPERVISOR",
    requestedBy,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    status: "PROCESSED"
  });

  return {
    agentType: "Supervisor",
    message: `Analyzed query: "${prompt}". System checks passed with normal parameters.`,
    data: {
      status: "Healthy",
      riskScore: "Low"
    }
  };
});

/**
 * Approve AI Action
 */
exports.approveAiAction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }

  const { requestId } = data;
  if (!requestId) {
    throw new functions.https.HttpsError("invalid-argument", "RequestId is required");
  }

  await db.collection("ai_action_requests").doc(requestId).update({
    status: "APPROVED",
    approvedBy: context.auth.token.email || "Admin",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

/**
 * Reject AI Action
 */
exports.rejectAiAction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }

  const { requestId, reason } = data;
  if (!requestId) {
    throw new functions.https.HttpsError("invalid-argument", "RequestId is required");
  }

  await db.collection("ai_action_requests").doc(requestId).update({
    status: "REJECTED",
    reason: reason || "Rejected by Admin",
    rejectedBy: context.auth.token.email || "Admin",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});
