import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { assertSameOrigin, HttpError, handle, json, readJson } from "@/lib/http";
import { answerQuestion } from "@/lib/intelligence";
import { consumeQuota, withProjectOperation } from "@/lib/store";
export const maxDuration = 90;
const input = z.object({ message: z.string().trim().min(1).max(4000) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const { message } = input.parse(await readJson(request));
    return json(
      await withProjectOperation(session, id, async (snapshot, save) => {
        if (!snapshot.repository)
          throw new HttpError(
            409,
            "Connect and index a repository before starting a conversation.",
          );
        if (snapshot.messages.length >= 100)
          throw new HttpError(
            409,
            "Conversation limit reached (50 exchanges). Create a new project to continue.",
          );
        await consumeQuota(session, "ai");
        const answer = await answerQuestion(session, snapshot, message);
        return save(async (project) => {
          if (project.messages.length !== snapshot.messages.length)
            throw new HttpError(409, "Conversation changed. Please send your question again.");
          const createdAt = new Date().toISOString();
          project.messages.push(
            { id: randomUUID(), role: "user", content: message, citations: [], createdAt },
            { id: randomUUID(), role: "assistant", ...answer, createdAt },
          );
        });
      }),
    );
  });
}
