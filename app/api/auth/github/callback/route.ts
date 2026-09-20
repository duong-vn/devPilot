import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookieOptions, createSession } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { githubFetch } from "@/lib/repository";

export async function GET(request: Request) {
  const destination = new URL("/", appUrl());
  const clearState = (response: NextResponse) => {
    response.cookies.set("devpilot_oauth", "", { ...cookieOptions, maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    const expected = (await cookies()).get("devpilot_oauth")?.value ?? "";
    const code = url.searchParams.get("code");
    if (
      !expected ||
      !state ||
      state.length !== expected.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expected)) ||
      !code ||
      code.length > 200
    )
      throw new Error("Invalid OAuth response");
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${appUrl()}/api/auth/github/callback`,
      }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("OAuth exchange failed");
    const access = z
      .object({ access_token: z.string().min(1).max(1000) })
      .parse(await response.json());
    const profile = z
      .object({
        id: z.number().int().positive(),
        login: z.string(),
        name: z.string().nullable(),
        avatar_url: z.string().url(),
      })
      .parse(await githubFetch("/user", access.access_token));
    const result = NextResponse.redirect(destination);
    await createSession(
      {
        id: String(profile.id),
        login: profile.login,
        name: profile.name ?? profile.login,
        avatar: profile.avatar_url,
      },
      access.access_token,
      result,
    );
    return clearState(result);
  } catch {
    destination.searchParams.set(
      "authError",
      "GitHub sign-in failed. Please try again or check your integration settings.",
    );
    return clearState(NextResponse.redirect(destination));
  }
}
