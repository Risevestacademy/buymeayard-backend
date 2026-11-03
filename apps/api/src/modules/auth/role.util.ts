/** Highest first. The platform has two roles. */
const ROLE_PRECEDENCE = ['ADMIN', 'CREATOR'];

/** The one role a client should treat the user as. null if they have none. */
export function primaryRole(roles: string[]): string | null {
  for (const role of ROLE_PRECEDENCE) {
    if (roles.includes(role)) return role;
  }
  return roles[0] ?? null;
}
