import { useAuthContext } from './useAuthContext';
import { query as fsQuery, where as fsWhere } from 'firebase/firestore';

export function useHubFilter() {
  const { hubAccess, hubId: userHubId } = useAuthContext();
  
  // SuperAdmin/FinanceAdmin with hubAccess:ALL → no filter (see all hubs)
  // HubManager/DepartmentManager with hubAccess:SINGLE → filter by their hubId
  const hubId = hubAccess === 'SINGLE' ? userHubId : null;
  const isFiltered = !!hubId;
  
  // Call this to add hub filter to any Firestore query (supports modular SDK and chained query)
  function applyHubFilter(targetQuery, field = 'warehouseId') {
    if (!hubId) return targetQuery; // no filter = all hubs
    if (typeof targetQuery?.where === 'function') {
      return targetQuery.where(field, '==', hubId);
    }
    return fsQuery(targetQuery, fsWhere(field, '==', hubId));
  }
  
  return { hubId, isFiltered, applyHubFilter };
}
