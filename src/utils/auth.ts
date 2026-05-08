// src/utils/auth.ts

export function getToken(): string | null {
  return localStorage.getItem('access_token');
}

export function getRoles(): string[] {
  try {
    return JSON.parse(localStorage.getItem('roles') ?? '[]');
  } catch {
    return [];
  }
}

export function hasRole(role: string): boolean {
  return getRoles().includes(role);
}

/**
 * Returns true if the only role the user has is ROLE_MAINTENANCE.
 * Adjust the logic here if ROLE_MAINTENANCE can coexist with other roles
 * and you still want the restriction applied.
 */
export function isMaintenanceOnly(): boolean {
  const roles = getRoles();
  return roles.includes('ROLE_MAINTENANCE') && !roles.some(r => r === 'ROLE_ADMIN' || r === 'ROLE_SUPERADMIN');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout(): void {
  localStorage.clear();
  window.location.href = 'http://localhost:5173/';
}

/**
 * Decodes the JWT payload (base64) and returns it as an object.
 * Does NOT verify the signature — verification happens server-side.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}