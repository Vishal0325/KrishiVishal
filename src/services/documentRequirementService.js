import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { addAuditLog } from "./logger";

// Standard requirements can be seeded into DB. 
// For now, we fetch from DB or provide defaults if empty.
export async function getDocumentRequirements(roleType, employeeType) {
  try {
    let q = query(collection(db, "document_requirements"));
    
    if (roleType) {
      q = query(q, where("roleType", "==", roleType));
    }
    if (employeeType) {
      q = query(q, where("employeeType", "==", employeeType));
    }

    const snapshot = await getDocs(q);
    const requirements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return requirements;
  } catch (error) {
    console.error("Error fetching document requirements:", error);
    throw error;
  }
}

export async function createDocumentRequirement(requirementData) {
    try {
        const requirementId = `REQ-${Date.now()}`;
        const docRef = doc(db, "document_requirements", requirementId);
        
        const payload = {
            requirementId,
            ...requirementData,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        await setDoc(docRef, payload);
        await addAuditLog("CREATE_DOC_REQUIREMENT", "DocumentRequirement", requirementId, { requirementData });
        
        return requirementId;
    } catch (error) {
        console.error("Error creating document requirement:", error);
        throw error;
    }
}

// Helper to determine missing documents
export function calculateMissingDocuments(requirements, uploadedDocuments) {
  const missing = [];
  
  requirements.forEach(req => {
    if (req.isMandatory) {
      const isUploaded = uploadedDocuments.some(doc => 
        doc.documentType === req.documentType && 
        doc.verificationStatus !== "REJECTED" &&
        doc.archiveStatus !== "ARCHIVED"
      );
      
      if (!isUploaded) {
        missing.push(req);
      }
    }
  });
  
  return missing;
}

// Generate Joining Checklist
export function generateJoiningChecklist(requirements) {
    const checklist = {};
    
    requirements.forEach(req => {
        if (!checklist[req.documentCategory]) {
            checklist[req.documentCategory] = [];
        }
        checklist[req.documentCategory].push({
            documentType: req.documentType,
            isMandatory: req.isMandatory,
            completed: false // Default state for new employee
        });
    });

    return checklist;
}
