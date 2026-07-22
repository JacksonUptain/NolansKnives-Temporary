export const ROLES = {
  CUSTOMER: "customer",
  BUSINESS: "business",
  ADMIN: "admin"
};

export const STATUS = {
  ACTIVE: "active",
  BLOCKED: "blocked"
};

export function hasAtLeastBusiness(role) {
  return role === ROLES.BUSINESS || role === ROLES.ADMIN;
}

export function isAdmin(role) {
  return role === ROLES.ADMIN;
}

export function isActiveStatus(status) {
  return status !== STATUS.BLOCKED;
}
