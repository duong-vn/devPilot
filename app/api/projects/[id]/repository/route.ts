import { z } from "zod";
import { githubAccess, requireSession } from "@/lib/auth";
import { attachSample } from "@/lib/demo";
import { assertSameOrigin, HttpError, handle, json, readJson } from "@/lib/http";
import { embedChunks } from "@/lib/intelligence";
import { importRepository, parseRepository } from "@/lib/repository";
import { consumeQuota, withProjectOperation } from "@/lib/store";
export const maxDuration = 300;
const input = z.object({ repository: z.string().trim().min(1).max(200) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const { repository } = input.parse(await readJson(request));
    try {
      parseRepository(repository);
    } catch {
      throw new HttpError(400, "Enter a GitHub repository URL or owner/repository.");
    }
    return json(
      await withProjectOperation(session, id, async (snapshot, save) => {
        if (snapshot.repository)
          throw new HttpError(
            409,
            "This project already has a repository. Create a new project for another source snapshot.",
          );
        await consumeQuota(session, "import");
        if (session.demo)
          return save(async (draft) => {
            attachSample(draft);
          });
        if (!process.env.OPENAI_API_KEY)
          throw new HttpError(
            503,
            "Configure the AI provider before indexing. Source embeddings are required for semantic search.",
          );
        const access = await githubAccess(session);
        let imported: Awaited<ReturnType<typeof importRepository>>;
        try {
          imported = await importRepository(repository, access);
        } catch (error) {
          if (
            error instanceof Error &&
            /^(Enter a GitHub|GitHub |Repository not found|This repository|This version|No supported|Source file|Repository exceeds)/.test(
              error.message,
            )
          )
            throw new HttpError(422, error.message);
          throw error;
        }
        const embeddings = await embedChunks(imported.chunks);
        return save(async (draft) => {
          if (draft.repository) throw new HttpError(409, "This project already has a repository.");
          draft.files = imported.files;
          draft.repository = imported.repository;
          return { chunks: imported.chunks, embeddings };
        });
      }),
    );
  });
}
