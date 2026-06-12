/**
 * Normalize a phone to a 10-digit Indian mobile number string.
 * Accepts:
 *   +91XXXXXXXXXX  (12 digits starting 91)
 *   0XXXXXXXXXX    (11 digits starting 0)
 *   XXXXXXXXXX     (10 digits)
 * Everything else returns the raw digit string (which won't pass isValidIndianMobile).
 * Does NOT silently truncate arbitrary long strings.
 */
export function normalizePhone(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * Returns true if the number is a valid Indian mobile number:
 * exactly 10 digits, starting with 6–9.
 */
export function isValidIndianMobile(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(input));
}

export function toE164India(phone: string): string {
  const ten = normalizePhone(phone);
  return `+91${ten}`;
}
