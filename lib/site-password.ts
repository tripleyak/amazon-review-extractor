export const SITE_PASSWORD_COOKIE = "rsu_site_auth";
export const SITE_PASSWORD_ROUTE = "/api/site-password";
export const SITE_PASSWORD_MAX_AGE = 60 * 60 * 24 * 30;

export function getSitePassword() {
  const password = process.env.RSU_SITE_PASSWORD;
  return password && password.length > 0 ? password : null;
}

export function protectionIsRequired() {
  return process.env.VERCEL_ENV === "production" || Boolean(getSitePassword());
}

export async function getPasswordToken(password: string) {
  const bytes = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function getSafeRedirectPath(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string" || value.length === 0) {
    return "/";
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith(SITE_PASSWORD_ROUTE)) {
    return "/";
  }

  return value;
}
