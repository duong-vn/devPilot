import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { getProject } from "@/lib/store";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () =>
    json(await getProject(await requireSession(), (await context.params).id)),
  );
}
