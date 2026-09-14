import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  updateDoc, 
  deleteDoc,
  runTransaction,
  writeBatch 
} from "firebase/firestore";
import { db, auth } from "../firebase/config";
import { addAuditLog } from "./logger";

// ==========================================
// 1. PHYSICAL FILES MANAGEMENT
// ==========================================

export async function getPhysicalFiles(filters = {}) {
  try {
    let q = query(collection(db, "physical_files"), orderBy("createdAt", "desc"));
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching physical files:", error);
    throw error;
  }
}

export async function createPhysicalFile(fileData) {
  try {
    const user = auth.currentUser;
    // [FIXED] Point #128: Using larger random string to prevent ID collisions
    const fileId = fileData.fileCode || `FILE-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const docRef = doc(db, "physical_files", fileId);

    const payload = {
      ...fileData,
      fileId,
      status: fileData.status || "IN_STORAGE", // IN_STORAGE, CHECKED_OUT, IN_TRANSIT, ARCHIVED
      checkoutHistory: [],
      createdBy: user?.email || "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);
    await addAuditLog("CREATE_PHYSICAL_FILE", "PhysicalFile", fileId, { fileCode: fileId, ownerName: fileData.ownerName });
    return fileId;
  } catch (error) {
    console.error("Error creating physical file record:", error);
    throw error;
  }
}

export async function updatePhysicalFile(fileId, updates) {
  try {
    const docRef = doc(db, "physical_files", fileId);
    const payload = { ...updates, updatedAt: serverTimestamp() };
    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_PHYSICAL_FILE", "PhysicalFile", fileId, { updates });
    return true;
  } catch (error) {
    console.error("Error updating physical file:", error);
    throw error;
  }
}

export async function checkoutPhysicalFile(fileId, checkoutData) {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "physical_files", fileId);
    const docSnap = await getDoc(docRef);

    const historyRef = collection(db, "physical_files", fileId, "checkout_history");
    const historyEntry = {
      action: "CHECKOUT",
      borrowerName: checkoutData.borrowerName,
      purpose: checkoutData.purpose,
      checkoutDate: new Date().toISOString(),
      expectedReturnDate: checkoutData.expectedReturnDate || null,
      handledBy: user?.email || "admin",
      createdAt: serverTimestamp()
    };

    // [FIXED] Point #126: Store history in sub-collection instead of massive array to avoid 1MB document limit
    const { writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(db);

    batch.update(docRef, {
      status: "CHECKED_OUT",
      currentBorrower: checkoutData.borrowerName,
      lastCheckedOutAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const newHistoryDocRef = doc(historyRef);
    batch.set(newHistoryDocRef, historyEntry);

    await batch.commit();

    await addAuditLog("CHECKOUT_PHYSICAL_FILE", "PhysicalFile", fileId, checkoutData);
    return true;
  } catch (error) {
    console.error("Error checking out physical file:", error);
    throw error;
  }
}

export async function returnPhysicalFile(fileId, returnData) {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "physical_files", fileId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) throw new Error("File not found");
    const currentData = docSnap.data();

    const historyRef = collection(db, "physical_files", fileId, "checkout_history");
    const historyEntry = {
      action: "RETURN",
      returnedBy: returnData.returnedBy || currentData.currentBorrower,
      returnDate: new Date().toISOString(),
      condition: returnData.condition || "Good",
      notes: returnData.notes || "",
      handledBy: user?.email || "admin",
      createdAt: serverTimestamp()
    };

    const { writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(db);

    batch.update(docRef, {
      status: "IN_STORAGE",
      currentBorrower: null,
      lastReturnedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const newHistoryDocRef = doc(historyRef);
    batch.set(newHistoryDocRef, historyEntry);

    await batch.commit();

    await addAuditLog("RETURN_PHYSICAL_FILE", "PhysicalFile", fileId, returnData);
    return true;
  } catch (error) {
    console.error("Error returning physical file:", error);
    throw error;
  }
}

// ==========================================
// 2. EXIT MANAGEMENT
// ==========================================

export async function getExitRequests(filters = {}) {
  try {
    let q = query(collection(db, "exit_requests"), orderBy("createdAt", "desc"));
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching exit requests:", error);
    throw error;
  }
}

export async function createExitRequest(exitData) {
  try {
    const user = auth.currentUser;
    // [FIXED] Point #170: Robust ID generation
    const exitId = `EXIT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const docRef = doc(db, "exit_requests", exitId);

    const defaultChecklist = {
      assetsReturned: false,
      idBadgeReturned: false,
      financeNoDuesCleared: false,
      systemAccessRevoked: false,
      exitInterviewCompleted: false,
      knowledgeTransferDone: false,
    };

    const payload = {
      ...exitData,
      exitId,
      status: exitData.status || "INITIATED", // INITIATED, CLEARANCE_IN_PROGRESS, COMPLETED, CANCELLED
      checklist: { ...defaultChecklist, ...(exitData.checklist || {}) },
      settlementStatus: exitData.settlementStatus || "PENDING", // PENDING, PROCESSED, PAID
      relievingLetterGenerated: false,
      experienceLetterGenerated: false,
      initiatedBy: user?.email || "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);

    // Also update employee status if employeeId is provided
    if (exitData.employeeId) {
      const empRef = doc(db, "employees", exitData.employeeId);
      await updateDoc(empRef, {
        status: "Notice Period",
        resignationDate: exitData.resignationDate || new Date().toISOString().split('T')[0],
        lastWorkingDay: exitData.lastWorkingDay || null,
        updatedAt: serverTimestamp(),
      });
    }

    await addAuditLog("INITIATE_EXIT", "ExitManagement", exitId, { 
      employeeName: exitData.employeeName, 
      exitType: exitData.exitType 
    });

    return exitId;
  } catch (error) {
    console.error("Error creating exit request:", error);
    throw error;
  }
}

export async function updateExitChecklist(exitId, checklistUpdates) {
  try {
    const docRef = doc(db, "exit_requests", exitId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Exit request not found");

    const currentChecklist = docSnap.data().checklist || {};
    const mergedChecklist = { ...currentChecklist, ...checklistUpdates };

    // Check if all checklist items are true
    const allCleared = Object.values(mergedChecklist).every(val => val === true);

    const payload = {
      checklist: mergedChecklist,
      status: allCleared ? "CLEARANCE_IN_PROGRESS" : docSnap.data().status,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_EXIT_CHECKLIST", "ExitManagement", exitId, checklistUpdates);
    return true;
  } catch (error) {
    console.error("Error updating exit checklist:", error);
    throw error;
  }
}

export async function finalizeExit(exitId, settlementData = {}) {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "exit_requests", exitId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Exit request not found");

    const exitData = docSnap.data();

    // [FIXED] Point #125: Verify all company assets are returned before finalizing exit
    if (exitData.employeeId) {
      const assetsQ = query(
        collection(db, "assets"),
        where("assignedToId", "==", exitData.employeeId),
        where("status", "==", "ALLOCATED")
      );
      const assetsSnap = await getDocs(assetsQ);
      if (!assetsSnap.empty) {
        throw new Error(`Cannot finalize exit. Employee still has ${assetsSnap.size} company assets allocated. Please mark them as returned first.`);
      }
    }

    await updateDoc(docRef, {
      status: "COMPLETED",
      settlementStatus: "PROCESSED",
      settlementAmount: settlementData.settlementAmount || 0,
      settlementDate: settlementData.settlementDate || new Date().toISOString().split('T')[0],
      relievingLetterGenerated: true,
      experienceLetterGenerated: true,
      closedBy: user?.email || "admin",
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Mark Employee as Inactive/Exited
    if (exitData.employeeId) {
      const empRef = doc(db, "employees", exitData.employeeId);
      await updateDoc(empRef, {
        status: "Inactive",
        isExited: true,
        exitDate: exitData.lastWorkingDay || new Date().toISOString().split('T')[0],
        updatedAt: serverTimestamp(),
      });
    }

    await addAuditLog("FINALIZE_EXIT", "ExitManagement", exitId, settlementData);
    return true;
  } catch (error) {
    console.error("Error finalizing exit:", error);
    throw error;
  }
}

// ==========================================
// 3. COMPANY ASSETS MANAGEMENT
// ==========================================

export async function getCompanyAssets(filters = {}) {
  try {
    let q = query(collection(db, "assets"), orderBy("createdAt", "desc"));
    if (filters.category) {
      q = query(q, where("category", "==", filters.category));
    }
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching company assets:", error);
    throw error;
  }
}

export async function createCompanyAsset(assetData) {
  try {
    // [FIXED] Point #170: Robust ID generation
    const assetId = assetData.assetTag || `AST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const docRef = doc(db, "assets", assetId);

    const payload = {
      ...assetData,
      assetId,
      status: assetData.status || "IN_STOCK", // IN_STOCK, ALLOCATED, UNDER_REPAIR, LOST, RETIRED
      allocationHistory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);
    await addAuditLog("CREATE_ASSET", "CompanyAsset", assetId, { assetName: assetData.name, category: assetData.category });
    return assetId;
  } catch (error) {
    console.error("Error creating company asset:", error);
    throw error;
  }
}

export async function updateCompanyAsset(assetId, updates) {
  try {
    const docRef = doc(db, "assets", assetId);
    const payload = { ...updates, updatedAt: serverTimestamp() };
    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_ASSET", "CompanyAsset", assetId, { updates });
    return true;
  } catch (error) {
    console.error("Error updating company asset:", error);
    throw error;
  }
}

export async function allocateCompanyAsset(assetId, allocationData) {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "assets", assetId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Asset not found");

    const currentData = docSnap.data();
    const historyRef = collection(db, "assets", assetId, "allocation_history");
    const historyEntry = {
      action: "ALLOCATE",
      assignedToId: allocationData.assignedToId,
      assignedToName: allocationData.assignedToName,
      assignedToType: allocationData.assignedToType || "Employee", // Employee or Rider
      allocatedAt: new Date().toISOString(),
      condition: allocationData.condition || "Good",
      notes: allocationData.notes || "",
      allocatedBy: user?.email || "admin",
      createdAt: serverTimestamp()
    };

    // [FIXED] Point #126: Store history in sub-collection instead of massive array to avoid 1MB document limit
    const { writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(db);

    batch.update(docRef, {
      status: "ALLOCATED",
      assignedToId: allocationData.assignedToId,
      assignedToName: allocationData.assignedToName,
      assignedToType: allocationData.assignedToType || "Employee",
      allocatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const newHistoryDocRef = doc(historyRef);
    batch.set(newHistoryDocRef, historyEntry);

    await batch.commit();

    await addAuditLog("ALLOCATE_ASSET", "CompanyAsset", assetId, allocationData);
    return true;
  } catch (error) {
    console.error("Error allocating asset:", error);
    throw error;
  }
}

export async function returnCompanyAsset(assetId, returnData) {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "assets", assetId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Asset not found");

    const currentData = docSnap.data();
    const historyRef = collection(db, "assets", assetId, "allocation_history");
    const historyEntry = {
      action: "RETURN",
      returnedById: currentData.assignedToId,
      returnedByName: currentData.assignedToName,
      returnedAt: new Date().toISOString(),
      condition: returnData.condition || "Good",
      notes: returnData.notes || "",
      handledBy: user?.email || "admin",
      createdAt: serverTimestamp()
    };

    const { writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(db);

    batch.update(docRef, {
      status: returnData.condition === "Damaged" ? "UNDER_REPAIR" : "IN_STOCK",
      assignedToId: null,
      assignedToName: null,
      assignedToType: null,
      lastReturnedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const newHistoryDocRef = doc(historyRef);
    batch.set(newHistoryDocRef, historyEntry);

    await batch.commit();

    await addAuditLog("RETURN_ASSET", "CompanyAsset", assetId, returnData);
    return true;
  } catch (error) {
    console.error("Error returning asset:", error);
    throw error;
  }
}

// ==========================================
// 4. CONTRACTS & AGREEMENTS
// ==========================================

export async function getContracts(filters = {}) {
  try {
    let q = query(collection(db, "contracts"), orderBy("createdAt", "desc"));
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    if (filters.contractType) {
      q = query(q, where("contractType", "==", filters.contractType));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching contracts:", error);
    throw error;
  }
}

export async function createContract(contractData) {
  try {
    // [FIXED] Point #170: Robust ID generation
    const contractId = contractData.contractCode || `CNT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const docRef = doc(db, "contracts", contractId);

    const payload = {
      ...contractData,
      contractId,
      status: contractData.status || "ACTIVE", // ACTIVE, EXPIRING_SOON, EXPIRED, TERMINATED
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);
    await addAuditLog("CREATE_CONTRACT", "Contract", contractId, { title: contractData.title, type: contractData.contractType });
    return contractId;
  } catch (error) {
    console.error("Error creating contract:", error);
    throw error;
  }
}

export async function updateContract(contractId, updates) {
  try {
    const docRef = doc(db, "contracts", contractId);
    const payload = { ...updates, updatedAt: serverTimestamp() };
    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_CONTRACT", "Contract", contractId, { updates });
    return true;
  } catch (error) {
    console.error("Error updating contract:", error);
    throw error;
  }
}

// ==========================================
// 5. BACKGROUND VERIFICATION (BGV)
// ==========================================

export async function getBGVRecords(filters = {}) {
  try {
    let q = query(collection(db, "background_verification"), orderBy("createdAt", "desc"));
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching BGV records:", error);
    throw error;
  }
}

export async function createBGVRecord(bgvData) {
  try {
    // [FIXED] Point #170: Robust ID generation
    const bgvId = `BGV-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const docRef = doc(db, "background_verification", bgvId);

    const defaultChecks = {
      addressCheck: "PENDING",
      criminalCheck: "PENDING",
      employmentCheck: "PENDING",
      educationCheck: "PENDING",
      identityCheck: "PENDING",
      drivingLicenseCheck: "PENDING",
    };

    const payload = {
      ...bgvData,
      bgvId,
      status: bgvData.status || "INITIATED", // INITIATED, IN_PROGRESS, CLEAR, MINOR_DISCREPANCY, MAJOR_DISCREPANCY
      checks: { ...defaultChecks, ...(bgvData.checks || {}) },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);
    await addAuditLog("CREATE_BGV", "BackgroundVerification", bgvId, { candidateName: bgvData.candidateName, agency: bgvData.agency });
    return bgvId;
  } catch (error) {
    console.error("Error creating BGV record:", error);
    throw error;
  }
}

export async function updateBGVRecord(bgvId, updates) {
  try {
    const docRef = doc(db, "background_verification", bgvId);
    const payload = { ...updates, updatedAt: serverTimestamp() };
    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_BGV", "BackgroundVerification", bgvId, { updates });
    return true;
  } catch (error) {
    console.error("Error updating BGV record:", error);
    throw error;
  }
}

// ==========================================
// 6. TRAINING & CERTIFICATIONS
// ==========================================

export async function getTrainingRecords(filters = {}) {
  try {
    let q = query(collection(db, "training"), orderBy("createdAt", "desc"));
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching training records:", error);
    throw error;
  }
}

export async function createTrainingRecord(trainingData) {
  try {
    // [FIXED] Point #170: Robust ID generation
    const trainingId = `TRN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const docRef = doc(db, "training", trainingId);

    const payload = {
      ...trainingData,
      trainingId,
      status: trainingData.status || "SCHEDULED", // SCHEDULED, IN_PROGRESS, COMPLETED, EXPIRED
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload);
    await addAuditLog("CREATE_TRAINING", "Training", trainingId, { title: trainingData.title, traineeName: trainingData.traineeName });
    return trainingId;
  } catch (error) {
    console.error("Error creating training record:", error);
    throw error;
  }
}

export async function updateTrainingRecord(trainingId, updates) {
  try {
    const docRef = doc(db, "training", trainingId);
    const payload = { ...updates, updatedAt: serverTimestamp() };
    await updateDoc(docRef, payload);
    await addAuditLog("UPDATE_TRAINING", "Training", trainingId, { updates });
    return true;
  } catch (error) {
    console.error("Error updating training record:", error);
    throw error;
  }
}

// ==========================================
// 7. DOCUMENT SETTINGS & REQUIREMENTS
// ==========================================

export async function getDocumentSettings() {
  try {
    const docRef = doc(db, "document_settings", "global_config");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    
    // Default fallback settings
    const defaultSettings = {
      expiryWarningDays: [90, 60, 30, 15, 7],
      defaultRetentionYears: 5,
      enableAutoArchive: true,
      requirePhysicalCopyForGovtDocs: true,
      enforceStrictMasking: true,
      allowedFileTypes: ["application/pdf", "image/jpeg", "image/png"],
      maxFileSizeMB: 15,
      updatedAt: new Date().toISOString(),
    };
    return defaultSettings;
  } catch (error) {
    console.error("Error fetching document settings:", error);
    throw error;
  }
}

export async function saveDocumentSettings(settings) {
  try {
    const docRef = doc(db, "document_settings", "global_config");
    const payload = { ...settings, updatedAt: serverTimestamp() };
    await setDoc(docRef, payload, { merge: true });
    await addAuditLog("UPDATE_DOCUMENT_SETTINGS", "DocumentSettings", "global_config", settings);
    return true;
  } catch (error) {
    console.error("Error saving document settings:", error);
    throw error;
  }
}

// ==========================================
// 8. HR DASHBOARD METRICS AGGREGATOR
// ==========================================

export async function getHRDashboardMetrics() {
  try {
    const [
      employeesSnap,
      ridersSnap,
      documentsSnap,
      physicalFilesSnap,
      assetsSnap,
      exitsSnap,
      contractsSnap,
      bgvSnap,
      trainingSnap
    ] = await Promise.all([
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "rider_hr_profiles")),
      getDocs(query(collection(db, "workforce_documents"), where("isCurrentVersion", "==", true))),
      getDocs(collection(db, "physical_files")),
      getDocs(collection(db, "assets")),
      getDocs(collection(db, "exit_requests")),
      getDocs(collection(db, "contracts")),
      getDocs(collection(db, "background_verification")),
      getDocs(collection(db, "training")),
    ]);

    const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const riders = ridersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const documents = documentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const physicalFiles = physicalFilesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const assets = assetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const exits = exitsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const contracts = contractsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const bgv = bgvSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const training = trainingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const now = new Date();

    // Document counts
    const verifiedDocs = documents.filter(d => d.verificationStatus === "VERIFIED").length;
    const pendingVerification = documents.filter(d => ["UNDER_REVIEW", "PENDING"].includes(d.verificationStatus)).length;
    const rejectedDocs = documents.filter(d => d.verificationStatus === "REJECTED").length;
    
    // Expiring within 30 days
    const expiringSoonDocs = documents.filter(d => {
      if (!d.expiryDate) return false;
      const exp = new Date(d.expiryDate);
      const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    }).length;

    // Expired
    const expiredDocs = documents.filter(d => {
      if (!d.expiryDate) return false;
      const exp = new Date(d.expiryDate);
      return exp < now || d.verificationStatus === "EXPIRED";
    }).length;

    // Active Employees & Riders
    const activeEmployees = employees.filter(e => e.status === "Active" || !e.status).length;
    const activeRiders = riders.filter(r => r.status === "Active" || !r.status).length;
    const totalHeadcount = activeEmployees + activeRiders;

    // Compliance Score
    const totalRequiredPossible = totalHeadcount * 4; // Approx 4 base documents per person
    const complianceScore = totalRequiredPossible > 0 
      ? Math.min(100, Math.round((verifiedDocs / totalRequiredPossible) * 100)) 
      : 100;

    // Department Distribution
    const deptMap = {};
    employees.forEach(e => {
      const dept = e.department || e.departmentId || "Operations";
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });

    return {
      totalEmployees: employees.length,
      activeEmployees,
      totalRiders: riders.length,
      activeRiders,
      totalHeadcount,
      totalDocuments: documents.length,
      verifiedDocs,
      pendingVerification,
      rejectedDocs,
      expiringSoonDocs,
      expiredDocs,
      complianceScore,
      totalPhysicalFiles: physicalFiles.length,
      checkedOutFiles: physicalFiles.filter(f => f.status === "CHECKED_OUT").length,
      totalAssets: assets.length,
      allocatedAssets: assets.filter(a => a.status === "ALLOCATED").length,
      pendingExits: exits.filter(e => e.status !== "COMPLETED" && e.status !== "CANCELLED").length,
      activeContracts: contracts.filter(c => c.status === "ACTIVE").length,
      pendingBGV: bgv.filter(b => b.status === "INITIATED" || b.status === "IN_PROGRESS").length,
      completedTraining: training.filter(t => t.status === "COMPLETED").length,
      departmentDistribution: Object.entries(deptMap).map(([name, count]) => ({ name, count })),
    };
  } catch (error) {
    console.error("Error generating HR dashboard metrics:", error);
    throw error;
  }
}
