import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileCheck2,
  MessageSquare,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Disposition, Finding, Page, Workspace } from "./domain";
import { backendFindings, money, reviewItems, verifiedFacts } from "./domain";
import { Badge, Empty, SectionHeading } from "./components";
export default function Review({
  workspace: w,
  onDisposition,
  go,
}: {
  workspace: Workspace;
  onDisposition: (id: string, disposition: Disposition) => void;
  go: (p: Page) => void;
}) {
  const [filter, setFilter] = useState("All items");
  const [query, setQuery] = useState("");
  const findings = reviewItems(w);
  const backend = backendFindings(w);
  const filtered = findings.filter(
    (f) =>
      (filter === "All items" ||
        (filter === "Unresolved"
          ? f.type === "unresolved"
          : filter === "To discuss"
            ? (w.dispositions[f.id]?.status ?? "open") === "open"
            : w.dispositions[f.id]?.status === "attorney")) &&
      `${f.title} ${f.subject} ${f.observation}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const unverified =
    (w.packet?.facts.length ?? 0) - verifiedFacts(w.packet).length;
  return (
    <>
      <SectionHeading
        eyebrow="MAKE ROOM FOR THE RIGHT QUESTIONS"
        title="The review queue"
        action={
          <button className="button secondary" onClick={() => go("report")}>
            Prepare review packet
            <ArrowRight size={16} />
          </button>
        }
      >
        Evidence-backed observations, clear uncertainties, and a thoughtful next
        step.
      </SectionHeading>
      <div className="review-stats">
        <div>
          <span className="review-stat-icon amber-icon">
            <MessageSquare size={21} />
          </span>
          <strong>
            {
              findings.filter(
                (f) => (w.dispositions[f.id]?.status ?? "open") === "open",
              ).length
            }
          </strong>
          <span>to discuss</span>
        </div>
        <div>
          <span className="review-stat-icon blue-icon">
            <FileCheck2 size={21} />
          </span>
          <strong>
            {findings.filter((f) => f.type === "unresolved").length}
          </strong>
          <span>unresolved records</span>
        </div>
        <div>
          <span className="review-stat-icon">
            <ShieldCheck size={21} />
          </span>
          <strong>{unverified}</strong>
          <span>unverified · excluded</span>
        </div>
      </div>
      {w.backend && (
        <div className="notice review-source" role="note">
          Includes {backend.shown.length} finding
          {backend.shown.length === 1 ? "" : "s"} from the reconciliation rules
          (reconcile.py, {w.backend.source}), listed first, then the
          browser&rsquo;s name comparisons.
          {backend.withheld > 0 &&
            ` ${backend.withheld} withheld because their cited quotes are not verified in the current documents.`}
          {backend.stale &&
            " The questionnaire has changed since these findings were computed; they reflect the answers as packaged and are not recomputed in the browser."}
        </div>
      )}
      <div className="review-toolbar">
        <div className="segmented">
          {["All items", "To discuss", "Unresolved", "Attorney follow-up"].map(
            (label) => (
              <button
                key={label}
                className={filter === label ? "selected" : ""}
                aria-pressed={filter === label}
                onClick={() => setFilter(label)}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an item…"
            aria-label="Search review items"
          />
        </label>
      </div>
      {!filtered.length ? (
        <section className="card">
          <Empty
            icon={<FileCheck2 size={32} />}
            title={
              findings.length
                ? "No items match this view"
                : w.backend
                  ? "No material findings"
                  : w.packet
                    ? "No supported name discrepancies found"
                    : "Good questions start with good evidence"
            }
            action={
              <button
                className="button primary"
                onClick={() =>
                  findings.length
                    ? (setFilter("All items"), setQuery(""))
                    : go(w.packet ? "flow" : "documents")
                }
              >
                {findings.length
                  ? "Show all items"
                  : w.packet
                    ? "Explore estate flow"
                    : "Connect document evidence"}
                <ArrowRight size={16} />
              </button>
            }
          >
            {findings.length
              ? "Change the filter or search to see more items."
              : w.backend
                ? "The reconciliation rules found nothing material in the verified facts, and the name comparison found no differences. This is not a determination that the plan is complete or suitable."
                : w.packet
                  ? "This comparison checks names for matching subjects and roles. Missing data, legal interpretation, and unverified facts have not been evaluated."
                  : "After you capture household intentions and import verified document facts, supported differences will appear here. An empty queue is not a completed review."}
          </Empty>
        </section>
      ) : (
        <div className="findings-list">
          {filtered.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              workspace={w}
              disposition={w.dispositions[f.id] ?? { status: "open", note: "" }}
              onChange={(d) => onDisposition(f.id, d)}
            />
          ))}
        </div>
      )}
      <section className="card discussion-prompts">
        <span className="eyebrow">BEYOND THE CHECKLIST</span>
        <h2>Advisor discussion prompts</h2>
        <p className="muted">
          Use these open questions to uncover missing context. They are not
          findings or recommendations.
        </p>
        <div className="prompt-grid">
          {[
            "Have any intentions changed since these documents were signed?",
            "Are there later amendments or designations we have not seen?",
            "Who can confirm the current ownership and beneficiary records?",
          ].map((text, i) => (
            <div key={text}>
              <span>0{i + 1}</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
        {w.questionnaire.concerns && (
          <div className="client-concern">
            <strong>From the questionnaire</strong>
            <p>{w.questionnaire.concerns}</p>
          </div>
        )}
      </section>
    </>
  );
}
function FindingCard({
  finding: f,
  workspace: w,
  disposition: d,
  onChange,
}: {
  finding: Finding;
  workspace: Workspace;
  disposition: Disposition;
  onChange: (d: Disposition) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <article className={`card finding-card ${f.type}`}>
      <div className="finding-header">
        <span className="finding-indicator">
          <MessageSquare size={20} />
        </span>
        <div>
          <div className="finding-meta">
            <Badge tone={f.type === "unresolved" ? "blue" : "amber"}>
              {f.type === "unresolved"
                ? "Unresolved precedence"
                : "Confirm with client"}
            </Badge>
            <span>{f.subject}</span>
            {f.amount ? <span>{money(f.amount)} hypothetical</span> : null}
          </div>
          <h2>{f.title}</h2>
        </div>
        <button
          className="icon-button push-right"
          aria-label={open ? "Collapse observation" : "Expand observation"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={19} className={open ? "rotated" : ""} />
        </button>
      </div>
      <p className="finding-observation">{f.observation}</p>
      {open && (
        <>
          <div className="comparison">
            {f.origin === "reconcile" ? (
              <div className="intention-panel">
                <span className="eyebrow">QUESTIONNAIRE ANSWER</span>
                {f.questionnaireEvidence?.length ? (
                  f.questionnaireEvidence.map((line) => (
                    <p key={line}>{line}</p>
                  ))
                ) : (
                  <p>No questionnaire answer is part of this observation.</p>
                )}
              </div>
            ) : (
              <div className="intention-panel">
                <span className="eyebrow">QUESTIONNAIRE INTENTION</span>
                <strong>{f.expected || "Not supplied"}</strong>
                <p>
                  Reported by {w.questionnaire.respondent || "the respondent"}
                </p>
              </div>
            )}
            <div className="source-panel">
              <span className="eyebrow">SUPPORTING DOCUMENT EVIDENCE</span>
              {f.facts.map((fact) => (
                <div className="evidence-quote" key={fact.id}>
                  <blockquote>“{fact.quote}”</blockquote>
                  <small>
                    {
                      w.packet?.documents.find(
                        (doc) => doc.id === fact.documentId,
                      )?.title
                    }{" "}
                    · Page {fact.page}
                  </small>
                  <span className="verified-label">
                    <Check size={12} />
                    Quote verified
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="finding-context">
            <div>
              <span className="eyebrow">WHAT REMAINS UNCERTAIN</span>
              <p>{f.uncertainty}</p>
            </div>
            <div>
              <span className="eyebrow">THE NEXT QUESTION</span>
              <p>{f.question}</p>
            </div>
          </div>
          <div className="finding-actions">
            <label className="field">
              <span>Follow-up status</span>
              <select
                value={d.status}
                onChange={(e) =>
                  onChange({
                    ...d,
                    status: e.target.value as Disposition["status"],
                  })
                }
              >
                <option value="open">To discuss</option>
                <option value="discussed">Discussed with client</option>
                <option value="attorney">Attorney follow-up</option>
              </select>
            </label>
            <label className="field note-field">
              <span>Advisor notes</span>
              <textarea
                rows={2}
                value={d.note}
                onChange={(e) => onChange({ ...d, note: e.target.value })}
                placeholder="Capture the conversation, owner, or follow-up…"
              />
            </label>
          </div>
        </>
      )}
    </article>
  );
}
