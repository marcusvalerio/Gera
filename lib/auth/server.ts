import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!baseUrl || !cookieSecret) {
  // Keep build-time imports safe; requests fail with a clear setup error.
  console.warn("Gera: configure NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET.");
}

export const auth = createNeonAuth({
  baseUrl: baseUrl ?? "http://localhost:3000/api/auth",
  cookies: { secret: cookieSecret ?? "development-only-secret-change-me-32-chars" },
});
