import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { capabilities } from "./config";
import { seal, sessionDigest, unseal } from "./crypto";
import { db } from "./db";
import { sessions, users } from "./db/schema";
import { attachSample, cleanupDemo, demoSessions, newProject } from "./demo";
import { HttpError } from "./http";
import type { Session, User } from "./types";

const cookieName = "devpilot_session";
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function currentSession(): Promise<Session | null> {
  const raw = (await cookies()).get(cookieName)?.value;
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const id = sessionDigest(raw);
  cleanupDemo();
  const demo = demoSessions.get(id);
  if (demo && capabilities().demo) return demo.session;
  if (!process.env.DATABASE_URL) return null;
  const result = await db()
    .select({ id: sessions.id, user: users.profile, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = result[0];
  return row
    ? { id: row.id, user: row.user, expiresAt: row.expiresAt.getTime(), demo: false }
    : null;
}
export async function requireSession() {
  const session = await currentSession();
  if (!session) throw new HttpError(401, "Your session has expired. Sign in to continue.");
  return session;
}
export function createDemo(response: NextResponse) {
  if (!capabilities().demo) throw new HttpError(404, "Demo mode is disabled.");
  cleanupDemo();
  if (demoSessions.size >= 100)
    throw new HttpError(429, "The demo is at capacity. Please try again later.");
  const raw = randomBytes(32).toString("base64url");
  const id = sessionDigest(raw);
  const session: Session = {
    id,
    user: { id: randomUUID(), name: "Demo developer", login: "demo", avatar: null },
    demo: true,
    expiresAt: Date.now() + 3_600_000,
  };
  const project = attachSample(
    newProject(
      "Orbit",
      "A sample TypeScript task service. Explore authentication, ownership, and task workflows.",
    ),
  );
  demoSessions.set(id, { session, projects: new Map([[project.id, project]]), requests: [] });
  response.cookies.set(cookieName, raw, { ...cookieOptions, maxAge: 3600 });
}
export async function createSession(user: User, access: string, response: NextResponse) {
  const raw = randomBytes(32).toString("base64url");
  const encrypted = seal(access, process.env.SESSION_ENCRYPTION_KEY ?? "");
  await db().transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: user.id, profile: user })
      .onConflictDoUpdate({ target: users.id, set: { profile: user } });
    await tx.insert(sessions).values({
      id: sessionDigest(raw),
      userId: user.id,
      access: encrypted,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
  });
  response.cookies.set(cookieName, raw, { ...cookieOptions, maxAge: 7 * 86_400 });
}
export async function githubAccess(session: Session) {
  if (session.demo) throw new HttpError(400, "Demo sessions cannot access GitHub.");
  const [row] = await db()
    .select({ access: sessions.access })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, session.id),
        eq(sessions.userId, session.user.id),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(401, "Sign in again to reconnect GitHub.");
  return unseal(row.access, process.env.SESSION_ENCRYPTION_KEY ?? "");
}
export async function logout(response: NextResponse) {
  const raw = (await cookies()).get(cookieName)?.value;
  if (raw) {
    const id = sessionDigest(raw);
    if (!demoSessions.delete(id) && process.env.DATABASE_URL)
      await db().delete(sessions).where(eq(sessions.id, id));
  }
  response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
}
