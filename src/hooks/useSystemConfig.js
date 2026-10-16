import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

const LOADING = { loading: true, exists: false, data: {}, fromCache: false, error: null };

/**
 * Realtime listeners on system_configs/global and system_configs/hubs_{hubId}.
 * Exactly two listeners total (one global, one for the active hub) - cheap and bounded.
 *
 * State is keyed by hubId so that switching hubs never exposes the previous hub's
 * `version` (which would produce a wrong `expectedVersion`).
 *
 * `fromCache` is true when the snapshot was served from the local persistent cache
 * (e.g. offline): the UI must not allow writes against possibly stale versions.
 */
export function useSystemConfig(hubId) {
  const [globalState, setGlobalState] = useState(LOADING);
  const [hubState, setHubState] = useState({ key: null, ...LOADING });

  useEffect(() => {
    let unsub = null;
    let isMounted = true;

    // Small delay prevents React 18 StrictMode mount-unmount-mount thrashing on Firestore WebChannel stream
    const timer = setTimeout(() => {
      if (!isMounted) return;
      try {
        unsub = onSnapshot(
          doc(db, "system_configs", "global"),
          { includeMetadataChanges: true },
          (snap) => {
            if (!isMounted) return;
            setGlobalState({
              loading: false,
              exists: snap.exists(),
              data: snap.data() || {},
              fromCache: snap.metadata?.fromCache || false,
              error: null,
            });
          },
          (error) => {
            if (!isMounted) return;
            console.warn("Global config snapshot warning:", error);
            setGlobalState((prev) => ({ ...prev, loading: false, error }));
          }
        );
      } catch (err) {
        console.warn("Error attaching global config listener:", err);
      }
    }, 10);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch (e) {
          console.warn("Error cleaning up global config listener:", e);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!hubId) {
      setHubState({ key: null, ...LOADING, loading: false });
      return undefined;
    }

    let unsub = null;
    let isMounted = true;

    const timer = setTimeout(() => {
      if (!isMounted) return;
      try {
        unsub = onSnapshot(
          doc(db, "system_configs", `hubs_${hubId}`),
          { includeMetadataChanges: true },
          (snap) => {
            if (!isMounted) return;
            setHubState({
              key: hubId,
              loading: false,
              exists: snap.exists(),
              data: snap.data() || {},
              fromCache: snap.metadata?.fromCache || false,
              error: null,
            });
          },
          (error) => {
            if (!isMounted) return;
            console.warn("Hub config snapshot warning:", error);
            setHubState((prev) => ({ ...prev, key: hubId, loading: false, error }));
          }
        );
      } catch (err) {
        console.warn("Error attaching hub config listener:", err);
      }
    }, 10);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch (e) {
          console.warn("Error cleaning up hub config listener:", e);
        }
      }
    };
  }, [hubId]);

  return {
    global: globalState,
    hub: hubId && hubState.key === hubId ? hubState : LOADING,
  };
}

/** Monotonic version of a config doc (0 when the doc does not exist yet). */
export function configVersion(state) {
  return typeof state?.data?.version === "number" ? state.data.version : 0;
}
