export function normalizePhone(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  return ten;
}

/**
 * Returns true if the number is a valid Indian mobile number:
 * exactly 10 digits, starting with 6–9.
 */
export function isValidIndianMobile(input: string): boolean {
  const ten = normalizePhone(input);
  return /^[6-9]\d{9}$/.test(ten);
}

export function toE164India(phone: string): string {
  const ten = normalizePhone(phone);
  return `+91${ten}`;
}
