import { randomUUID } from "node:crypto";
import { and, cosineDistance, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { chunks, operations, projects, usage } from "./db/schema";
import { demoLocks, demoOperations, demoSessions, newProject } from "./demo";
import { HttpError } from "./http";
import type { Chunk, Project, ProjectSummary, Session } from "./types";

type IndexUpdate = { chunks: Chunk[]; embeddings: number[][] };
function entry(session: Session) {
  const result = demoSessions.get(session.id);
  if (!result || result.session.expiresAt <= Date.now())
    throw new HttpError(401, "Demo session expired. Start a new demo.");
  return result;
}
function summary(project: Project): ProjectSummary {
  const { files: _files, messages: _messages, artifacts, tasks, ...rest } = project;
  return { ...rest, taskCount: tasks.length, artifactCount: artifacts.length };
}
export async function listProjects(session: Session) {
  const values = session.demo
    ? [...entry(session).projects.values()]
    : (
        await db()
          .select({ data: projects.data })
          .from(projects)
          .where(eq(projects.ownerId, session.user.id))
      ).map((row) => row.data);
  return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary);
}
export async function createProject(session: Session, name: string, description: string) {
  const project = newProject(name, description);
  if (session.demo) {
    const current = entry(session);
    if (current.projects.size >= 8)
      throw new HttpError(409, "Demo project limit reached (8 projects).");
    current.projects.set(project.id, project);
  } else {
    await db().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${session.user.id}))`);
      const existing = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.ownerId, session.user.id));
      if (existing.length >= 50) throw new HttpError(409, "Project limit reached (50 projects).");
      await tx.insert(projects).values({ id: project.id, ownerId: session.user.id, data: project });
    });
  }
  return structuredClone(project);
}
export async function getProject(session: Session, id: string): Promise<Project> {
  const project = session.demo
    ? entry(session).projects.get(id)
    : (
        await db()
          .select({ data: projects.data })
          .from(projects)
          .where(and(eq(projects.id, id), eq(projects.ownerId, session.user.id)))
          .limit(1)
      )[0]?.data;
  if (!project) throw new HttpError(404, "Project not found.");
  return structuredClone(project);
}
export async function mutateProject(
  session: Session,
  id: string,
  action: (project: Project) => Promise<IndexUpdate | undefined> | Promise<void>,
  leaseId?: string,
) {
  if (session.demo) {
    const key = `${session.id}:${id}`;
    const previous = demoLocks.get(key) ?? Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(async () => {
        const draft = await getProject(session, id);
        if (leaseId) {
          const lease = demoOperations.get(key);
          if (lease?.leaseId !== leaseId || lease.expiresAt <= Date.now())
            throw new HttpError(409, "Operation expired. Please try again.");
        }
        await action(draft);
        draft.updatedAt = new Date().toISOString();
        entry(session).projects.set(id, draft);
        return structuredClone(draft);
      });
    demoLocks.set(key, pending);
    try {
      return await pending;
    } finally {
      if (demoLocks.get(key) === pending) demoLocks.delete(key);
    }
  }
  // ponytail: serialize per-project updates in one transaction — use queued jobs for large asynchronous indexes.
  return db().transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    const [row] = await tx
      .select({ data: projects.data })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, session.user.id)))
      .for("update");
    if (!row) throw new HttpError(404, "Project not found.");
    if (leaseId) {
      const [lease] = await tx
        .select()
        .from(operations)
        .where(and(eq(operations.projectId, id), eq(operations.leaseId, leaseId)))
        .for("update");
      if (!lease || lease.expiresAt.getTime() <= Date.now())
        throw new HttpError(409, "Operation expired. Please try again.");
    }
    const draft = row.data;
    const update = await action(draft);
    draft.updatedAt = new Date().toISOString();
    if (update) {
      if (update.chunks.length !== update.embeddings.length)
        throw new Error("Embedding count mismatch");
      await tx.delete(chunks).where(eq(chunks.projectId, id));
      for (let start = 0; start < update.chunks.length; start += 40) {
        await tx.insert(chunks).values(
          update.chunks.slice(start, start + 40).map((chunk, i) => ({
            id: randomUUID(),
            projectId: id,
            ...chunk,
            embedding: update.embeddings[start + i],
          })),
        );
      }
    }
    await tx
      .update(projects)
      .set({ data: draft })
      .where(and(eq(projects.id, id), eq(projects.ownerId, session.user.id)));
    return draft;
  });
}
export async function withProjectOperation<T>(
  session: Session,
  id: string,
  action: (
    snapshot: Project,
    save: (
      update: (project: Project) => Promise<IndexUpdate | undefined> | Promise<void>,
    ) => Promise<Project>,
  ) => Promise<T>,
): Promise<T> {
  await getProject(session, id);
  const leaseId = randomUUID();
  const key = `${session.id}:${id}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  if (session.demo) {
    const existing = demoOperations.get(key);
    if (existing && existing.expiresAt > Date.now())
      throw new HttpError(409, "Another operation is in progress for this project.");
    demoOperations.set(key, { leaseId, expiresAt: expiresAt.getTime() });
  } else {
    const claimed = await db()
      .insert(operations)
      .values({ projectId: id, leaseId, expiresAt })
      .onConflictDoUpdate({
        target: operations.projectId,
        set: { leaseId, expiresAt },
        setWhere: sql`${operations.expiresAt} <= now()`,
      })
      .returning({ leaseId: operations.leaseId });
    if (!claimed.length)
      throw new HttpError(409, "Another operation is in progress for this project.");
  }
  try {
    return await action(await getProject(session, id), (update) =>
      mutateProject(session, id, update, leaseId),
    );
  } finally {
    if (session.demo) {
      if (demoOperations.get(key)?.leaseId === leaseId) demoOperations.delete(key);
    } else {
      try {
        await db()
          .delete(operations)
          .where(and(eq(operations.projectId, id), eq(operations.leaseId, leaseId)));
      } catch {
        console.error("Operation reservation cleanup failed; lease will expire automatically.");
      }
    }
  }
}

