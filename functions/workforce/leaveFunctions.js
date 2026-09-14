const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

/**
 * [FIXED] Point #153: Secure leave application via Cloud Function.
 * Performs duration calculation on the server to prevent client-side date manipulation.
 */
exports.applyLeave = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Unauthorized.');
  }

  const { employeeId, employeeName, department, leaveType, startDate, endDate, isHalfDay, reason } = data;
  if (!employeeId || !startDate || !leaveType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
  }

  const db = admin.firestore();
  const leaveId = `LV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const docRef = db.collection('leave_requests').doc(leaveId);

  try {
    // 1. Calculate duration on server
    const start = new Date(startDate);
    const end = new Date(endDate || startDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid date format.');
    }

    if (end.getTime() < start.getTime()) {
      throw new functions.https.HttpsError('invalid-argument', 'End date cannot be earlier than start date.');
    }

    // Simple day difference
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

    const daysCount = isHalfDay ? 0.5 : diffDays;

    const payload = {
      employeeId,
      employeeName,
      department,
      leaveType,
      startDate,
      endDate: endDate || startDate,
      isHalfDay: !!isHalfDay,
      daysCount,
      reason: reason || '',
      status: "PENDING",
      appliedBy: context.auth.token.email || context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(payload);

    // Audit Log
    const auditRef = db.collection('audit_logs').doc();
    await auditRef.set({
      action: 'APPLY_LEAVE',
      resource: 'LeaveRequest',
      resourceId: leaveId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: { employeeName, leaveType, daysCount }
    });

    return { success: true, leaveId, daysCount };
  } catch (error) {
    console.error('Apply Leave Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});
