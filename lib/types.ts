export type SourceFile = { path: string; content: string; language: string };
export type Chunk = { path: string; startLine: number; endLine: number; content: string };
export type Citation = Chunk & { id: number };
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
};
export type ArtifactKind = "specification" | "plan" | "review" | "tests";
export type Artifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  parentId?: string;
  createdAt: string;
  citations: Citation[];
};
export type TaskStatus = "todo" | "in_progress" | "done";
export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  planId: string;
};
export type Repository = {
  owner: string;
  name: string;
  branch: string;
  commit: string;
  indexedAt: string;
  fileCount: number;
  chunkCount: number;
  excludedCount: number;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  repository: Repository | null;
  files: SourceFile[];
  messages: Message[];
  artifacts: Artifact[];
  tasks: Task[];
};
export type ProjectSummary = Omit<Project, "files" | "messages" | "artifacts" | "tasks"> & {
  taskCount: number;
  artifactCount: number;
};
export type User = { id: string; name: string; login: string; avatar: string | null };
export type Session = { id: string; user: User; demo: boolean; expiresAt: number };
export type Capabilities = { github: boolean; ai: boolean; database: boolean; demo: boolean };
export type Bootstrap = {
  session: Session | null;
  capabilities: Capabilities;
  projects: ProjectSummary[];
};
