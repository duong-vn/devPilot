import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookieOptions } from "@/lib/auth";
import { appUrl, capabilities } from "@/lib/config";
import { HttpError, handle } from "@/lib/http";
export async function GET() {
  return handle(async () => {
    if (!capabilities().github)
      throw new HttpError(
        503,
        "GitHub sign-in is not configured. Use the demo or configure GitHub OAuth and PostgreSQL.",
      );
    const state = randomBytes(32).toString("base64url");
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", `${appUrl()}/api/auth/github/callback`);
    url.searchParams.set("scope", "read:user repo");
    url.searchParams.set("state", state);
    const response = NextResponse.redirect(url);
    response.cookies.set("devpilot_oauth", state, { ...cookieOptions, maxAge: 600 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
