/**
 * Lightweight password gate for the MovieWall admin.
 *
 * - `ADMIN_PASSWORD` (server-only env var) is the password the user types on /login.
 * - `AUTH_COOKIE_SECRET` (server-only env var) signs the cookie so it can't be forged.
 * - If `ADMIN_PASSWORD` is unset, auth is disabled and the admin is fully open
 *   (useful for local dev / first-run before you set anything).
 */

export const AUTH_COOKIE_NAME = "mw_auth";

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function getCookieSecret(): string {
  // If you don't set AUTH_COOKIE_SECRET, we fall back to a constant so things still
  // work, but you should set one in production so cookies can't be guessed.
  return (
    process.env.AUTH_COOKIE_SECRET ?? "moviewall-default-cookie-secret-change-me"
  );
}

export function isAuthDisabled(): boolean {
  return !getAdminPassword();
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return hex(sig);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Token value stored in the cookie. Deterministic for a given password + secret. */
export async function computeAuthToken(): Promise<string> {
  return hmacHex(getAdminPassword(), getCookieSecret());
}

export async function isValidAuthCookie(
  value: string | undefined | null
): Promise<boolean> {
  if (isAuthDisabled()) return true;
  if (!value) return false;
  const expected = await computeAuthToken();
  return constantTimeEqual(value, expected);
}
