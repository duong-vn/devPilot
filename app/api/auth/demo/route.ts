import { createDemo } from "@/lib/auth";
import { assertSameOrigin, handle, json } from "@/lib/http";
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const response = json({ ok: true });
    createDemo(response);
    return response;
  });
}
