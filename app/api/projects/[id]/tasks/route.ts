import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { assertSameOrigin, HttpError, handle, json, readJson } from "@/lib/http";
import { generateTasks } from "@/lib/intelligence";
import { consumeQuota, mutateProject, withProjectOperation } from "@/lib/store";
export const maxDuration = 90;
const createInput = z.object({ planId: z.string().uuid() }).strict();
const updateInput = z
  .object({ taskId: z.string().uuid(), status: z.enum(["todo", "in_progress", "done"]) })
  .strict();
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const { planId } = createInput.parse(await readJson(request));
    return json(
      await withProjectOperation(session, id, async (snapshot, save) => {
        if (snapshot.tasks.length >= 120)
          throw new HttpError(409, "Task limit reached (120 per project).");
        await consumeQuota(session, "ai");
        const tasks = await generateTasks(session, snapshot, planId);
        return save(async (project) => {
          if (project.tasks.some((task) => task.planId === planId))
            throw new HttpError(409, "Tasks already exist for this plan.");
          if (project.tasks.length + tasks.length > 120)
            throw new HttpError(409, "Task limit reached (120 per project).");
          project.tasks.push(...tasks);
        });
      }),
    );
  });
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const data = updateInput.parse(await readJson(request));
    await consumeQuota(session, "mutation");
    return json(
      await mutateProject(session, id, async (project) => {
        const task = project.tasks.find((item) => item.id === data.taskId);
        if (!task) throw new HttpError(404, "Task not found.");
        task.status = data.status;
      }),
    );
  });
}
