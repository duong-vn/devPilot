import type { Capabilities } from "./types";

export function capabilities(): Capabilities {
  return {
    github: Boolean(
      process.env.GITHUB_CLIENT_ID &&
        process.env.GITHUB_CLIENT_SECRET &&
        process.env.SESSION_ENCRYPTION_KEY &&
        process.env.DATABASE_URL &&
        process.env.APP_URL,
    ),
    ai: Boolean(process.env.OPENAI_API_KEY),
    database: Boolean(process.env.DATABASE_URL),
    demo: process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO === "true",
  };
}
export function appUrl() {
  const value =
    process.env.APP_URL ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
  if (!value) throw new Error("APP_URL must be configured.");
  const url = new URL(value);
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Production APP_URL must use HTTPS.");
  return url.origin;
}
