/**
 * cropCycleMarketingEngine.js
 * Crop Stage Query & Marketing Engine for KrishiVishal CRM and Tele-calling.
 * Allows filtering farmers based on exact crop days elapsed and automated agronomy pitch generation.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db } = require("../core/admin");
const { normalizeToAcres, calculateDaysElapsed, formatLandWithAcres } = require("../agronomy/landUnitConverter");

const REGION = 'asia-south1';

const ALLOWED_CRM_ROLES = [
  'telecaller',
  'kisancallcenter',
  'supportagent',
  'crmexecutive',
  'hubmanager',
  'admin',
  'superadmin',
  'ordermanager',
  'operationsadmin',
  'viewer'
];

/**
 * Validates caller role for CRM/telecalling agronomy queries.
 */
function requireCrmOrAdminRole(auth) {
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const token = auth.token || {};
  const role = (token.role || '').toLowerCase();
  const isAuthorized = token.admin === true ||
    token.isAdmin === true ||
    token.isSuperAdmin === true ||
    ALLOWED_CRM_ROLES.includes(role);

  if (!isAuthorized) {
    throw new HttpsError('permission-denied', 'Caller lacks required CRM or Admin role.');
  }
}

/**
 * Derives crop stage and recommended agronomy action based on days elapsed.
 * @param {string} cropName
 * @param {number} daysElapsed
 * @returns {{ currentStage: string, recommendedAction: string }}
 */
function getCropStageAndAction(cropName, daysElapsed) {
  const lower = (cropName || '').toLowerCase();
  const days = Math.max(0, Number(daysElapsed) || 0);

  if (lower.includes('dhan') || lower.includes('paddy') || lower.includes('धान')) {
    if (days <= 20) {
      return {
        currentStage: "EARLY_VEGETATIVE_WEED",
        recommendedAction: "Nirayi-gudayi (weed management) aur Bispyribac-sodium ya Pretilachlor application."
      };
    } else if (days <= 45) {
      return {
        currentStage: "VEGETATIVE_TILLERING",
        recommendedAction: "Urea top-dressing aur stem borer / leaf folder ke liye Chlorantraniliprole / Cartap spray."
      };
    } else if (days <= 75) {
      return {
        currentStage: "FLOWERING_PANICLE",
        recommendedAction: "Sheath blight & blast roktham hetu Propiconazole spray aur NPK 0:52:34 spray."
      };
    } else {
      return {
        currentStage: "GRAIN_FILLING_MATURITY",
        recommendedAction: "Dhan pakaav stage: NPK 0:0:50 spray aur harvesting schedule plan karein."
      };
    }
  }

  if (lower.includes('makka') || lower.includes('maize') || lower.includes('मक्का')) {
    if (days <= 20) {
      return {
        currentStage: "SEEDLING_EMERGENCE",
        recommendedAction: "Fall Armyworm (FAW) monitoring aur Atrazine weed spray."
      };
    } else if (days <= 45) {
      return {
        currentStage: "VEGETATIVE_KNEE_HIGH",
        recommendedAction: "Knee-high stage: Urea top-dressing aur Emamectin Benzoate FAW control."
      };
    } else {
      return {
        currentStage: "TASSELING_SILKING",
        recommendedAction: "Silking & grain development: Adequate moisture aur Potash nutrition."
      };
    }
  }

  // Generic fallback for other crops (Wheat, Potato, Mustard, Veggies)
  if (days <= 20) {
    return {
      currentStage: "EARLY_VEGETATIVE_WEED",
      recommendedAction: "Kharpatwar (weed) control aur initial root booster spray."
    };
  } else if (days <= 45) {
    return {
      currentStage: "VEGETATIVE_TILLERING",
      recommendedAction: "Urea top-dressing aur kit-rog (pest/disease) surveillance spray."
    };
  } else if (days <= 75) {
    return {
      currentStage: "FLOWERING_DEVELOPMENT",
      recommendedAction: "Phool va phal vikas: Micronutrients aur NPK spray."
    };
  } else {
    return {
      currentStage: "MATURITY_HARVEST",
      recommendedAction: "Fasal pakaav stage: Harvest planning aur storage preparation."
    };
  }
}