export async function semanticSearch(
  session: Session,
  projectId: string,
  embedding: number[],
): Promise<Chunk[]> {
  if (session.demo) return [];
  const distance = cosineDistance(chunks.embedding, embedding);
  const rows = await db()
    .select({
      path: chunks.path,
      startLine: chunks.startLine,
      endLine: chunks.endLine,
      content: chunks.content,
      distance,
    })
    .from(chunks)
    .innerJoin(projects, eq(chunks.projectId, projects.id))
    .where(and(eq(projects.ownerId, session.user.id), eq(chunks.projectId, projectId)))
    .orderBy(distance)
    .limit(6);
  return rows
    .filter((row) => Number(row.distance) < 0.85)
    .map(({ distance: _distance, ...chunk }) => chunk);
}
export async function consumeQuota(session: Session, kind: "ai" | "import" | "mutation") {
  const maximum = kind === "import" ? 6 : kind === "ai" ? 30 : 120;
  const now = Date.now();
  if (session.demo) {
    const current = entry(session);
    current.requests = current.requests.filter((request) => request.time > now - 3_600_000);
    if (current.requests.filter((request) => request.kind === kind).length >= maximum)
      throw new HttpError(429, "Session request limit reached. Please try again later.");
    current.requests.push({ kind, time: now });
    return;
  }
  const bucket = Math.floor(now / 3_600_000);
  const id = `${session.user.id}:${kind}:${bucket}`;
  const [result] = await db()
    .insert(usage)
    .values({ id, count: 1, expiresAt: new Date((bucket + 1) * 3_600_000) })
    .onConflictDoUpdate({ target: usage.id, set: { count: sql`${usage.count} + 1` } })
    .returning({ count: usage.count });
  if (result.count > maximum)
    throw new HttpError(429, "Hourly request limit reached. Please try again later.");
}
