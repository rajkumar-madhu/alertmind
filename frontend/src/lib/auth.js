/** Role helpers. Missing/unknown role is never treated as a writer. */

export function hasWriteRole(user) {
  const role = user?.role;
  return role === "admin" || role === "engineer";
}

export function isAdmin(user) {
  return user?.role === "admin";
}
