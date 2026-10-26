import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  FileJson,
  FileText,
  FolderOpen,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { download, parsePacket, verifiedFacts } from "./domain";
import type { Packet, Page, ReviewDocument, Workspace } from "./domain";
import { Badge, Empty, Modal, SectionHeading } from "./components";
export default function Documents({
  workspace: w,
  onImport,
  go,
}: {
  workspace: Workspace;
  onImport: (packet: Packet) => void;
  go: (p: Page) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReviewDocument | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Packet | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const documents = w.packet?.documents ?? [];
  const facts = verifiedFacts(w.packet);
  const read = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (!file.name.toLowerCase().endsWith(".json"))
        throw new Error(
          "Choose a prepared review JSON file. PDF extraction is not available in this prototype.",
        );
      if (file.size > 8_000_000)
        throw new Error(
          "The review file must be smaller than 8 MB. Split larger document collections before importing.",
        );
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        throw new Error(
          "This file does not contain valid JSON. The existing documents were preserved.",
        );
      }
      let packet: Packet;
      try {
        packet = parsePacket(raw);
      } catch {
        throw new Error(
          "The file does not match the review format. Include schemaVersion 1, verifiedBy “verify_quotes.py”, source pages, and facts. Public documents need a source URL. See the import guide.",
        );
      }
      if (!packet.documents.length)
        throw new Error("The review file contains no documents.");
      if (w.packet) setPending(packet);
      else onImport(packet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read that file.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <>
      <SectionHeading
        eyebrow="THE SOURCE OF THE STORY"
        title="Document evidence"
        action={
          <button
            className="button primary"
            disabled={busy}
            onClick={() => ref.current?.click()}
          >
            <Upload size={16} />
            {busy ? "Checking evidence…" : "Import review data"}
          </button>
        }
      >
        Bring the source pages and reviewed facts into a single, traceable
        workspace.
      </SectionHeading>
      <input
        type="file"
        hidden
        ref={ref}
        accept=".json,application/json"
        aria-label="Import review JSON"
        onChange={(e) => void read(e.target.files?.[0])}
      />
      {error && (
        <div className="error-message" role="alert">
          {error}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="document-summary">
        <div>
          <FilesIcon />
          <span>
            <strong>{documents.length}</strong> source documents
          </span>
        </div>
        <div>
          <ShieldCheck size={19} />
          <span>
            <strong>{facts.length}</strong> verified quotes
          </span>
        </div>
        <div>
          <span className="small-dot amber-dot" />
          <span>
            <strong>{(w.packet?.facts.length ?? 0) - facts.length}</strong>{" "}
            unverified facts
          </span>
        </div>
        <button className="text-link push-right" onClick={() => setHelp(true)}>
          How to import
          <ArrowRight size={15} />
        </button>
      </div>
      {!documents.length ? (
        <div className="document-empty-layout">
          <section
            className="card upload-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void read(e.dataTransfer.files[0]);
            }}
          >
            <Empty
              icon={<FolderOpen size={32} />}
              title="Every observation starts with a source"
              action={
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => ref.current?.click()}
                >
                  <Upload size={16} />
                  Choose review JSON
                </button>
              }
            >
              Import a prepared review file with document pages and
              quote-verified facts. You can also drop the JSON file here.
            </Empty>
            <div className="upload-caption">
              <FileJson size={15} />
              Prepared JSON · Up to 8 MB · Synthetic or public sources
            </div>
          </section>
          <aside className="card document-checklist">
            <span className="eyebrow">A COMPLETE PICTURE</span>
            <h2>What to gather</h2>
            <p className="muted">
              Collect the records relevant to this household.
            </p>
            {[
              "Will and any codicils",
              "Revocable trust",
              "Trust amendments",
              "Beneficiary designations",
              "Account and property titles",
              "Powers of attorney",
            ].map((t) => (
              <div key={t}>
                <span className="document-check-box" />
                {t}
              </div>
            ))}
            <p className="field-hint">
              Missing documents are requests for information, not findings.
            </p>
          </aside>
        </div>
      ) : (
        <section className="card">
          <div className="table-toolbar">
            <h2>Source library</h2>
            <label className="search-field">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search documents"
                placeholder="Search documents…"
              />
            </label>
          </div>
          <div className="document-list">
            {documents
              .filter((d) =>
                `${d.title} ${d.kind}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((d) => (
                <button
                  className="document-row"
                  key={d.id}
                  onClick={() => setSelected(d)}
                >
                  <span className="document-type-icon">
                    <FileText size={22} />
                  </span>
                  <span className="document-name">
                    <strong>{d.title}</strong>
                    <small>
                      {d.kind} · {d.pages.length} source pages ·{" "}
                      {d.date || "Date not supplied"}
                    </small>
                  </span>
                  <Badge tone="neutral">
                    {d.source === "synthetic" ? "SYNTHETIC" : "PUBLIC"}
                  </Badge>
                  <span className="quote-count">
                    {facts.filter((f) => f.documentId === d.id).length} verified
                    quotes
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            {!documents.some((d) =>
              `${d.title} ${d.kind}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && (
              <Empty icon={<Search size={24} />} title="No matching documents">
                Try another title or document type.
              </Empty>
            )}
          </div>
        </section>
      )}
      <div className="evidence-explainer">
        <ShieldCheck size={21} />
        <div>
          <h3>Evidence you can inspect</h3>
          <p>
            Each fact keeps its original quote and page. Quotes are checked
            again on import. Unverified facts stay visible in the source viewer
            and are excluded from discrepancy alerts.
          </p>
        </div>
        <button className="text-link" onClick={() => go("review")}>
          Open review queue
          <ArrowRight size={16} />
        </button>
      </div>
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <div className="document-modal-meta">
            <Badge>{selected.kind}</Badge>
            <Badge tone="green">{selected.source.toUpperCase()}</Badge>
            {selected.sourceUrl && (
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                Original public source ↗
              </a>
            )}
          </div>
          <h3>Extracted facts</h3>
          {w.packet?.facts
            .filter((f) => f.documentId === selected.id)
            .map((f) => (
              <div className="evidence-quote" key={f.id}>
                <div>
                  <strong>
                    {f.field}: {f.value}
                  </strong>
                  <Badge
                    tone={facts.some((v) => v.id === f.id) ? "green" : "amber"}
                  >
                    {facts.some((v) => v.id === f.id)
                      ? "Quote verified"
                      : "Unverified"}
                  </Badge>
                </div>
                <blockquote>“{f.quote}”</blockquote>
                <span>
                  Page {f.page} · Subject:{" "}
                  {w.questionnaire.assets.find((a) => a.id === f.subjectId)
                    ?.name || f.subjectId}
                </span>
              </div>
            ))}
          {!w.packet?.facts.some((f) => f.documentId === selected.id) && (
            <p className="muted">
              No extracted facts are included for this document.
            </p>
          )}
          <h3 className="field-group">Source pages</h3>
          {selected.pages.map((p) => (
            <details className="source-page" key={p.page}>
              <summary>Page {p.page}</summary>
              <pre>{p.text}</pre>
            </details>
          ))}
        </Modal>
      )}
      {pending && (
        <Modal
          title="Replace document evidence?"
          onClose={() => setPending(null)}
        >
          <p>
            This will replace the current documents and clear review
            dispositions and notes. Questionnaire answers will remain.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() =>
                download(
                  "estate-review-workspace.json",
                  JSON.stringify(w, null, 2),
                )
              }
            >
              <ArrowDownToLine size={15} />
              Back up first
            </button>
            <button
              className="button primary"
              onClick={() => {
                onImport(pending);
                setPending(null);
              }}
            >
              Replace evidence
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="Connect prepared review data"
          onClose={() => setHelp(false)}
        >
          <p>
            This static prototype accepts precomputed evidence. It does not
            upload PDFs to a server or run an AI extraction model.
          </p>
          <ol className="guide-list">
            <li>
              <strong>Capture household assets first</strong>
              <p>
                Use each asset’s evidence reference as the fact’s subjectId. Use
                “household” for executor, trustee, or financial agent facts.
              </p>
            </li>
            <li>
              <strong>Prepare the source data</strong>
              <p>
                Include document titles, types, source labels, and page-numbered
                text from user-sourced documents. Every fact needs a value,
                verbatim quote, page, and document ID.
              </p>
            </li>
            <li>
              <strong>Verify quotes before import</strong>
              <p>
                Run <code>python3 verify_quotes.py input.json review.json</code>
                . The format is documented in README.md. No sample estate
                documents are generated.
              </p>
            </li>
            <li>
              <strong>Import and inspect</strong>
              <p>
                Quotes must match the specified page. Scanned text with
                uncertain OCR remains unverified and needs manual review.
              </p>
            </li>
          </ol>
          <button
            className="button secondary full"
            onClick={() =>
              download(
                "asset-evidence-references.json",
                JSON.stringify(
                  {
                    householdSubjectId: "household",
                    assets: w.questionnaire.assets.map((a) => ({
                      subjectId: a.id,
                      name: a.name,
                    })),
                  },
                  null,
                  2,
                ),
              )
            }
          >
            <ArrowDownToLine size={16} />
            Download asset references
          </button>
        </Modal>
      )}
    </>
  );
}
function FilesIcon() {
  return <FileText size={19} />;
}
