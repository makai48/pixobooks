/**
 * Employee display-name helpers.
 *
 * `fullName` is the legal/formal name. `displayName` is what colleagues,
 * receipts and reports use every day — short, familiar, and stable.
 */

/** Initials for avatars: "Sheillah Nakato" -> "SN". */
export function employeeInitials(fullName: string): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Suggested display name.
 *
 * - Multiple names: first name + surname initial, e.g. "Sheillah K".
 * - One name: short uppercase form, e.g. "SHE" or "JO".
 */
export function deriveDisplayName(fullName: string): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    return parts[0].length <= 2
      ? parts[0].toUpperCase()
      : `${parts[0][0].toUpperCase()}${parts[0].slice(1, 3).toLowerCase()}`;
  }
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}`;
}
