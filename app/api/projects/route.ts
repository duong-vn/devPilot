import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { assertSameOrigin, handle, json, readJson } from "@/lib/http";
import { consumeQuota, createProject } from "@/lib/store";

const input = z
  .object({
    name: z.string().trim().min(1, "Project name is required.").max(80),
    description: z.string().trim().max(500).default(""),
  })
  .strict();
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireSession();
    const data = input.parse(await readJson(request));
    await consumeQuota(session, "mutation");
    return json(await createProject(session, data.name, data.description), 201);
  });
}
