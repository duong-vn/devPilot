"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  Code2,
  FileCode2,
  FileText,
  FlaskConical,
  Folder,
  FolderOpen,
  GitBranch,
  Github,
  Layers3,
  ListTodo,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Artifact, ArtifactKind, Bootstrap, Citation, Project, TaskStatus } from "@/lib/types";
import { repositoryInput, summarizeProject } from "./workspace-helpers";
import { Brand, Citations, Dialog, SourceViewer, Spinner } from "./workspace-ui";

type View = "projects" | "chat" | "planning" | "reviews" | "settings";
type Modal = "project" | "repository" | null;
const navigation = [
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "chat", label: "Codebase chat", icon: MessageSquare },
  { id: "planning", label: "Specs & plans", icon: Layers3 },
  { id: "reviews", label: "Reviews & tests", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
const kindLabels: Record<ArtifactKind, string> = {
  specification: "Specification",
  plan: "Implementation plan",
  review: "Code review",
  tests: "Test draft",
};
const statusLabels: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  signal: AbortSignal,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestError(
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status}). Please try again.`,
      response.status,
    );
  if (data === null)
    throw new RequestError(
      "The server returned an empty response. Please try again.",
      response.status,
    );
  return data as T;
}

export function Workspace() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>("projects");
  const [project, setProject] = useState<Project | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [citation, setCitation] = useState<Citation | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [artifactKind, setArtifactKind] = useState<ArtifactKind>("specification");
  const [parentId, setParentId] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const messageEnd = useRef<HTMLDivElement>(null);

  const expire = useCallback(() => {
    controller.current?.abort();
    setBootstrap((current) => (current ? { ...current, session: null, projects: [] } : null));
    setProject(null);
    setModal(null);
    setCitation(null);
    setPending(null);
    setError(
      "Your session has expired. Sign in again to continue. Demo work is temporary and may no longer be available.",
    );
  }, []);

  const begin = useCallback((label: string) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setPending(label);
    setError("");
    setAnnouncement("");
    return next;
  }, []);

  const fail = useCallback(
    (reason: unknown, current: AbortController) => {
      if (current.signal.aborted) return;
      if (reason instanceof RequestError && reason.status === 401) {
        expire();
        return;
      }
      setError(
        reason instanceof Error ? reason.message : "Something went wrong. Please try again.",
      );
    },
    [expire],
  );

  const load = useCallback(async () => {
    const current = begin("Loading workspace");
    setBooting(true);
    try {
      const data = await request<Bootstrap>("/api/bootstrap", current.signal);
      if (!current.signal.aborted) {
        setBootstrap(data);
        setError(new URLSearchParams(window.location.search).get("authError") ?? "");
      }
    } catch (reason) {
      fail(reason, current);
    } finally {
      if (!current.signal.aborted) {
        setBooting(false);
        setPending(null);
      }
    }
  }, [begin, fail]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!bootstrap?.session) return;
    const remaining = bootstrap.session.expiresAt - Date.now();
    const timer = window.setTimeout(expire, Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [bootstrap?.session, expire]);
  const messageCount = project?.messages.length ?? 0;
  useEffect(() => {
    if (view === "chat" && messageCount > 0)
      messageEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messageCount, view]);

  const acceptProject = (next: Project) => {
    setProject(next);
    setBootstrap((current) =>
      current
        ? {
            ...current,
            projects: [
              summarizeProject(next),
              ...current.projects.filter((item) => item.id !== next.id),
            ],
          }
        : current,
    );
  };
  const navigate = (next: View) => {
    controller.current?.abort();
    setPending(null);
    setError("");
    setModal(null);
    setCitation(null);
    setView(next);
    setPrompt("");
    setParentId("");
    setSelectedArtifact(null);
    setArtifactKind(next === "reviews" ? "review" : "specification");
  };
  const openProject = async (id: string) => {
    navigate("chat");
    setProject(null);
    setMessage("");
    const current = begin("Opening project");
    try {
      const next = await request<Project>(
        `/api/projects/${encodeURIComponent(id)}`,
        current.signal,
      );
      if (!current.signal.aborted) {
        acceptProject(next);
        setAnnouncement(`${next.name} opened.`);
      }
    } catch (reason) {
      fail(reason, current);
    } finally {
      if (!current.signal.aborted) setPending(null);
    }
  };
  const mutate = async (
    label: string,
    path: string,
    body: unknown,
    method = "POST",
    onSuccess?: (next: Project) => void,
  ) => {
    const current = begin(label);
    try {
      const next = await request<Project>(path, current.signal, method, body);
      if (!current.signal.aborted) {
        acceptProject(next);
        setAnnouncement(`${label} complete.`);
        onSuccess?.(next);
      }
    } catch (reason) {
      fail(reason, current);
    } finally {
      if (!current.signal.aborted) setPending(null);
    }
  };
  const startDemo = async () => {
    const current = begin("Starting demo");
    try {
      await request<unknown>("/api/auth/demo", current.signal, "POST");
      if (!current.signal.aborted) {
        setView("projects");
        await load();
      }
    } catch (reason) {
      fail(reason, current);
    } finally {
      if (!current.signal.aborted) setPending(null);
    }
  };
  const logout = async () => {
    const current = begin("Signing out");
    try {
      await request<{ ok: boolean }>("/api/auth/logout", current.signal, "POST");
      if (!current.signal.aborted) {
        setProject(null);
        setView("projects");
        await load();
      }
    } catch (reason) {
      fail(reason, current);
    } finally {
      if (!current.signal.aborted) setPending(null);
    }
  };
  const closeModal = () => {
    controller.current?.abort();
    setPending(null);
    setError("");
    setModal(null);
  };
  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!name) {
      setError("Enter a project name.");
      return;
    }
    void mutate("Creating project", "/api/projects", { name, description }, "POST", () => {
      setModal(null);
      setView("chat");
      setMessage("");
    });
  };
  const connectRepository = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project) return;
    const repository = repositoryInput(
      String(new FormData(event.currentTarget).get("repository") ?? ""),
    );
    if (!repository) {
      setError("Enter a GitHub owner/repository or an https://github.com/owner/repository URL.");
      return;
    }
    void mutate(
      "Indexing repository",
      `/api/projects/${encodeURIComponent(project.id)}/repository`,
      { repository },
      "POST",
      () => setModal(null),
    );
  };
  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project || !message.trim()) return;
    void mutate(
      "Writing response",
      `/api/projects/${encodeURIComponent(project.id)}/chat`,
      { message: message.trim() },
      "POST",
      () => setMessage(""),
    );
  };
  const generateArtifact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project || !prompt.trim()) return;
    void mutate(
      "Generating draft",
      `/api/projects/${encodeURIComponent(project.id)}/artifacts`,
      { kind: artifactKind, prompt: prompt.trim(), ...(parentId ? { parentId } : {}) },
      "POST",
      (next) => {
        const added = next.artifacts.find(
          (item) => !project.artifacts.some((old) => old.id === item.id),
        );
        if (added) setSelectedArtifact(added.id);
        setPrompt("");
      },
    );
  };

  const session = bootstrap?.session;
  const canGenerate = Boolean(session?.demo || bootstrap?.capabilities.ai);
  const connected = Boolean(project?.repository);
  const busy = pending !== null;
  const displayedProjects =
    bootstrap?.projects.filter((item) =>
      `${item.name} ${item.description} ${item.repository?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const visibleArtifacts =
    project?.artifacts.filter((item) =>
      view === "reviews"
        ? item.kind === "review" || item.kind === "tests"
        : item.kind === "specification" || item.kind === "plan",
    ) ?? [];
  const activeArtifact =
    visibleArtifacts.find((item) => item.id === selectedArtifact) ??
    visibleArtifacts[visibleArtifacts.length - 1];
  const alert = error ? (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss error"
        onClick={() => setError("")}
      >
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  ) : null;

  if (booting)
    return (
      <main className="boot-screen">
        <Brand />
        <Spinner label="Opening your workspace…" />
      </main>
    );
  if (!session)
    return (
      <div className="landing">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <header className="landing-nav">
          <Brand />
          <span className="muted">A little more context. A lot more clarity.</span>
          <a className="button secondary" href="/api/auth/github">
            <Github size={17} aria-hidden="true" />
            Sign in with GitHub
          </a>
        </header>
        <main id="main-content" className="landing-main">
          {alert}
          <div className="landing-grid">
            <section className="landing-copy">
              <h1>
                Know your code.
                <br />
                <span>Build what’s next.</span>
              </h1>
              <p>
                From the first question to the next pull request. Bring your repository,
                conversations, and implementation plans into one thoughtful workspace.
              </p>
              <div className="landing-actions">
                <a className="button primary" href="/api/auth/github">
                  <Github size={18} aria-hidden="true" />
                  Continue with GitHub
                  <ArrowUpRight size={17} aria-hidden="true" />
                </a>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy || bootstrap?.capabilities.demo === false}
                  onClick={() => void startDemo()}
                >
                  {busy ? (
                    <Spinner label="Starting demo…" />
                  ) : (
                    <>
                      Explore the demo
                      <ArrowRight size={17} aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
              <p className="fine-print">
                Demo uses an ephemeral sample repository and deterministic, non-AI responses. Work
                lasts only until the session or process expires.
              </p>
              {bootstrap?.capabilities.github === false && (
                <p className="notice">
                  GitHub sign-in is not configured on this deployment. Try the demo if available.
                </p>
              )}
              {bootstrap?.capabilities.demo === false && (
                <p className="notice">Demo access is disabled on this deployment.</p>
              )}
              {!bootstrap && (
                <button className="text-button" type="button" onClick={() => void load()}>
                  Retry connection
                </button>
              )}
            </section>
            <section className="landing-preview" aria-label="How DevPilot works">
              <div className="preview-top">
                <span>
                  <Code2 size={17} aria-hidden="true" />
                  Your next change, with context
                </span>
                <span className="badge">The workflow</span>
              </div>
              <div className="workflow-step">
                <span className="workflow-symbol">
                  <GitBranch size={21} aria-hidden="true" />
                </span>
                <div>
                  <h2>Start with your repository</h2>
                  <p>A read-only snapshot. The context you need, without switching tabs.</p>
                  <span className="workflow-label">GitHub repository</span>
                </div>
              </div>
              <div className="workflow-connector">
                <ArrowDown size={17} aria-hidden="true" />
              </div>
              <div className="workflow-step">
                <span className="workflow-symbol">
                  <MessageSquare size={21} aria-hidden="true" />
                </span>
                <div>
                  <h2>Ask. Follow the source.</h2>
                  <p>Understand the answer and the code behind it with file and line citations.</p>
                  <span className="workflow-label">Answers grounded in code</span>
                </div>
              </div>
              <div className="workflow-connector">
                <ArrowDown size={17} aria-hidden="true" />
              </div>
              <div className="workflow-step">
                <span className="workflow-symbol">
                  <CheckCheck size={21} aria-hidden="true" />
                </span>
                <div>
                  <h2>Turn context into a plan</h2>
                  <p>Shape a specification, break down the work, and review your next move.</p>
                  <span className="workflow-label">Specifications · Plans · Tasks</span>
                </div>
              </div>
              <div className="preview-bottom">
                <ShieldCheck size={16} aria-hidden="true" />
                You choose which repository to share.
              </div>
            </section>
          </div>
          <footer className="landing-footer">
            <span>Built for the work between idea and implementation.</span>
            <span>DevPilot · Your codebase, connected</span>
          </footer>
        </main>
        <div className="sr-only" role="status">
          {pending ?? announcement}
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <button
          type="button"
          className="brand-link"
          aria-label="DevPilot projects"
          onClick={() => navigate("projects")}
        >
          <Brand />
        </button>
        <div className="workspace-label">
          <span className="workspace-avatar">{session.user.name.slice(0, 1).toUpperCase()}</span>
          <span>
            Personal workspace
            <small>{session.demo ? "Demo environment" : `@${session.user.login}`}</small>
          </span>
        </div>
        <nav aria-label="Main navigation" className="main-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item${view === id ? " active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {id === "projects" && <span className="nav-count">{bootstrap.projects.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-projects">
          <div className="sidebar-section-heading">
            <span>Your projects</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Create project"
              onClick={() => {
                setError("");
                setModal("project");
              }}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          {bootstrap.projects.slice(0, 5).map((item) => (
            <button
              type="button"
              key={item.id}
              className={`sidebar-project${project?.id === item.id ? " selected" : ""}`}
              onClick={() => void openProject(item.id)}
            >
              <span className="project-dot" />
              <span>{item.name}</span>
            </button>
          ))}
          {!bootstrap.projects.length && (
            <p className="sidebar-empty">A home for your next idea.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="context-note">
            <BookOpen size={18} aria-hidden="true" />
            <strong>Good code starts with context.</strong>
            <p>Keep the why close to the work.</p>
          </div>
          <button type="button" className="profile-button" onClick={() => navigate("settings")}>
            <span className="user-avatar">{session.user.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{session.user.name}</strong>
              <small>{session.demo ? "Demo session" : "GitHub connected"}</small>
            </span>
            <Settings2 size={17} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{navigation.find((item) => item.id === view)?.label}</strong>
            {project && view !== "projects" && view !== "settings" && (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span className="breadcrumb-project">{project.name}</span>
              </>
            )}
          </div>
          <span className={`session-label${session.demo ? " demo" : ""}`}>
            <span className="status-dot" />
            {session.demo ? "Demo workspace" : "GitHub session"}
          </span>
        </header>
        {session.demo && (
          <div className="demo-banner">
            <FlaskConical size={16} aria-hidden="true" />
            <span>
              <strong>Demo mode.</strong> Sample repository · Deterministic, non-AI responses ·
              Temporary work until session or process expiry.
            </span>
          </div>
        )}
        <main id="main-content" className={`main-content view-${view}`}>
          {!modal && alert}
          {view === "projects" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>
                    Your projects<span className="heading-dot">.</span>
                  </h1>
                  <p>A little context for everything you’re building.</p>
                </div>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setError("");
                    setModal("project");
                  }}
                >
                  <Plus size={18} aria-hidden="true" />
                  New project
                </button>
              </div>
              <section className="workspace-intro">
                <div className="intro-content">
                  <span className="intro-icon">
                    <Terminal size={23} aria-hidden="true" />
                  </span>
                  <div>
                    <h2>From codebase to clear next steps.</h2>
                    <p>Connect a repository. Ask better questions. Make a plan you can build on.</p>
                  </div>
                </div>
                <span className="intro-decoration" aria-hidden="true">
                  <Code2 size={62} strokeWidth={1} />
                </span>
              </section>
              <div className="list-toolbar">
                <h2>
                  All projects <span className="inline-count">{bootstrap.projects.length}</span>
                </h2>
                <label className="search-field">
                  <Search size={17} aria-hidden="true" />
                  <span className="sr-only">Search projects</span>
                  <input
                    type="search"
                    placeholder="Search projects…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              {displayedProjects.length ? (
                <div className="project-grid">
                  {displayedProjects.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="project-card"
                      onClick={() => void openProject(item.id)}
                    >
                      <div className="project-card-top">
                        <span className="project-icon">
                          <Folder size={23} aria-hidden="true" />
                        </span>
                        <span className={`badge${item.repository ? " connected" : ""}`}>
                          {item.repository ? (
                            <>
                              <Check size={12} aria-hidden="true" />
                              Indexed
                            </>
                          ) : (
                            "Not connected"
                          )}
                        </span>
                      </div>
                      <h3>{item.name}</h3>
                      <p>{item.description || "A fresh space for your next change."}</p>
                      <div className="repo-name">
                        <GitBranch size={14} aria-hidden="true" />
                        <span>
                          {item.repository
                            ? `${item.repository.owner}/${item.repository.name}`
                            : "Connect a GitHub repository"}
                        </span>
                      </div>
                      <div className="project-card-bottom">
                        <span>
                          {item.artifactCount} {item.artifactCount === 1 ? "artifact" : "artifacts"}
                          <span className="separator">·</span>
                          {item.taskCount} {item.taskCount === 1 ? "task" : "tasks"}
                        </span>
                        <ArrowUpRight size={18} aria-hidden="true" />
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="new-project-card"
                    onClick={() => {
                      setError("");
                      setModal("project");
                    }}
                  >
                    <Plus size={25} aria-hidden="true" />
                    <strong>Make room for your next idea</strong>
                    <span>Create a project</span>
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <FolderOpen size={32} aria-hidden="true" />
                  <h2>{search ? "No matching projects" : "Your next project starts here"}</h2>
                  <p>
                    {search
                      ? "Try another name or clear your search."
                      : "Create a project, then connect a repository to give your work context."}
                  </p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => (search ? setSearch("") : setModal("project"))}
                  >
                    {search ? "Clear search" : "Create your first project"}
                  </button>
                </div>
              )}
              <p className="page-footnote">
                <ShieldCheck size={15} aria-hidden="true" />
                Your repositories stay read-only. DevPilot never pushes changes.
              </p>
            </>
          )}
          {view !== "projects" && view !== "settings" && !project && (
            <div className="empty-state">
              {busy ? (
                <Spinner label="Opening project…" />
              ) : (
                <>
                  <FolderOpen size={32} aria-hidden="true" />
                  <h1>Choose your context</h1>
                  <p>Open a project to explore its code, create plans, or review a change.</p>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => navigate("projects")}
                  >
                    Browse projects
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          )}
          {project && view !== "projects" && view !== "settings" && (
            <>
              <div className="page-heading project-heading">
                <div>
                  <h1>
                    {view === "chat"
                      ? "A conversation with your code."
                      : view === "planning"
                        ? "Good ideas. Clear next steps."
                        : "A second look before you ship."}
                  </h1>
                  <p>
                    {view === "chat"
                      ? "Ask a question. Get context you can trace to the source."
                      : view === "planning"
                        ? "Turn a specification into a plan, and a plan into work."
                        : "Generate review notes and test drafts grounded in your repository."}
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => navigate("projects")}
                >
                  <FolderOpen size={16} aria-hidden="true" />
                  Switch project
                </button>
              </div>
              <div className="repository-strip">
                <GitBranch size={17} aria-hidden="true" />
                <strong>
                  {project.repository
                    ? `${project.repository.owner}/${project.repository.name}`
                    : project.name}
                </strong>
                {project.repository ? (
                  <>
                    <span className="badge">{project.repository.branch}</span>
                    <span className="muted">{project.repository.fileCount} files indexed</span>
                    <span className="snapshot-label">
                      Snapshot {project.repository.commit.slice(0, 7)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="muted">No repository connected</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setError("");
                        setModal("repository");
                      }}
                    >
                      Connect repository
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
              {!connected && (
                <div className="notice">
                  Connect a repository to enable chat and generation. Source content is sent to the
                  configured AI provider outside demo mode.
                </div>
              )}
              {!canGenerate && (
                <div className="notice">
                  AI is not configured on this deployment. Existing content remains available; ask
                  your administrator to configure the provider.
                </div>
              )}
              {view === "chat" && (
                <div className="chat-layout">
                  <section className="chat-panel" aria-label="Codebase conversation">
                    <div className="panel-heading">
                      <h2>
                        <MessageSquare size={17} aria-hidden="true" />
                        Codebase chat
                      </h2>
                      <span className="muted">
                        {session.demo ? "Sample responses" : "Grounded in your source"}
                      </span>
                    </div>
                    <div
                      className="messages"
                      role="log"
                      aria-label="Conversation"
                      aria-live="polite"
                    >
                      {!project.messages.length && (
                        <div className="chat-empty">
                          <span className="chat-empty-icon">
                            <Sparkles size={28} aria-hidden="true" />
                          </span>
                          <h2>Let’s find the bigger picture.</h2>
                          <p>
                            Understand how things fit together, find an entry point, or explore the
                            impact of a change.
                          </p>
                          <div className="suggestions">
                            {[
                              "How is this codebase organized?",
                              "Walk me through the main user flow.",
                              "Where should I add a new feature?",
                            ].map((question) => (
                              <button
                                type="button"
                                key={question}
                                disabled={!connected || !canGenerate || busy}
                                onClick={() => {
                                  setMessage(question);
                                  document.getElementById("chat-message")?.focus();
                                }}
                              >
                                {question}
                                <ArrowUpRight size={14} aria-hidden="true" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {project.messages.map((item) => (
                        <article key={item.id} className={`message message-${item.role}`}>
                          <span className={`message-avatar ${item.role}`}>
                            {item.role === "assistant" ? (
                              <Code2 size={18} aria-hidden="true" />
                            ) : (
                              session.user.name.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <div className="message-body">
                            <div className="message-meta">
                              <strong>{item.role === "assistant" ? "DevPilot" : "You"}</strong>
                              {item.role === "assistant" && session.demo && (
                                <span className="badge">Demo · Non-AI</span>
                              )}
                            </div>
                            <div className="prose">{item.content}</div>
                            <Citations citations={item.citations} onOpen={setCitation} />
                          </div>
                        </article>
                      ))}
                      {pending === "Writing response" && (
                        <div className="response-loading">
                          <Spinner
                            label={
                              session.demo ? "Preparing sample response…" : "Reading your codebase…"
                            }
                          />
                        </div>
                      )}
                      <div ref={messageEnd} />
                    </div>
                    <form className="chat-composer" onSubmit={sendMessage}>
                      <label htmlFor="chat-message">Ask your codebase</label>
                      <div className="composer-input">
                        <textarea
                          id="chat-message"
                          placeholder={
                            connected
                              ? "What would you like to understand?"
                              : "Connect a repository to get started"
                          }
                          rows={2}
                          maxLength={8000}
                          value={message}
                          disabled={!connected || !canGenerate}
                          onChange={(event) => setMessage(event.target.value)}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              (event.metaKey || event.ctrlKey) &&
                              !busy &&
                              message.trim()
                            ) {
                              event.preventDefault();
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                        />
                        <button
                          type="submit"
                          className="send-button"
                          disabled={busy || !connected || !canGenerate || !message.trim()}
                          aria-label="Send message"
                        >
                          <Send size={19} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="composer-note">
                        <span>
                          {session.demo
                            ? "Deterministic sample responses, not AI."
                            : "AI can make mistakes. Follow the citations and verify."}
                        </span>
                        <span>Ctrl / ⌘ + Enter</span>
                      </div>
                    </form>
                  </section>
                  <aside className="context-panel">
                    <div className="panel-heading">
                      <h2>
                        <FileCode2 size={17} aria-hidden="true" />
                        Repository context
                      </h2>
                    </div>
                    {project.repository ? (
                      <>
                        <div className="context-summary">
                          <span className="badge connected">
                            <Check size={12} aria-hidden="true" />
                            Indexed snapshot
                          </span>
                          <p>
                            {project.repository.fileCount} files available to explore. Select a file
                            or an answer’s citation to inspect the source.
                          </p>
                        </div>
                        <ul className="file-list">
                          {project.files.map((file) => (
                            <li key={file.path}>
                              <button
                                type="button"
                                onClick={() =>
                                  setCitation({
                                    id: 0,
                                    path: file.path,
                                    content: file.content,
                                    startLine: 1,
                                    endLine: 1,
                                  })
                                }
                              >
                                <FileCode2 size={15} aria-hidden="true" />
                                <span>{file.path}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {!project.files.length && (
                          <p className="context-summary muted">
                            No source files available in this snapshot.
                          </p>
                        )}
                        <div className="context-bottom">
                          <ShieldCheck size={15} aria-hidden="true" />
                          <span>
                            {project.repository.excludedCount} files excluded during indexing.
                            Sensitive filenames are filtered.
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="context-summary">
                        <p>Your repository’s files will appear here after indexing.</p>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => setModal("repository")}
                        >
                          Connect repository
                        </button>
                      </div>
                    )}
                  </aside>
                </div>
              )}
              {(view === "planning" || view === "reviews") && (
                <>
                  <div className="artifact-layout">
                    <section className="artifact-sidebar">
                      <h2>{view === "planning" ? "Shape the work" : "Check your thinking"}</h2>
                      <form className="artifact-form" onSubmit={generateArtifact}>
                        <label htmlFor="artifact-kind">Draft type</label>
                        <select
                          id="artifact-kind"
                          value={artifactKind}
                          onChange={(event) => {
                            setArtifactKind(event.target.value as ArtifactKind);
                            setParentId("");
                          }}
                          disabled={busy}
                        >
                          {(view === "planning"
                            ? (["specification", "plan"] as const)
                            : (["review", "tests"] as const)
                          ).map((kind) => (
                            <option value={kind} key={kind}>
                              {kindLabels[kind]}
                            </option>
                          ))}
                        </select>
                        <label htmlFor="artifact-parent">
                          Build on an artifact <span className="muted">(optional)</span>
                        </label>
                        <select
                          id="artifact-parent"
                          value={parentId}
                          disabled={busy}
                          onChange={(event) => setParentId(event.target.value)}
                        >
                          <option value="">Start from repository context</option>
                          {project.artifacts.map((item) => (
                            <option key={item.id} value={item.id}>
                              {kindLabels[item.kind]}: {item.title}
                            </option>
                          ))}
                        </select>
                        <label htmlFor="artifact-prompt">
                          {view === "planning"
                            ? "What are you building?"
                            : "What should we look at?"}
                        </label>
                        <textarea
                          id="artifact-prompt"
                          rows={5}
                          maxLength={8000}
                          placeholder={
                            view === "planning"
                              ? "Describe the change, intended behavior, and constraints…"
                              : "Describe the feature, edge cases, or code you want to examine…"
                          }
                          value={prompt}
                          disabled={busy || !connected || !canGenerate}
                          onChange={(event) => setPrompt(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="button primary"
                          disabled={busy || !connected || !canGenerate || !prompt.trim()}
                        >
                          {pending === "Generating draft" ? (
                            <Spinner label="Generating…" />
                          ) : (
                            <>
                              <Sparkles size={16} aria-hidden="true" />
                              Generate {artifactKind === "tests" ? "test draft" : artifactKind}
                            </>
                          )}
                        </button>
                        <p className="fine-print">
                          {view === "reviews"
                            ? "Drafts are suggestions, not executed tests or verified results. Review them before use."
                            : "Drafts stay in your workspace. Nothing is committed to your repository."}
                        </p>
                      </form>
                      <div className="artifact-list-heading">
                        <h3>Saved drafts</h3>
                        <span className="inline-count">{visibleArtifacts.length}</span>
                      </div>
                      <div className="artifact-list">
                        {visibleArtifacts.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            className={activeArtifact?.id === item.id ? "selected" : ""}
                            aria-pressed={activeArtifact?.id === item.id}
                            onClick={() => setSelectedArtifact(item.id)}
                          >
                            <FileText size={17} aria-hidden="true" />
                            <span>
                              <strong>{item.title}</strong>
                              <small>{kindLabels[item.kind]}</small>
                            </span>
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        ))}
                        {!visibleArtifacts.length && (
                          <p className="muted">Your drafts will appear here.</p>
                        )}
                      </div>
                    </section>
                    <section className="artifact-document" aria-label="Selected artifact">
                      {activeArtifact ? (
                        <ArtifactDocument
                          artifact={activeArtifact}
                          demo={session.demo}
                          busy={busy}
                          hasTasks={project.tasks.some((task) => task.planId === activeArtifact.id)}
                          onCitation={setCitation}
                          onTasks={() =>
                            void mutate(
                              "Creating tasks",
                              `/api/projects/${encodeURIComponent(project.id)}/tasks`,
                              { planId: activeArtifact.id },
                            )
                          }
                        />
                      ) : (
                        <div className="empty-state">
                          <FileText size={32} aria-hidden="true" />
                          <h2>
                            {view === "planning"
                              ? "A blank page, with context."
                              : "Make room for a second opinion."}
                          </h2>
                          <p>
                            {view === "planning"
                              ? "Describe your next change to create a specification or implementation plan grounded in your code."
                              : "Choose a code review or test draft, then describe what matters. Generated tests are not run automatically."}
                          </p>
                        </div>
                      )}
                    </section>
                  </div>
                  {view === "planning" && (
                    <section className="task-section">
                      <div className="list-toolbar">
                        <h2>
                          <ListTodo size={20} aria-hidden="true" />
                          Implementation tasks{" "}
                          <span className="inline-count">{project.tasks.length}</span>
                        </h2>
                        <span className="muted">Created from your plans</span>
                      </div>
                      {project.tasks.length ? (
                        <div className="task-list">
                          {project.tasks.map((task) => (
                            <div className="task-row" key={task.id}>
                              {task.status === "done" ? (
                                <CheckCheck size={19} className="task-done" aria-hidden="true" />
                              ) : (
                                <Circle size={18} aria-hidden="true" />
                              )}
                              <div>
                                <h3>{task.title}</h3>
                                <p>{task.description}</p>
                                <small>
                                  Plan:{" "}
                                  {project.artifacts.find((item) => item.id === task.planId)
                                    ?.title ?? task.planId}
                                </small>
                              </div>
                              <label className="task-status">
                                <span className="sr-only">Status for {task.title}</span>
                                <select
                                  value={task.status}
                                  disabled={busy}
                                  onChange={(event) =>
                                    void mutate(
                                      "Updating task",
                                      `/api/projects/${encodeURIComponent(project.id)}/tasks`,
                                      { taskId: task.id, status: event.target.value },
                                      "PATCH",
                                    )
                                  }
                                >
                                  {Object.entries(statusLabels).map(([status, label]) => (
                                    <option key={status} value={status}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="task-empty">
                          <ListTodo size={22} aria-hidden="true" />
                          <div>
                            <h3>Make your plan actionable.</h3>
                            <p>
                              Generate an implementation plan, then choose “Create tasks” to break
                              it into trackable work.
                            </p>
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Your workspace, explained.</h1>
                  <p>Account, capabilities, and where your code goes.</p>
                </div>
              </div>
              <div className="settings-layout">
                <section className="settings-section">
                  <h2>Account & session</h2>
                  <dl className="settings-list">
                    <div>
                      <dt>Signed in as</dt>
                      <dd>
                        {session.user.name} <span className="muted">@{session.user.login}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Session type</dt>
                      <dd>{session.demo ? "Demo · Ephemeral" : "GitHub"}</dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>{new Date(session.expiresAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Storage</dt>
                      <dd>
                        {session.demo
                          ? "Temporary sample workspace"
                          : bootstrap.capabilities.database
                            ? "Database configured"
                            : "Temporary process storage"}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void logout()}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    {pending === "Signing out" ? "Signing out…" : "Sign out"}
                  </button>
                </section>
                <section className="settings-section">
                  <h2>Deployment capabilities</h2>
                  <dl className="settings-list">
                    {[
                      ["GitHub sign-in", bootstrap.capabilities.github],
                      ["AI generation", bootstrap.capabilities.ai],
                      ["Persistent database", bootstrap.capabilities.database],
                      ["Demo access", bootstrap.capabilities.demo],
                    ].map(([label, enabled]) => (
                      <div key={String(label)}>
                        <dt>{label}</dt>
                        <dd className={`badge${enabled ? " connected" : ""}`}>
                          {enabled ? (
                            <Check size={13} aria-hidden="true" />
                          ) : (
                            <Circle size={12} aria-hidden="true" />
                          )}
                          {enabled ? "Configured" : "Not configured"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="fine-print">
                    Configuration is managed on the server. Secrets are never editable or displayed
                    in this workspace.
                  </p>
                </section>
                <section className="settings-section privacy-section">
                  <ShieldCheck size={24} aria-hidden="true" />
                  <div>
                    <h2>Your source, your decision.</h2>
                    <p>
                      Connecting a repository creates a read-only, immutable snapshot. Outside demo
                      mode, source content is sent to the configured AI provider when you use
                      generation features.
                    </p>
                    <p>
                      Indexing filters sensitive filenames and is limited to 300 files / 2 MB.
                      Filtering is not a guarantee: check your repository for secrets before
                      connecting it. Create a new project to index a different snapshot.
                    </p>
                    {session.demo && (
                      <p>
                        <strong>This is a demo.</strong> Repository connections load sample code,
                        never contact GitHub, and return deterministic, non-AI responses. Work is
                        ephemeral until your session or the server process expires.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>Less context switching. More forward motion.</span>
          <span>
            <Code2 size={14} aria-hidden="true" />
            DevPilot
          </span>
        </footer>
      </div>
      {modal === "project" && (
        <Dialog title="A new place to build" onClose={closeModal}>
          <form onSubmit={createProject} className="dialog-form">
            <p className="muted">Give your work a name. You can connect a repository next.</p>
            {alert}
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              name="name"
              data-initial-focus
              required
              maxLength={80}
              placeholder="e.g. Customer portal"
              disabled={busy}
            />
            <label htmlFor="project-description">
              Description <span className="muted">(optional)</span>
            </label>
            <textarea
              id="project-description"
              name="description"
              rows={3}
              maxLength={1000}
              placeholder="What are you working on?"
              disabled={busy}
            />
            <div className="dialog-footer">
              <button className="button secondary" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? (
                  <Spinner label="Creating…" />
                ) : (
                  <>
                    Create project
                    <ArrowRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal === "repository" && (
        <Dialog
          title={session.demo ? "Load the sample repository" : "Connect your repository"}
          onClose={closeModal}
        >
          <form onSubmit={connectRepository} className="dialog-form">
            {alert}
            <p className="muted">
              {session.demo
                ? "Demo connections always load the sample repository. No GitHub request is made."
                : "Index a read-only snapshot of a GitHub repository you have access to."}
            </p>
            <label htmlFor="repository">GitHub repository</label>
            <input
              id="repository"
              name="repository"
              data-initial-focus
              required
              maxLength={300}
              defaultValue={session.demo ? "sample/orbit" : ""}
              placeholder="owner/repository or GitHub URL"
              disabled={busy}
              aria-describedby="repository-disclosure"
            />
            <div id="repository-disclosure" className="repository-disclosure">
              <ShieldCheck size={19} aria-hidden="true" />
              <div>
                <strong>Know what you’re sharing.</strong>
                <p>
                  {session.demo
                    ? "This demo uses ephemeral sample code and deterministic, non-AI responses."
                    : "Source content is sent to the configured AI provider for chat and artifact generation."}{" "}
                  Sensitive filenames are filtered. Indexing is limited to 300 files / 2 MB.
                </p>
                <p>
                  Filtering cannot detect every secret. Review your source first. The indexed
                  snapshot cannot be replaced; create a new project for another snapshot.
                </p>
              </div>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" required disabled={busy} />I understand how this repository
              will be used.
            </label>
            <div className="dialog-footer">
              <button className="button secondary" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? (
                  <Spinner label="Indexing…" />
                ) : (
                  <>
                    <GitBranch size={16} aria-hidden="true" />
                    {session.demo ? "Load sample" : "Connect & index"}
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {citation && project && (
        <SourceViewer citation={citation} files={project.files} onClose={() => setCitation(null)} />
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {pending ?? announcement}
      </div>
    </div>
  );
}

function ArtifactDocument({
  artifact,
  demo,
  busy,
  hasTasks,
  onCitation,
  onTasks,
}: {
  artifact: Artifact;
  demo: boolean;
  busy: boolean;
  hasTasks: boolean;
  onCitation: (citation: Citation) => void;
  onTasks: () => void;
}) {
  return (
    <>
      <div className="document-heading">
        <div>
          <span className="badge">
            {kindLabels[artifact.kind]} · {demo ? "Demo draft" : "AI draft"}
          </span>
          <h2>{artifact.title}</h2>
          <p className="muted">
            {new Date(artifact.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        {artifact.kind === "plan" && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || hasTasks}
            onClick={onTasks}
          >
            <ListTodo size={16} aria-hidden="true" />
            {hasTasks ? "Tasks created" : "Create tasks"}
          </button>
        )}
      </div>
      {(artifact.kind === "tests" || artifact.kind === "review") && (
        <div className="notice">
          <FlaskConical size={16} aria-hidden="true" />
          {artifact.kind === "tests"
            ? "Generated test draft. These tests have not been executed."
            : "Generated review notes. Findings require human verification."}
        </div>
      )}
      <div className="prose artifact-prose">{artifact.content}</div>
      <Citations citations={artifact.citations} onOpen={onCitation} />
    </>
  );
}
