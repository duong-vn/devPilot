import { currentSession } from "@/lib/auth";
import { capabilities } from "@/lib/config";
import { handle, json } from "@/lib/http";
import { listProjects } from "@/lib/store";
export async function GET() {
  return handle(async () => {
    const session = await currentSession();
    return json({
      session,
      capabilities: capabilities(),
      projects: session ? await listProjects(session) : [],
    });
  });
}
