import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(403, "This request must come from the DevPilot workspace.");
}
export async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON request body is required.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) throw new HttpError(413, "Request is too large.");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request must contain valid JSON.");
  }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export async function handle(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json({ error: error.issues[0]?.message ?? "Invalid input." }, 400);
    // Do not serialize provider/database errors: they can contain source or access material.
    console.error("DevPilot request failed", error instanceof Error ? error.name : "UnknownError");
    return json(
      {
        error:
          "The operation could not be completed. Your existing data has been preserved. Check service configuration and try again.",
      },
      503,
    );
  }
}
