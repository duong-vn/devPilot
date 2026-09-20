import { randomUUID } from "node:crypto";
import { chunkFiles } from "./repository";
import type { Project, Session, SourceFile } from "./types";

export const sampleFiles: SourceFile[] = [
  {
    path: "README.md",
    language: "md",
    content:
      "# Orbit — sample task service\n\nThis fictional repository demonstrates DevPilot without external services.\n\n## Architecture\nA small TypeScript service separates session authentication, task operations, and validation.\nThe API checks the session before reading or changing tasks.\nTasks belong to a user and may be todo, in_progress, or done.\n\n## Testing\nThe repository includes an example ownership regression test.\nThis sample is not connected to GitHub and has not been executed by DevPilot.\n",
  },
  {
    path: "src/auth.ts",
    language: "ts",
    content:
      "export type Session = { userId: string; expiresAt: number };\n\nexport function authenticate(session: Session | null, now = Date.now()) {\n  if (!session || session.expiresAt <= now) {\n    throw new Error('Authentication required');\n  }\n  return { id: session.userId };\n}\n",
  },
  {
    path: "src/tasks.ts",
    language: "ts",
    content:
      "export type Task = {\n  id: string;\n  ownerId: string;\n  title: string;\n  status: 'todo' | 'in_progress' | 'done';\n};\n\nexport function listTasks(tasks: Task[], userId: string) {\n  return tasks.filter((task) => task.ownerId === userId);\n}\n\nexport function updateTask(tasks: Task[], id: string, userId: string, status: Task['status']) {\n  const task = tasks.find((item) => item.id === id && item.ownerId === userId);\n  if (!task) throw new Error('Task not found');\n  return tasks.map((item) => item.id === id ? { ...item, status } : item);\n}\n",
  },
  {
    path: "src/api.ts",
    language: "ts",
    content:
      "import { authenticate, type Session } from './auth';\nimport { listTasks, type Task } from './tasks';\n\nexport function getTasks(session: Session | null, tasks: Task[]) {\n  const user = authenticate(session);\n  return { tasks: listTasks(tasks, user.id) };\n}\n",
  },
  {
    path: "tests/tasks.test.ts",
    language: "ts",
    content:
      "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { listTasks } from '../src/tasks';\n\ntest('tasks are scoped to their owner', () => {\n  const tasks = [{ id: '1', ownerId: 'alice', title: 'Ship feature', status: 'todo' as const }];\n  assert.deepEqual(listTasks(tasks, 'bob'), []);\n  assert.equal(listTasks(tasks, 'alice').length, 1);\n});\n",
  },
];

type DemoEntry = {
  session: Session;
  projects: Map<string, Project>;
  requests: { kind: string; time: number }[];
};
const globalDemo = globalThis as typeof globalThis & {
  devpilotDemo?: Map<string, DemoEntry>;
  devpilotLocks?: Map<string, Promise<unknown>>;
  devpilotOperations?: Map<string, { leaseId: string; expiresAt: number }>;
};
globalDemo.devpilotDemo ??= new Map<string, DemoEntry>();
globalDemo.devpilotLocks ??= new Map<string, Promise<unknown>>();
export const demoSessions = globalDemo.devpilotDemo;
export const demoLocks = globalDemo.devpilotLocks;
globalDemo.devpilotOperations ??= new Map<string, { leaseId: string; expiresAt: number }>();
export const demoOperations = globalDemo.devpilotOperations;

export function newProject(name: string, description: string): Project {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    repository: null,
    files: [],
    messages: [],
    artifacts: [],
    tasks: [],
  };
}
export function attachSample(project: Project) {
  project.files = structuredClone(sampleFiles);
  project.repository = {
    owner: "sample",
    name: "orbit",
    branch: "main",
    commit: "demo-snapshot",
    indexedAt: new Date().toISOString(),
    fileCount: sampleFiles.length,
    chunkCount: chunkFiles(sampleFiles).length,
    excludedCount: 0,
  };
  return project;
}
export function cleanupDemo() {
  for (const [id, entry] of demoSessions)
    if (entry.session.expiresAt <= Date.now()) demoSessions.delete(id);
}
