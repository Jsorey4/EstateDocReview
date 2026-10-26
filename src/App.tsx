import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileCheck2,
  Files,
  GitBranch,
  LayoutDashboard,
  Leaf,
  Menu,
  Plus,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  completion,
  download,
  emptyWorkspace,
  loadWorkspace,
  parsePacket,
  reconcile,
  STORAGE_KEY,
  workspaceSchema,
} from "./domain";
import type { Page, Workspace } from "./domain";
import { Badge, disclaimer, Modal } from "./components";
import Overview from "./Overview";
import Questionnaire from "./Questionnaire";
import Documents from "./Documents";
import Flow from "./Flow";
import Review from "./Review";
import Report from "./Report";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "questionnaire", label: "Questionnaire", icon: ClipboardList },
  { id: "documents", label: "Documents", icon: Files },
  { id: "flow", label: "Estate flow", icon: GitBranch },
  { id: "review", label: "Review queue", icon: FileCheck2 },
  { id: "report", label: "Review packet", icon: BookOpen },
] as const;
const currentPage = (): Page =>
  navigation.some((n) => n.id === location.hash.slice(1))
    ? (location.hash.slice(1) as Page)
    : "overview";
export default function App() {
  const [initial] = useState(loadWorkspace);
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace);
  const [page, setPage] = useState<Page>(currentPage);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<"help" | "settings" | "reset" | null>(
    null,
  );
  const [saveError, setSaveError] = useState(initial.error);
  const [storageBlocked, setStorageBlocked] = useState(!!initial.error);
  const [message, setMessage] = useState("");
  const [pendingRestore, setPendingRestore] = useState<Workspace | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const findings = reconcile(workspace.questionnaire, workspace.packet);
  const openCount = findings.filter(
    (f) => (workspace.dispositions[f.id]?.status ?? "open") === "open",
  ).length;
  const progress =
    completion(workspace.questionnaire).filter(Boolean).length * 20;
  useEffect(() => {
    const handler = () => {
      setPage(currentPage());
      setMobileOpen(false);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.title = `${navigation.find((n) => n.id === page)?.label} · Estate Review`;
    pageRef.current?.focus();
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    if (storageBlocked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      setSaveError("");
    } catch {
      setSaveError(
        "Browser storage is unavailable or full. Your changes are in this tab only. Download a backup before leaving.",
      );
    }
  }, [workspace, storageBlocked]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const go = (next: Page) => {
    location.hash = next;
    setMobileOpen(false);
  };
  const exportBackup = () =>
    download(
      "estate-review-workspace.json",
      JSON.stringify(workspace, null, 2),
    );
  const restore = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 8_000_000)
        throw new Error("Backup files must be smaller than 8 MB.");
      const next = workspaceSchema.parse(JSON.parse(await file.text()));
      if (next.packet) next.packet = parsePacket(next.packet);
      setPendingRestore(next);
      setModal(null);
    } catch (e) {
      setMessage(
        e instanceof Error && e.message.includes("8 MB")
          ? e.message
          : "This file is not a valid workspace backup. The current workspace was preserved.",
      );
    }
    if (restoreRef.current) restoreRef.current.value = "";
  };
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          pageRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <a className="brand" href="#overview">
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          <span>
            estate<span className="brand-light">review</span>
            <small>THE ADVISOR WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button
          className="household-switch"
          onClick={() => go("questionnaire")}
        >
          <span className="household-avatar">
            {workspace.questionnaire.household.slice(0, 2).toUpperCase() ||
              "NH"}
          </span>
          <span>
            {workspace.questionnaire.household || "New household"}
            <small>Texas · Estate review</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              href={`#${item.id}`}
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "review" && openCount > 0 && (
                <span className="nav-count">{openCount}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={21} />
            <strong>Built around evidence.</strong>
            <p>
              Every observation has a source.
              <br />
              Every uncertainty has a place.
            </p>
          </div>
          <button className="nav-item" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            Workspace guide
            <ArrowRight size={15} />
          </button>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Settings2 size={18} />
            Workspace settings
          </button>
          <div className="advisor">
            <span className="advisor-avatar">AD</span>
            <span>
              Advisor workspace<small>Competition prototype</small>
            </span>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="save-state">
              <span className={`online-dot ${saveError ? "warning" : ""}`} />
              {saveError ? "Not saved" : "Saved on this browser"}
            </span>
            <button
              className="icon-button"
              aria-label="Workspace guide"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={19} />
            </button>
            <div className="top-avatar">AD</div>
          </div>
        </header>
        <div className="prototype-banner">
          <ShieldCheck size={14} />
          <span>
            Prototype workspace <span className="banner-divider">/</span> Use
            synthetic or public data only. All asset amounts are hypothetical.
          </span>
          <Badge tone="green">TEXAS</Badge>
        </div>
        {saveError && (
          <div className="storage-error" role="alert">
            {saveError}
            <button onClick={exportBackup}>Download current workspace</button>
          </div>
        )}
        <main id="main-content" ref={pageRef} tabIndex={-1}>
          {page === "overview" && <Overview workspace={workspace} go={go} />}
          {page === "questionnaire" && (
            <Questionnaire
              value={workspace.questionnaire}
              onChange={(q) =>
                setWorkspace((w) => ({ ...w, questionnaire: q }))
              }
              go={go}
            />
          )}
          {page === "documents" && (
            <Documents
              workspace={workspace}
              onImport={(packet) => {
                setWorkspace((w) => ({ ...w, packet, dispositions: {} }));
                setMessage(
                  "Review data imported. Source pages and verification results are ready to inspect.",
                );
              }}
              go={go}
            />
          )}
          {page === "flow" && <Flow workspace={workspace} go={go} />}
          {page === "review" && (
            <Review
              workspace={workspace}
              onDisposition={(id, disposition) =>
                setWorkspace((w) => ({
                  ...w,
                  dispositions: { ...w.dispositions, [id]: disposition },
                }))
              }
              go={go}
            />
          )}
          {page === "report" && <Report workspace={workspace} go={go} />}
        </main>
        <footer>
          <span>
            <Leaf size={13} /> Estate Review{" "}
            <span className="footer-divider">/</span> Clarity for the next
            conversation.
          </span>
          <span>{disclaimer}</span>
        </footer>
      </div>
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "help" && (
        <Modal title="A clearer path to review" onClose={() => setModal(null)}>
          <p className="muted">
            Move from client intentions to a focused advisor conversation.
          </p>
          <ol className="guide-list">
            <li>
              <strong>Start with the questionnaire</strong>
              <p>
                Capture the household, people, assets, and intended decisions.
                Progress is saved in this browser.
              </p>
            </li>
            <li>
              <strong>Bring the supporting evidence</strong>
              <p>
                Import a prepared review JSON file containing user-sourced
                public or synthetic document pages and facts checked by
                verify_quotes.py. PDF extraction is a separate workflow.
              </p>
            </li>
            <li>
              <strong>Explore the estate flow</strong>
              <p>
                See client-reported routes and beneficiaries alongside document
                evidence. An asset route stays unconfirmed until reviewed.
              </p>
            </li>
            <li>
              <strong>Prepare the conversation</strong>
              <p>
                Review differences, inspect quote and page references, record
                follow-ups, and print an advisor review packet.
              </p>
            </li>
          </ol>
          <div className="notice">
            This browser prototype performs no AI extraction or legal analysis.
            Exact name differences are prompts for review; they are not legal
            conclusions.
          </div>
          <button
            className="button primary full"
            onClick={() => {
              setModal(null);
              go("questionnaire");
            }}
          >
            Open questionnaire
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="Workspace settings" onClose={() => setModal(null)}>
          <div className="settings-summary">
            <span>Questionnaire completion</span>
            <strong>{progress}%</strong>
          </div>
          <p className="muted">
            This workspace is stored on this browser, with no account sync.
            Export a backup to move it to another device. Use synthetic or
            public data only.
          </p>
          <button className="button secondary full" onClick={exportBackup}>
            <ArrowDownToLine size={17} />
            Download workspace backup
          </button>
          <button
            className="button secondary full"
            onClick={() => restoreRef.current?.click()}
          >
            Restore a workspace backup
          </button>
          {storageBlocked && (
            <button
              className="button secondary full"
              onClick={() =>
                download(
                  "unreadable-workspace-backup.json",
                  localStorage.getItem(STORAGE_KEY) || "",
                )
              }
            >
              Download preserved browser data
            </button>
          )}
          <div className="settings-danger">
            <strong>Start a new household</strong>
            <p>
              Clears questionnaire answers, imported evidence, and review notes
              from this browser.
            </p>
            <button className="button danger" onClick={() => setModal("reset")}>
              <Plus size={16} />
              New household
            </button>
          </div>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal title="Start a new household?" onClose={() => setModal(null)}>
          <p>
            Your current workspace will be replaced. Download a backup first if
            you need to keep it.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={exportBackup}>
              Download backup
            </button>
            <button
              className="button danger"
              onClick={() => {
                setWorkspace(emptyWorkspace());
                setStorageBlocked(false);
                setModal(null);
                go("overview");
              }}
            >
              Clear and start new
            </button>
          </div>
        </Modal>
      )}
      {pendingRestore && (
        <Modal
          title="Replace the current workspace?"
          onClose={() => setPendingRestore(null)}
        >
          <p>
            The backup will replace questionnaire answers, evidence, and review
            notes. You can save the current workspace first.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={exportBackup}>
              Download current backup
            </button>
            <button
              className="button primary"
              onClick={() => {
                setWorkspace(pendingRestore);
                setStorageBlocked(false);
                setPendingRestore(null);
                setMessage("Workspace restored.");
                go("overview");
              }}
            >
              Restore backup
            </button>
          </div>
        </Modal>
      )}
      <input
        ref={restoreRef}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Restore workspace file"
        onChange={(e) => void restore(e.target.files?.[0])}
      />
    </div>
  );
}
