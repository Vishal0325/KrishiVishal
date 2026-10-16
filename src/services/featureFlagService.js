import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";

/**
 * Thin client for the `updateFeatureFlag` callable (the ONLY way to change system_configs;
 * Firestore rules deny direct writes).
 *
 * @param {{ flagPath: string, newValue: boolean|number, reason: string, expectedVersion: number, hubId?: string|null }} params
 * @returns {Promise<{ success: true, changed: boolean, configDoc: string, flagPath: string, oldValue: boolean|number, newValue: boolean|number, version: number }>}
 */
export async function updateFeatureFlag({ flagPath, newValue, reason, expectedVersion, hubId = null }) {
  const callable = httpsCallable(functions, "updateFeatureFlag");
  const res = await callable({ flagPath, newValue, reason, expectedVersion, hubId });
  return res.data;
}

/**
 * Maps a callable error to a user-facing message.
 * `conflict` is true when someone else changed the config since the modal was opened.
 */
export function describeFlagError(err) {
  const code = err?.code || "";
  if (code === "functions/aborted") {
    const current = err?.details?.currentVersion;
    return {
      conflict: true,
      message: `Someone else changed these controls${current !== undefined ? ` (now v${current})` : ""}. Close this dialog, review the latest state and try again.`,
    };
  }
  if (code === "functions/permission-denied") return { conflict: false, message: err.message || "You do not have permission to change this control." };
  if (code === "functions/failed-precondition") return { conflict: false, message: err.message || "Change blocked by the current system state." };
  if (code === "functions/invalid-argument") return { conflict: false, message: err.message || "Invalid request." };
  if (code === "functions/unauthenticated") return { conflict: false, message: "Your session has expired. Please sign in again." };
  if (code === "functions/not-found") return { conflict: false, message: err.message || "Hub not found." };
  return { conflict: false, message: err?.message || "Could not update the control. Check your connection and try again." };
}
