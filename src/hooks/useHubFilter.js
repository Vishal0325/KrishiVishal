import { useAuthContext } from './useAuthContext';

export function useHubFilter() {
  const { hubAccess, hubId: userHubId } = useAuthContext();
  
  // SuperAdmin/FinanceAdmin with hubAccess:ALL → no filter (see all hubs)
  // HubManager/DepartmentManager with hubAccess:SINGLE → filter by their hubId
  const hubId = hubAccess === 'SINGLE' ? userHubId : null;
  const isFiltered = !!hubId;
  
  // Call this to add hub filter to any Firestore query
  function applyHubFilter(query, field = 'warehouseId') {
    if (!hubId) return query; // no filter = all hubs
    return query.where(field, '==', hubId);
  }
  
  return { hubId, isFiltered, applyHubFilter };
}
