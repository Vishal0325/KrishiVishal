const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../../core/admin");
const { requireAuth, requireServicemanOrPartner } = require("../security_utils");

const REGION = 'asia-south1';

/**
 * Creates a new service booking.
 */
exports.createServiceBooking = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    const farmerId = requireAuth(context);

    const { serviceId, serviceName, farmLocation, farmArea, areaUnit, scheduledSlot, amount, paymentMethod } = data;

    if (!serviceId || !farmLocation || !farmArea || !amount || !paymentMethod) {
        throw new HttpsError('invalid-argument', 'Missing required fields.');
    }

    const bookingId = db.collection("service_bookings").doc().id;
    // Generate a 4-digit OTP
    const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const endOtp = Math.floor(1000 + Math.random() * 9000).toString();

    const booking = {
        id: bookingId,
        farmerId,
        serviceId,
        serviceName,
        farmLocation,
        farmArea,
        areaUnit,
        actualArea: null,
        scheduledSlot: scheduledSlot || null,
        status: "PENDING_ASSIGNMENT",
        assignedPartnerId: null,
        assignmentAttempts: [],
        currentRadiusKm: 3, // Start with 3km
        startOtp,
        endOtp,
        startedAt: null,
        completedAt: null,
        amount,
        paymentMethod,
        paymentStatus: "PENDING",
        commissionAmount: amount * 0.15, // Default 15%
        commissionStatus: "PENDING",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("service_bookings").doc(bookingId).set(booking);

    return { bookingId, startOtp, endOtp };
});

/**
 * Triggered on new booking to start partner matching.
 */
