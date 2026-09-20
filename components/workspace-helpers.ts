import type { Citation, Project, ProjectSummary, SourceFile } from "@/lib/types";

export function summarizeProject(project: Project): ProjectSummary {
  const { files: _files, messages: _messages, artifacts, tasks, ...summary } = project;
  return { ...summary, taskCount: tasks.length, artifactCount: artifacts.length };
}

export function sourceLines(files: SourceFile[], citation: Citation) {
  const file = files.find((candidate) => candidate.path === citation.path);
  const firstLine = file ? 1 : citation.startLine;
  return (file?.content ?? citation.content).split("\n").map((text, index) => ({
    number: firstLine + index,
    text,
    highlighted: firstLine + index >= citation.startLine && firstLine + index <= citation.endLine,
  }));
}

export function repositoryInput(value: string): string | null {
  const input = value.trim();
  const match =
    /^(?:https:\/\/github\.com\/)?([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\/([a-zA-Z0-9_.-]+)\/?$/.exec(
      input,
    );
  if (!match || match[2] === "." || match[2] === "..") return null;
  return `${match[1]}/${match[2].replace(/\.git$/, "")}`;
}
