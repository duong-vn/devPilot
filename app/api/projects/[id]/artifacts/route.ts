import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { assertSameOrigin, HttpError, handle, json, readJson } from "@/lib/http";
import { generateArtifact } from "@/lib/intelligence";
import { consumeQuota, withProjectOperation } from "@/lib/store";
export const maxDuration = 90;
const input = z
  .object({
    kind: z.enum(["specification", "plan", "review", "tests"]),
    prompt: z.string().trim().min(1).max(4000),
    parentId: z.string().uuid().optional(),
  })
  .strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const data = input.parse(await readJson(request));
    return json(
      await withProjectOperation(session, id, async (snapshot, save) => {
        if (!snapshot.repository)
          throw new HttpError(409, "Connect a repository before generating an artifact.");
        if (snapshot.artifacts.length >= 40)
          throw new HttpError(409, "Artifact limit reached (40 per project).");
        await consumeQuota(session, "ai");
        const artifact = await generateArtifact(
          session,
          snapshot,
          data.kind,
          data.prompt,
          data.parentId,
        );
        return save(async (project) => {
          if (project.artifacts.length >= 40)
            throw new HttpError(409, "Artifact limit reached (40 per project).");
          project.artifacts.push({
            ...artifact,
            id: randomUUID(),
            kind: data.kind,
            parentId: data.parentId,
            createdAt: new Date().toISOString(),
          });
        });
      }),
    );
  });
}
