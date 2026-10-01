import { useAuthContext } from './useAuthContext';

export function useReadOnly(overrideRoles = []) {
  const { role, isViewer } = useAuthContext();
  const isReadOnly = isViewer || role === 'Viewer' || (Array.isArray(overrideRoles) && overrideRoles.includes(role));
  return { isReadOnly, role };
}

export default useReadOnly;