/**
 * Pure helper to filter a single farmer record against query parameters.
 * @param {object} farmerDoc - User document data
 * @param {string} farmerId - User doc id
 * @param {object} params - { hubId, cropName, minDays, maxDays, nowReference }
 * @returns {object|null} Formatted matched record or null
 */
function evaluateFarmerCropAllocation(farmerDoc, farmerId, params = {}) {
  const { hubId, cropName, minDays = 0, maxDays = 9999, nowReference = Date.now() } = params;

  if (hubId && farmerDoc.hubId && farmerDoc.hubId !== hubId && farmerDoc.hub_id !== hubId) {
    return null;
  }

  const allocations = Array.isArray(farmerDoc.cropAllocations) ? farmerDoc.cropAllocations : [];
  if (allocations.length === 0) return null;

  for (const crop of allocations) {
    // Check cropName filter if provided
    if (cropName && cropName.trim() !== '') {
      const target = cropName.toLowerCase().replace(/[\s\(\)]/g, '');
      const actual = (crop.cropName || '').toLowerCase().replace(/[\s\(\)]/g, '');
      if (!actual.includes(target) && !target.includes(actual)) {
        continue;
      }
    }

    // Determine daysElapsed from sowingDate (or fallback from month)
    let daysElapsed = 0;
    if (crop.sowingDate) {
      daysElapsed = calculateDaysElapsed(crop.sowingDate, nowReference);
    } else if (crop.sowingMonth) {
      // Rough approximation if sowingDate was not set
      daysElapsed = 30;
    }

    if (daysElapsed >= minDays && daysElapsed <= maxDays) {
      const { currentStage, recommendedAction } = getCropStageAndAction(crop.cropName, daysElapsed);
      const totalLandStr = formatLandWithAcres(farmerDoc.totalLand || 0, farmerDoc.landUnit || 'Katha');

      return {
        farmerId: farmerId || farmerDoc.uid || '',
        name: farmerDoc.name || farmerDoc.displayName || 'Kisan Mitr',
        phone: farmerDoc.phone || farmerDoc.phoneNumber || '',
        village: farmerDoc.village || farmerDoc.district || '',
        hubId: farmerDoc.hubId || farmerDoc.hub_id || '',
        totalLand: totalLandStr,
        matchedCrop: {
          cropName: crop.cropName || '',
          area: `${crop.allocatedArea || 0} ${crop.unit || 'Katha'}`,
          daysElapsed: daysElapsed,
          sowingDate: crop.sowingDate || null,
          plotName: crop.plotName || 'खेत 1',
          currentStage: currentStage,
          recommendedAction: recommendedAction
        }
      };
    }
  }

  return null;
}

/**
 * Callable Function: getFarmersByCropStage
 * Fetches farmers with crops matching the specified lifecycle stage window.
 */
const getFarmersByCropStage = onCall({ region: REGION }, async (request) => {
  requireCrmOrAdminRole(request.auth);

  const { hubId, cropName, minDays = 0, maxDays = 9999 } = request.data || {};

  try {
    let queryRef = db.collection('users');

    if (hubId) {
      queryRef = queryRef.where('hubId', '==', hubId);
    }

    const snapshot = await queryRef.limit(200).get();
    const results = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const match = evaluateFarmerCropAllocation(data, doc.id, {
        hubId,
        cropName,
        minDays: Number(minDays) || 0,
        maxDays: Number(maxDays) || 9999,
        nowReference: Date.now()
      });

      if (match) {
        results.push(match);
      }
    });

    return {
      success: true,
      count: results.length,
      farmers: results
    };
  } catch (error) {
    console.error('Error in getFarmersByCropStage:', error);
    throw new HttpsError('internal', error.message || 'Failed to query crop stages.');
  }
});

module.exports = {
  getFarmersByCropStage,
  getCropStageAndAction,
  evaluateFarmerCropAllocation,
  requireCrmOrAdminRole,
};
