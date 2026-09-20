import { z } from "zod";
import type { Chunk, SourceFile } from "./types";

const repositoryPattern =
  /^(?:https:\/\/github\.com\/)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}))\/([a-zA-Z0-9_.-]{1,100}?)(?:\.git)?\/?$/;
export function parseRepository(input: string) {
  const match = repositoryPattern.exec(input.trim());
  if (!match || match[2] === "." || match[2] === "..")
    throw new Error("Enter a GitHub repository URL or owner/repository.");
  return { owner: match[1], name: match[2] };
}

const extensions = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "rb",
  "php",
  "cs",
  "c",
  "h",
  "cpp",
  "swift",
  "vue",
  "svelte",
  "css",
  "scss",
  "html",
  "md",
  "mdx",
  "json",
  "yaml",
  "yml",
  "toml",
  "sql",
  "graphql",
  "prisma",
  "sh",
]);
export function isIndexable(path: string, size: number) {
  const lower = path.toLowerCase();
  if (
    size < 0 ||
    size > 100_000 ||
    !Number.isFinite(size) ||
    path.length > 300 ||
    path.includes("\\") ||
    [...path].some((character) => character.charCodeAt(0) < 32)
  )
    return false;
  if (
    path.startsWith("/") ||
    path.split("/").some((part) => part === ".." || part === "." || !part)
  )
    return false;
  if (/(^|\/)(node_modules|vendor|dist|build|coverage|\.git|\.next)(\/|$)/.test(lower))
    return false;
  if (
    /(^|\/)\.env(?:\.|$)|secret|credential|token|(^|\/)(id_rsa|id_ed25519)|\.(pem|key|p12|pfx)$/.test(
      lower,
    )
  )
    return false;
  if (
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$|\.min\.(js|css)$/.test(
      lower,
    )
  )
    return false;
  return (
    extensions.has(lower.split(".").at(-1) ?? "") || /(^|\/)(dockerfile|makefile)$/.test(lower)
  );
}

export function chunkFiles(files: SourceFile[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const file of files) {
    if (!file.content.trim()) continue;
    const lines = file.content.split("\n");
    for (let start = 0; start < lines.length; ) {
      let end = start;
      let length = 0;
      while (
        end < lines.length &&
        end - start < 70 &&
        (length === 0 || length + lines[end].length < 6000)
      ) {
        length += lines[end].length + 1;
        end++;
      }
      chunks.push({
        path: file.path,
        startLine: start + 1,
        endLine: end,
        content: lines.slice(start, end).join("\n"),
      });
      if (end === lines.length) break;
      start = Math.max(start + 1, end - 8);
    }
  }
  return chunks;
}

function words(value: string): string[] {
  return (
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .match(/[a-z0-9_]{2,}/g) ?? []
  );
}
export function retrieve(chunks: Chunk[], query: string, limit = 6): Chunk[] {
  const terms = [...new Set(words(query))].filter(
    (term) =>
      !["the", "and", "how", "what", "does", "this", "with", "for", "are", "can"].includes(term),
  );
  if (!terms.length) return [];
  return chunks
    .map((chunk) => {
      const content = words(chunk.content);
      const path = words(chunk.path);
      const score = terms.reduce(
        (sum, term) =>
          sum +
          (path.includes(term) ? 6 : 0) +
          Math.min(content.filter((word) => word === term).length, 4),
        0,
      );
      return { chunk, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      sha: z.string(),
      size: z.number().optional(),
      mode: z.string(),
    }),
  ),
});
const metadataSchema = z.object({ default_branch: z.string(), size: z.number() });
const commitSchema = z.object({
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  commit: z.object({ tree: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }) }),
});
const blobSchema = z.object({
  encoding: z.literal("base64"),
  content: z.string(),
  size: z.number(),
});

export async function githubFetch(path: string, access: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429)
      throw new Error(
        "GitHub access is restricted or its rate limit was reached. Try again later.",
      );
    if (response.status === 404)
      throw new Error("Repository not found or your GitHub account does not have access.");
    throw new Error("GitHub is unavailable. Try again later.");
  }
  // ponytail: GitHub JSON responses are bounded to 8 MB — use streamed tree pagination for larger repositories.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GitHub returned an empty response.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8_000_000) throw new Error("GitHub response exceeds the supported size.");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}

export async function importRepository(input: string, access: string) {
  const { owner, name } = parseRepository(input);
  const base = `/repos/${owner}/${name}`;
  const metadata = metadataSchema.parse(await githubFetch(base, access));
  const commit = commitSchema.parse(
    await githubFetch(`${base}/commits/${encodeURIComponent(metadata.default_branch)}`, access),
  );
  const tree = treeSchema.parse(
    await githubFetch(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`, access),
  );
  if (tree.truncated)
    throw new Error(
      "This repository tree is too large to index safely. Connect a smaller repository.",
    );
  const candidates = tree.tree.filter(
    (entry) =>
      entry.type === "blob" &&
      entry.mode !== "120000" &&
      isIndexable(entry.path, entry.size ?? 100_001),
  );
  if (
    candidates.length > 300 ||
    candidates.reduce((total, entry) => total + (entry.size ?? 0), 0) > 2_000_000
  )
    throw new Error(
      "This version supports up to 300 source files and 2 MB of source per repository.",
    );
  const files: SourceFile[] = [];
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = await Promise.all(
      candidates.slice(i, i + 6).map(async (entry) => {
        if (!/^[a-f0-9]{40}$/.test(entry.sha))
          throw new Error("GitHub returned an invalid object identifier.");
        const blob = blobSchema.parse(await githubFetch(`${base}/git/blobs/${entry.sha}`, access));
        if (blob.size > 100_000) throw new Error("Source file exceeds indexing limit.");
        const content = Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8");
        if (
          content.includes("\0") ||
          content.includes("�") ||
          content.split("\n").some((line) => line.length > 6000)
        )
          return null;
        return { path: entry.path, content, language: entry.path.split(".").at(-1) ?? "text" };
      }),
    );
    files.push(...batch.filter((file): file is SourceFile => file !== null));
  }
  if (!files.length) throw new Error("No supported source files were found in this repository.");
  const chunks = chunkFiles(files);
  if (chunks.length > 1200) throw new Error("Repository exceeds the 1,200 chunk limit.");
  return {
    files,
    chunks,
    repository: {
      owner,
      name,
      branch: metadata.default_branch,
      commit: commit.sha,
      indexedAt: new Date().toISOString(),
      fileCount: files.length,
      chunkCount: chunks.length,
      excludedCount: tree.tree.filter((entry) => entry.type === "blob").length - files.length,
    },
  };
}
