import { format, formatDistanceToNow, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// Display formatted phone number (e.g., "+91 98765 43210")
export function formatPhone(phone?: string | null): string {
  if (!phone) return "-";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
}

// Display currency in Indian Rupees
export function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Convert UTC ISO to IST and format
export function formatDateTime(isoString?: string | null, formatStr: string = "dd MMM yyyy, hh:mm a"): string {
  if (!isoString) return "-";
  try {
    return formatInTimeZone(parseISO(isoString), "Asia/Kolkata", formatStr);
  } catch (e) {
    return isoString;
  }
}

export function formatDate(isoString?: string | null): string {
  return formatDateTime(isoString, "dd MMM yyyy");
}

export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return "-";
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
  } catch (e) {
    return isoString;
  }
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