exports.matchPartner = onDocumentCreated({ document: "service_bookings/{bookingId}", region: REGION }, async (event) => {
    const bookingSnap = event.data;
    if (!bookingSnap) return;
    
    const booking = bookingSnap.data();
    if (booking.status !== "PENDING_ASSIGNMENT") return;

    const bookingId = event.params.bookingId;
    const serviceName = booking.serviceName || "";
    
    // Determine required skill key from service name/type
    let requiredSkill = "GENERAL_LABOUR";
    if (serviceName.toLowerCase().includes("spray")) requiredSkill = "SPRAYING";
    else if (serviceName.toLowerCase().includes("kodal") || serviceName.toLowerCase().includes("dig")) requiredSkill = "KODAL_DIGGING";
    else if (serviceName.toLowerCase().includes("cut") || serviceName.toLowerCase().includes("harvest")) requiredSkill = "CROP_CUTTING";
    else if (serviceName.toLowerCase().includes("soil")) requiredSkill = "SOIL_TESTING";
    else if (serviceName.toLowerCase().includes("drone")) requiredSkill = "DRONE_SPRAY";

    console.log(`Matching partners for booking ${bookingId} with skill ${requiredSkill} at radius ${booking.currentRadiusKm || 3}km`);
    
    // Query online, non-suspended partners having requiredSkill in their serviceSkills array
    let matchingPartnerSet = new Set();
    try {
        const usersSnap = await db.collection("users")
            .where("partnerStatus", "==", "ONLINE")
            .where("isSuspended", "==", false)
            .where("serviceSkills", "array-contains", requiredSkill)
            .get();
        usersSnap.docs.forEach(doc => matchingPartnerSet.add(doc.id));

        const ridersSnap = await db.collection("riders")
            .where("isOnline", "==", true)
            .where("serviceSkills", "array-contains", requiredSkill)
            .get();
        ridersSnap.docs.forEach(doc => matchingPartnerSet.add(doc.id));

        console.log(`Found ${matchingPartnerSet.size} multi-skilled online partners for ${requiredSkill}`);
    } catch (err) {
        console.warn("Skill array search fallback:", err.message);
    }
    const matchingPartnerIds = Array.from(matchingPartnerSet);

    const outboxRef = db.collection("outbox").doc();
    await outboxRef.set({
        type: "NEW_JOB_ALERT",
        payload: {
            bookingId,
            serviceName: booking.serviceName,
            farmLocation: booking.farmLocation,
            requiredSkill,
            targetPartnerIds: matchingPartnerIds
        },
        status: "PENDING",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});


/**
 * Partner accepts a booking via transaction.
 */
exports.acceptBooking = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    const partnerId = requireServicemanOrPartner(context);

    const { bookingId } = data;
    if (!bookingId) {
        throw new HttpsError('invalid-argument', 'Missing bookingId.');
    }

    return db.runTransaction(async (tx) => {
        const bookingRef = db.collection("service_bookings").doc(bookingId);
        const bookingSnap = await tx.get(bookingRef);

        if (!bookingSnap.exists) {
            throw new HttpsError("not-found", "Booking not found");
        }

        if (bookingSnap.data().status !== "PENDING_ASSIGNMENT") {
            throw new HttpsError("failed-precondition", "Booking already assigned");
        }

        // Check if partner is suspended
        const partnerRef = db.collection("users").doc(partnerId);
        const partnerSnap = await tx.get(partnerRef);
        if (partnerSnap.exists && partnerSnap.data().isSuspended) {
            throw new HttpsError("failed-precondition", "Partner is suspended");
        }

        tx.update(bookingRef, {
            status: "ASSIGNED",
            assignedPartnerId: partnerId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(partnerRef, { partnerStatus: "ON_DUTY" });

        return { success: true };
    });
});

/**
 * Triggered when a booking is completed to deduct commission.
 */
exports.onBookingCompleted = onDocumentUpdated({ document: "service_bookings/{id}", region: REGION }, async (event) => {
    const booking = event.data.after.data();
    if (booking.status !== "COMPLETED" || booking.paymentMethod !== "CASH") return;
    if (booking.commissionStatus === "DEDUCTED") return;

    const bookingId = event.params.id;
    const idempotencyKey = `commission_${bookingId}`;

    const existing = await db.collection("idempotency_keys").doc(idempotencyKey).get();
    if (existing.exists) return;

    await db.runTransaction(async (tx) => {
        const walletRef = db.collection("partner_wallets").doc(booking.assignedPartnerId);
        const wallet = await tx.get(walletRef);
        
        let currentBalance = 0;
        let negativeLimit = -500;
        if (wallet.exists) {
            currentBalance = wallet.data().balance || 0;
            negativeLimit = wallet.data().negativeLimit ?? -500;
        }

        const newBalance = currentBalance - booking.commissionAmount;

        tx.set(walletRef, { balance: newBalance }, { merge: true });

        const txnRef = db.collection("partner_wallet_transactions").doc(idempotencyKey);
        tx.set(txnRef, {
            partnerId: booking.assignedPartnerId,
            type: "COMMISSION_DEDUCT",
            amount: booking.commissionAmount,
            bookingId: bookingId,
            idempotencyKey,
            balanceAfter: newBalance,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.set(db.collection("idempotency_keys").doc(idempotencyKey), { processedAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.update(event.data.after.ref, { commissionStatus: "DEDUCTED" });

        if (newBalance < negativeLimit) {
            tx.update(db.collection("users").doc(booking.assignedPartnerId), { isSuspended: true });
        }
    });
});

/**
 * Verifies Start OTP to start the job.
 */
exports.verifyStartOtp = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    const partnerId = requireServicemanOrPartner(context);

    const { bookingId, otp } = data;
    if (!bookingId || !otp) {
        throw new HttpsError('invalid-argument', 'Missing bookingId or OTP.');
    }

    const bookingRef = db.collection("service_bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
        throw new HttpsError('not-found', 'Booking not found.');
    }

    const booking = bookingSnap.data();
    if (booking.assignedPartnerId !== partnerId) {
        throw new HttpsError('permission-denied', 'Not assigned to this partner.');
    }

    if (booking.status !== "ASSIGNED") {
        throw new HttpsError('failed-precondition', 'Booking is not in ASSIGNED status.');
    }

    if (booking.startOtp !== String(otp).trim()) {
        throw new HttpsError('invalid-argument', 'Invalid Start OTP.');
    }

    await bookingRef.update({
        status: "IN_PROGRESS",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, status: "IN_PROGRESS" };
});

/**
 * Verifies End OTP to complete the job.
 */
exports.verifyEndOtp = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    const partnerId = requireServicemanOrPartner(context);

    const { bookingId, otp, actualArea } = data;
    if (!bookingId || !otp) {
        throw new HttpsError('invalid-argument', 'Missing bookingId or OTP.');
    }

    const bookingRef = db.collection("service_bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
        throw new HttpsError('not-found', 'Booking not found.');
    }

    const booking = bookingSnap.data();
    if (booking.assignedPartnerId !== partnerId) {
        throw new HttpsError('permission-denied', 'Not assigned to this partner.');
    }

    if (booking.status !== "IN_PROGRESS") {
        throw new HttpsError('failed-precondition', 'Booking is not IN_PROGRESS.');
    }

    if (booking.endOtp !== String(otp).trim()) {
        throw new HttpsError('invalid-argument', 'Invalid End OTP.');
    }

    const updateData = {
        status: "COMPLETED",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (actualArea) {
        updateData.actualArea = actualArea;
    }

    await bookingRef.update(updateData);

    return { success: true, status: "COMPLETED" };
});

/**
 * Partner rejects a job alert.
 */
exports.rejectBooking = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    const partnerId = requireServicemanOrPartner(context);

    const { bookingId, reason } = data;
    if (!bookingId) {
        throw new HttpsError('invalid-argument', 'Missing bookingId.');
    }

    const bookingRef = db.collection("service_bookings").doc(bookingId);
    await bookingRef.update({
        assignmentAttempts: admin.firestore.FieldValue.arrayUnion({
            partnerId,
            result: "REJECTED",
            reason: reason || null,
            respondedAt: new Date().toISOString()
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
});

/**
 * Expands radius for unassigned bookings or marks NO_PARTNER_FOUND.
 */
exports.expandRadiusOnTimeout = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };

    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'Login required.');
    }
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin or System task authorization required.');
    }

    const { bookingId } = data;

    if (!bookingId) {
        throw new HttpsError('invalid-argument', 'Missing bookingId.');
    }

    const bookingRef = db.collection("service_bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
        throw new HttpsError('not-found', 'Booking not found.');
    }

    const booking = bookingSnap.data();
    if (booking.status !== "PENDING_ASSIGNMENT") {
        return { success: false, message: "Booking already processed or assigned." };
    }

    const radiusSteps = [3, 5, 10, 15];
    const currentIdx = radiusSteps.indexOf(booking.currentRadiusKm || 3);

    if (currentIdx === -1 || currentIdx >= radiusSteps.length - 1) {
        await bookingRef.update({
            status: "NO_PARTNER_FOUND",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, status: "NO_PARTNER_FOUND" };
    }

    const nextRadius = radiusSteps[currentIdx + 1];
    await bookingRef.update({
        currentRadiusKm: nextRadius,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, currentRadiusKm: nextRadius };
});

/**
 * Recharges partner wallet and clears suspension if balance is sufficient.
 */
exports.rechargePartnerWallet = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const context = { auth: request.auth };
    const partnerId = requireAuth(context);

    const { amount, transactionId } = data;
    if (!amount || amount <= 0) {
        throw new HttpsError('invalid-argument', 'Invalid amount.');
    }

    return db.runTransaction(async (tx) => {
        const walletRef = db.collection("partner_wallets").doc(partnerId);
        const walletSnap = await tx.get(walletRef);

        let currentBalance = 0;
        let negativeLimit = -500;
        if (walletSnap.exists) {
            currentBalance = walletSnap.data().balance || 0;
            negativeLimit = walletSnap.data().negativeLimit ?? -500;
        }

        const newBalance = currentBalance + Number(amount);
        tx.set(walletRef, {
            balance: newBalance,
            lastRechargeAt: admin.firestore.FieldValue.serverTimestamp(),
            lastRechargeAmount: Number(amount)
        }, { merge: true });

        const txnId = transactionId || db.collection("partner_wallet_transactions").doc().id;
        tx.set(db.collection("partner_wallet_transactions").doc(txnId), {
            partnerId,
            type: "RECHARGE",
            amount: Number(amount),
            balanceAfter: newBalance,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (newBalance >= negativeLimit) {
            tx.update(db.collection("users").doc(partnerId), { isSuspended: false });
        }

        return { success: true, newBalance };
    });
});

