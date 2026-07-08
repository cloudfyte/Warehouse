const MAP: [RegExp | string, string | ((m: string) => string)][] = [
  // Network
  ["Failed to fetch",              "Can't reach the server. Check your connection and try again."],
  ["NetworkError",                 "Network error. Please check your connection."],
  ["Load failed",                  "Can't reach the server. Check your connection and try again."],

  // Session
  ["SESSION_EXPIRED",              "Your session has expired. Please log in again."],
  ["signature has expired",        "Your session has expired. Please log in again."],
  ["token is expired",             "Your session has expired. Please log in again."],
  ["not authenticated",            "You need to log in to do this."],
  ["Authentication credentials",   "You need to log in to do this."],

  // Auth
  ["No account found",             "No account found with those details. Check and try again."],
  ["Incorrect password",           "Incorrect password. Please try again."],
  ["This account is disabled",     "This account has been deactivated. Contact your admin."],
  ["account has been deactivated", "Your account has been deactivated. Contact your admin."],
  ["Current password is incorrect","The current password you entered is wrong."],
  ["New password must be",         "New password must be at least 6 characters."],
  ["Please enter your username",   "Please enter your username, email or phone number."],

  // Permissions
  ["do not have permission",       "You don't have permission to do this."],
  ["not assigned to your account", "This warehouse isn't assigned to your account."],

  // Stock / inventory
  ["Total meters must be greater", "Quantity must be greater than zero."],
  ["Quantity must be greater",     "Quantity must be greater than zero."],
  ["Only",                         (m: string) => m], // keep "Only X pieces available" as-is

  // Validation
  ["is required",                  (m: string) => m], // keep field-required messages as-is
  ["must be",                      (m: string) => m], // keep constraint messages as-is

  // Entities not found — keep concise
  ["not found",                    (m: string) => m.replace(/\.$/, "") + "."],

  // Generic fallback — must be last
  ["Something went wrong",         "Something went wrong. Please try again."],
];

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");

  for (const [pattern, replacement] of MAP) {
    const matched =
      typeof pattern === "string"
        ? raw.toLowerCase().includes(pattern.toLowerCase())
        : pattern.test(raw);

    if (matched) {
      if (typeof replacement === "function") return replacement(raw);
      return replacement;
    }
  }

  // If it looks like a clean sentence from the backend, show it directly
  if (raw && raw.length < 120 && !raw.includes("Exception") && !raw.includes("Error:") && !raw.includes("\n")) {
    return raw;
  }

  return "Something went wrong. Please try again.";
}
