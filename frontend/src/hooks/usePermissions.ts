import { User } from '../services/api';

export const usePermissions = (user: User | null) => {
  const hasPermission = (permission: string): boolean => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission);
  };

  const hasRole = (role: string): boolean => {
    if (!user) return false;
    return user.role === role;
  };

  const isAdmin = (): boolean => hasRole('admin');
  const isEngineer = (): boolean => hasRole('engineer');
  const isTechnician = (): boolean => hasRole('technician');

  const canRunTests = (): boolean => hasPermission('run_tests');
  const canViewLogs = (): boolean => hasPermission('view_logs');
  const canAudit = (): boolean => hasPermission('audit');
  const canManageUsers = (): boolean => hasPermission('manage_users');

  return {
    user,
    hasPermission,
    hasRole,
    isAdmin,
    isEngineer,
    isTechnician,
    canRunTests,
    canViewLogs,
    canAudit,
    canManageUsers,
  };
};
