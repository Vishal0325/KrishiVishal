const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

exports.createStaffMember = functions.https.onCall(async (data, context) => {
  // 1. Verify Caller is Admin
  const callerIsAdmin = context.auth && (context.auth.token.isAdmin === true || context.auth.token.admin === true);
  const callerRole = context.auth?.token?.role;
  if (!context.auth || !callerIsAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can create new staff members.'
    );
  }

  const { email, password, name, role } = data;

  if (role === 'SuperAdmin' && callerRole !== 'SuperAdmin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only existing SuperAdmin can create a SuperAdmin account.'
    );
  }

  if (!email || !password || !name || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields.'
    );
  }

  try {
    // 2. Create User in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // 3. Role-to-Claims Matrix (Zero Blanket Admin Claims)
    const adminRoles = ['SuperAdmin', 'Admin'];
    const isFullAdmin = adminRoles.includes(role);
    const isSuper = role === 'SuperAdmin';

    const customClaims = {
      role: role,
      isAdmin: isFullAdmin,       // TRUE sirf SuperAdmin / Admin ke liye
      admin: isFullAdmin,         // Legacy backward-compatibility
      isStaff: true,              // Portal entry gatekeeper
      isActive: true,
    };

    if (isSuper) {
      customClaims.isSuperAdmin = true;
      customClaims.hubAccess = 'ALL';
    } else if (['FinanceAdmin', 'DepartmentManager', 'Viewer'].includes(role)) {
      customClaims.hubAccess = data.hubAccess || 'ALL';
    } else if (data.hubId) {
      customClaims.hubId = data.hubId;
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);

    // 4. Save to Firestore with matching least-privilege schema
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      name: name,
      role: role,
      isAdmin: isFullAdmin,       // Firestore doc matches Auth claim
      isStaff: true,
      isActive: true,
      hubAccess: customClaims.hubAccess || null,
      hubId: customClaims.hubId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, uid: userRecord.uid };
  } catch (error) {
    console.error('Error in createStaffMember:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * [FIXED] Point #93: Server-side sequential ID generation to prevent hot-spotting and client-side time issues.
 */
exports.generateWorkforceId = functions.https.onCall(async (data, context) => {
  const callerIsAdmin = context.auth && (context.auth.token.isAdmin === true || context.auth.token.admin === true || ['SuperAdmin', 'HRAdmin', 'Admin'].includes(context.auth.token.role));
  if (!context.auth || !callerIsAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized.');
  }

  const type = data.type || 'EMP';
  const db = admin.firestore();
  const counterRef = db.collection('system_counters').doc(`workforce_${type.toLowerCase()}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let currentSeq = 0;
      if (counterDoc.exists) {
        currentSeq = counterDoc.data().seq || 0;
      }
      const nextSeq = currentSeq + 1;
      transaction.set(counterRef, { seq: nextSeq }, { merge: true });

      const formattedSeq = String(nextSeq).padStart(6, '0');
      return `KV-${type}-${formattedSeq}`;
    });

    return { workforceId: result };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'ID generation failed');
  }
});

/**
 * [FIXED] Point #107: Server-side user search to prevent full user collection exposure to client.
 */
exports.searchUsers = functions.https.onCall(async (data, context) => {
  const callerIsAdmin = context.auth && (context.auth.token.isAdmin === true || context.auth.token.admin === true || ['SuperAdmin', 'HRAdmin', 'Admin'].includes(context.auth.token.role));
  if (!context.auth || !callerIsAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized.');
  }

  const { query: searchQuery, type } = data;
  if (!searchQuery || searchQuery.length < 3) return { users: [] };

  const db = admin.firestore();
  try {
    // [FIXED] Point #107 & #145: Enhanced search to support both name and phone
    // while preventing full collection scans.
    let q;
    if (/^\d+$/.test(searchQuery)) {
      // It's a phone number search
      q = db.collection('users').where('phone', '==', searchQuery).limit(10);
    } else {
      // It's a name search
      q = db.collection('users')
        .where('name', '>=', searchQuery)
        .where('name', '<=', searchQuery + '\uf8ff')
        .limit(10);
    }

    if (type === 'RIDER') {
      q = q.where('role', '==', 'Rider');
    } else if (type === 'STAFF') {
      q = q.where('isAdmin', '==', true);
    } else if (type === 'CUSTOMER') {
      q = q.where('isAdmin', '==', false);
    }

    const snap = await q.get();
    const users = snap.docs.map(d => {
      const u = d.data();
      return {
        id: d.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        district: u.district,
        state: u.state
      };
    });

    return { users };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Search failed');
  }
});
