import { ReactNode } from "react";
import { UserRole } from "../../lib/operations-data";

type MenuPermission =
  | "dashboard"
  | "trips"
  | "vehicles"
  | "documents"
  | "alerts"
  | "configurations"
  | "costs"
  | "security"
  | "tvmode";

const permissionsByRole: Record<UserRole, MenuPermission[]> = {
  Administrador: ["dashboard", "trips", "vehicles", "documents", "alerts", "configurations", "costs", "security", "tvmode"],
  Operador: ["dashboard", "trips", "vehicles", "documents", "alerts", "configurations", "costs", "tvmode"],
  Supervisor: ["dashboard", "trips", "vehicles", "documents", "alerts", "costs", "tvmode"],
  Chofer: ["dashboard", "trips"],
  Visualizador: ["dashboard", "alerts", "tvmode"],
};

export function canAccess(role: UserRole, permission: MenuPermission) {
  return permissionsByRole[role]?.includes(permission) ?? false;
}

export function RbacGuard({
  role,
  permission,
  fallback = null,
  children,
}: {
  role: UserRole;
  permission: MenuPermission;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  if (!canAccess(role, permission)) return <>{fallback}</>;
  return <>{children}</>;
}
