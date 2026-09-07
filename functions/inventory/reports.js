const functions = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * Generates an inventory report.
 * Optionally filter by warehouseId.
 */
exports.getInventoryReport = onCall(async (request) => {
  const data = request.data;
  const context = { auth: request.auth };
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Unauthorized.");
  }

  const { warehouseId } = data;
  const db = admin.firestore();

  try {
    let query = db.collection("warehouse_inventory");
    
    if (warehouseId) {
      query = query.where("warehouseId", "==", warehouseId);
    }

    const snapshot = await query.get();
    
    const items = [];
    let totalQty = 0;
    let totalValue = 0;

    snapshot.forEach((doc) => {
      const d = doc.data();
      items.push({
        id: doc.id,
        ...d
      });
      totalQty += (d.availableQty || 0);
      totalValue += (d.availableQty || 0) * (d.unitCost || 0);
    });

    return {
      success: true,
      data: {
        totalItems: items.length,
        totalQty,
        totalValue,
        items
      }
    };
  } catch (error) {
    console.error("Error fetching inventory report:", error);
    throw new HttpsError("internal", error.message);
  }
});
