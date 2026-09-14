import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "../firebase/config";
import { addAuditLog } from "./logger";

export async function uploadWorkforceDocument(file, metadata, onProgress) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Unauthorized");

    // Path structure: workforce-documents/[ownerType]s/[ownerId]/[category]/[fileName]
    const ownerTypePlural = metadata.ownerType === "EMP" ? "employees" : "riders";
    const path = `workforce-documents/${ownerTypePlural}/${metadata.ownerId}/${metadata.documentCategory}/${Date.now()}_${file.name}`;
    
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        },
        (error) => reject(error),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // Create Firestore metadata record
          // [FIXED] Point #149: Using more secure unique ID pattern to prevent document collisions
          const documentId = `DOC-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
          const docRef = doc(db, "workforce_documents", documentId);
          
          const documentPayload = {
            documentId,
            ownerId: metadata.ownerId,
            ownerType: metadata.ownerType, // 'EMP' or 'RDR'
            employeeId: metadata.ownerType === "EMP" ? metadata.ownerId : null,
            riderId: metadata.ownerType === "RDR" ? metadata.ownerId : null,
            documentType: metadata.documentType,
            documentCategory: metadata.documentCategory,
            documentName: metadata.documentName,
            // [FIXED] Point #151: Only store masked document number in the main collection to prevent PII leak.
            // Original number should be verified at upload time and discarded or stored in a secure vault.
            documentNumber: maskDocumentNumber(metadata.documentNumber),
            maskedDocumentNumber: maskDocumentNumber(metadata.documentNumber),
            fileName: file.name,
            storagePath: path,
            fileType: file.type,
            fileSize: file.size,
            issueDate: metadata.issueDate || null,
            expiryDate: metadata.expiryDate || null,
            verificationStatus: "UNDER_REVIEW", // Enforced initial state
            version: metadata.version || 1,
            isCurrentVersion: true,
            supersedesDocumentId: metadata.supersedesDocumentId || null,
            sensitivityLevel: metadata.sensitivityLevel || "Confidential",
            accessLevel: metadata.accessLevel || "HR",
            physicalCopyRequired: metadata.physicalCopyRequired || false,
            physicalCopyStatus: metadata.physicalCopyRequired ? "NOT_AVAILABLE" : "NOT_REQUIRED",
            retentionStatus: "ACTIVE",
            archiveStatus: "ACTIVE",
            uploadedBy: user.uid,
            uploadedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await setDoc(docRef, documentPayload);
          
          // If this replaces an old document, update the old one
          if (metadata.supersedesDocumentId) {
            await updateDoc(doc(db, "workforce_documents", metadata.supersedesDocumentId), {
              isCurrentVersion: false,
              status: "SUPERSEDED",
              updatedAt: serverTimestamp()
            });
          }

          await addAuditLog("UPLOAD_DOCUMENT", "WorkforceDocument", documentId, { 
            ownerId: metadata.ownerId,
            documentType: metadata.documentType 
          });

          resolve({ documentId, downloadURL, documentPayload });
        }
      );
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    throw error;
  }
}

export async function getDocumentsByOwner(ownerId) {
  try {
    const q = query(
      collection(db, "workforce_documents"), 
      where("ownerId", "==", ownerId),
      where("isCurrentVersion", "==", true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching documents:", error);
    throw error;
  }
}

export async function verifyDocument(documentId, remarks = "") {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "workforce_documents", documentId);
    
    await updateDoc(docRef, {
      verificationStatus: "VERIFIED",
      verificationRemarks: remarks,
      verifiedBy: user.uid,
      verifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await addAuditLog("VERIFY_DOCUMENT", "WorkforceDocument", documentId, { remarks });
    return true;
  } catch (error) {
    console.error("Error verifying document:", error);
    throw error;
  }
}

export async function rejectDocument(documentId, remarks) {
  try {
    const user = auth.currentUser;
    const docRef = doc(db, "workforce_documents", documentId);
    
    await updateDoc(docRef, {
      verificationStatus: "REJECTED",
      verificationRemarks: remarks,
      verifiedBy: user.uid,
      verifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await addAuditLog("REJECT_DOCUMENT", "WorkforceDocument", documentId, { remarks });
    return true;
  } catch (error) {
    console.error("Error rejecting document:", error);
    throw error;
  }
}

export async function archiveDocument(documentId, reason = "") {
    try {
      const docRef = doc(db, "workforce_documents", documentId);
      await updateDoc(docRef, {
        archiveStatus: "ARCHIVED",
        archivedAt: serverTimestamp(),
        retentionStatus: "ARCHIVED",
        updatedAt: serverTimestamp()
      });
  
      await addAuditLog("ARCHIVE_DOCUMENT", "WorkforceDocument", documentId, { reason });
      return true;
    } catch (error) {
      console.error("Error archiving document:", error);
      throw error;
    }
}

// Basic masking utility
export function maskDocumentNumber(num) {
  if (!num) return null;
  const str = String(num);
  if (str.length <= 4) return str;
  return '*'.repeat(str.length - 4) + str.slice(-4);
}
