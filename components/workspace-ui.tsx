"use client";

import { Code2, FileCode2, LoaderCircle, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import type { Citation, SourceFile } from "@/lib/types";
import { sourceLines } from "./workspace-helpers";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Code2 aria-hidden="true" size={22} />
      </span>
      {!compact && (
        <span>
          DevPilot<span className="brand-period">.</span>
        </span>
      )}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="loading">
      <LoaderCircle className="spin" size={18} aria-hidden="true" />
      {label}
    </span>
  );
}

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    (
      dialog?.querySelector<HTMLElement>("[data-initial-focus]") ??
      dialog?.querySelector<HTMLElement>("button")
    )?.focus();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? " dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Citations({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}) {
  if (!citations.length) return null;
  return (
    <nav className="citations" aria-label="Source citations">
      {citations.map((citation) => (
        <button
          className="citation"
          type="button"
          key={`${citation.id}-${citation.path}-${citation.startLine}-${citation.endLine}`}
          onClick={() => onOpen(citation)}
          title={`Open ${citation.path}, lines ${citation.startLine}–${citation.endLine}`}
        >
          <FileCode2 size={14} aria-hidden="true" />
          <span>
            [{citation.id}] {citation.path}
          </span>
          <span className="citation-lines">
            L{citation.startLine}–{citation.endLine}
          </span>
        </button>
      ))}
    </nav>
  );
}

export function SourceViewer({
  citation,
  files,
  onClose,
}: {
  citation: Citation;
  files: SourceFile[];
  onClose: () => void;
}) {
  const selected = useRef<HTMLSpanElement>(null);
  const file = files.find((item) => item.path === citation.path);
  useEffect(() => {
    if (citation) {
      selected.current?.focus({ preventScroll: true });
      selected.current?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [citation]);
  return (
    <Dialog title="Source viewer" onClose={onClose} wide>
      <div className="source-toolbar">
        <span>
          <FileCode2 size={17} aria-hidden="true" /> <strong>{citation.path}</strong>
        </span>
        <span className="badge">{file?.language ?? "Excerpt"}</span>
      </div>
      <p className="source-caption">
        Citation [{citation.id}] · Lines {citation.startLine}–{citation.endLine}
        {!file && " · Only the cited excerpt is available."}
      </p>
      <section
        className="source-code"
        aria-label={`Source code for ${citation.path}. Cited lines are highlighted.`}
      >
        <pre>
          <code>
            {sourceLines(files, citation).map((line) => (
              <span
                key={line.number}
                ref={line.number === citation.startLine ? selected : undefined}
                tabIndex={line.number === citation.startLine ? -1 : undefined}
                className={`code-line${line.highlighted ? " cited-line" : ""}`}
              >
                <span className="line-number" aria-hidden="true">
                  {line.number}
                </span>
                <span>
                  {line.text || " "}
                  {"\n"}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </section>
      <div className="dialog-footer">
        <span className="muted">Read-only indexed snapshot</span>
        <button type="button" className="button secondary" onClick={onClose}>
          Close source
        </button>
      </div>
    </Dialog>
  );
}
