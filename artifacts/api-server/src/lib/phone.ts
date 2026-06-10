export function normalizePhone(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function toE164India(phone: string): string {
  const ten = normalizePhone(phone);
  return `+91${ten}`;
}
