import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  FileSearch,
  FileText,
  Files,
  FolderInput,
  GitCompareArrows,
  MessageSquare,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";
import { ISSUE_LABELS, citedFact, describeValue, money } from "./domain";
import type {
  BackendFinding,
  Evidence,
  Packet,
  Page,
  Workspace,
} from "./domain";
import { Badge, Empty, Modal, SectionHeading, disclaimer } from "./components";
import {
  fetchBundle,
  fetchManifest,
  highlight,
  replaySteps,
  shownFindings,
  verificationStats,
} from "./samples";
import type { Manifest, SampleBundle, StepId } from "./samples";

const STEP_ICONS: Record<StepId, typeof Files> = {
  documents: Files,
  extraction: FileSearch,
  verification: ShieldCheck,
  reconciliation: GitCompareArrows,
  findings: MessageSquare,
  evaluation: BarChart3,
};
const AUTOPLAY_MS = 6000;
const MEMORY_KEY = "estate-review.replay";
type Memory = { variant?: string; step?: number };
const remembered = (): Memory => {
  try {
    return JSON.parse(sessionStorage.getItem(MEMORY_KEY) || "{}") as Memory;
  } catch {
    return {};
  }
};
const remember = (m: Memory) => {
  try {
    sessionStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    // Per-tab convenience only.
  }
};
type Load<T> =
  | { status: "loading" }
  | { status: "none" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };
type SourceView = { doc: string; page: number; quote?: string };
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "n/a" : `${Math.round(n * 1000) / 10}%`;
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "The sample could not be loaded.";

export default function Replay({
  workspace,
  onOpen,
  go,
}: {
  workspace: Workspace;
  onOpen: (bundle: SampleBundle, source: string) => void;
  go: (p: Page) => void;
}) {
  const [memory] = useState(remembered);
  const [manifest, setManifest] = useState<Load<Manifest>>({
    status: "loading",
  });
  const [variant, setVariant] = useState(memory.variant ?? "");
  const [bundle, setBundle] = useState<Load<SampleBundle>>({
    status: "loading",
  });
  const [step, setStep] = useState(memory.step ?? 0);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<SourceView | null>(null);
  const [confirm, setConfirm] = useState(false);
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    fetchManifest()
      .then((m) => {
        if (!live) return;
        if (!m || !m.samples.length) return setManifest({ status: "none" });
        setManifest({ status: "ready", data: m });
        setVariant((v) =>
          m.samples.some((s) => s.id === v) ? v : m.samples[0].id,
        );
      })
      .catch(
        (e) => live && setManifest({ status: "error", message: errorText(e) }),
      );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (manifest.status !== "ready") return;
    const entry = manifest.data.samples.find((s) => s.id === variant);
    if (!entry) return;
    let live = true;
    setBundle({ status: "loading" });
    fetchBundle(entry)
      .then((b) => live && setBundle({ status: "ready", data: b }))
      .catch(
        (e) => live && setBundle({ status: "error", message: errorText(e) }),
      );
    return () => {
      live = false;
    };
  }, [manifest, variant]);

  const steps = bundle.status === "ready" ? replaySteps(bundle.data) : [];
  const current = Math.min(step, Math.max(steps.length - 1, 0));
  useEffect(() => remember({ variant, step: current }), [variant, current]);
  useEffect(() => {
    // Center the current step in the stepper without scrolling the page.
    const el = currentRef.current;
    const list = el?.closest("ol");
    if (!el || !list) return;
    const a = el.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    list.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [current, bundle.status]);
  useEffect(() => {
    if (!playing || !steps.length) return;
    if (current >= steps.length - 1) return setPlaying(false);
    const timer = setTimeout(() => setStep(current + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, current, steps.length]);

  const goTo = (n: number, stop = true) => {
    if (stop) setPlaying(false);
    setStep(Math.max(0, Math.min(n, steps.length - 1)));
  };
  const onStepperKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") goTo(current + 1);
    else if (e.key === "ArrowLeft") goTo(current - 1);
    else if (e.key === "Home") goTo(0);
    else if (e.key === "End") goTo(steps.length - 1);
    else return;
    e.preventDefault();
  };
  const open = () => {
    if (bundle.status !== "ready") return;
    onOpen(
      bundle.data,
      manifest.status === "ready"
        ? `sample ${bundle.data.id}, run ${manifest.data.run}`
        : `sample ${bundle.data.id}`,
    );
    setConfirm(false);
  };
  const workspaceInUse =
    !!workspace.packet || !!workspace.questionnaire.household.trim();

  if (manifest.status === "loading")
    return (
      <>
        <Heading />
        <p className="muted" role="status">
          Loading samples…
        </p>
      </>
    );
  if (manifest.status === "none")
    return (
      <>
        <Heading />
        <section className="card">
          <Empty
            icon={<FolderInput size={30} />}
            title="No sample runs published yet"
          >
            Samples are precomputed pipeline runs on synthetic households. Run
            extraction and reconciliation on the variants, then package them
            with <code>bridge/build_replay_samples.py</code> into{" "}
            <code>public/samples/</code>. The page reads those files and makes no
            API call.
          </Empty>
          <pre className="replay-command">
            .venv/bin/python -m bridge.build_replay_samples --variants households/variants
            --run runs/&lt;run&gt; --out public/samples
          </pre>
        </section>
      </>
    );
  if (manifest.status === "error")
    return (
      <>
        <Heading />
        <div className="error-message" role="alert">
          {manifest.message}
        </div>
      </>
    );

  const m = manifest.data;
  const entry = m.samples.find((s) => s.id === variant);
  const b = bundle.status === "ready" ? bundle.data : null;
  const active = steps[current];
  return (
    <>
      <Heading
        action={
          <button
            className="button primary"
            disabled={!b}
            onClick={() => (workspaceInUse ? setConfirm(true) : open())}
          >
            <FolderInput size={16} />
            Open in workspace
          </button>
        }
      />
      <div className="replay-provenance">
        <Badge tone="green">SYNTHETIC</Badge>
        <span>
          Precomputed run <strong>{m.run}</strong>, packaged{" "}
          {m.builtAt.slice(0, 10)}. Amounts are hypothetical. Nothing is
          uploaded and no model is called from this page.
        </span>
      </div>
      <section className="card replay-variants">
        <label className="field">
          <span>Household variant</span>
          <select
            value={variant}
            onChange={(e) => {
              setPlaying(false);
              setVariant(e.target.value);
            }}
          >
            {m.samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} ·{" "}
                {s.findings === 0
                  ? "no findings"
                  : `${s.flagged} flagged, ${s.unresolved} unresolved`}
              </option>
            ))}
          </select>
        </label>
        {entry && (
          <dl className="replay-variant-stats">
            <div>
              <dt>Documents</dt>
              <dd>{entry.documents}</dd>
            </div>
            <div>
              <dt>Extracted facts</dt>
              <dd>{entry.facts}</dd>
            </div>
            <div>
              <dt>Flagged</dt>
              <dd>{entry.flagged}</dd>
            </div>
            <div>
              <dt>Unresolved</dt>
              <dd>{entry.unresolved}</dd>
            </div>
          </dl>
        )}
        {m.skipped.length > 0 && (
          <p className="field-hint">
            Not packaged (no extraction records): {m.skipped.join(", ")}.
          </p>
        )}
      </section>
      {bundle.status === "loading" && (
        <p className="muted" role="status">
          Loading {variant}…
        </p>
      )}
      {bundle.status === "error" && (
        <div className="error-message" role="alert">
          {bundle.message}
        </div>
      )}
      {b && active && (
        <section className="card replay-card">
          <div className="replay-controls">
            <ol
              className="replay-stepper"
              aria-label="Pipeline steps"
              onKeyDown={onStepperKey}
            >
              {steps.map((s, i) => {
                const Icon = STEP_ICONS[s.id];
                return (
                  <li key={s.id}>
                    <button
                      ref={i === current ? currentRef : undefined}
                      className={`replay-step ${i === current ? "current" : ""} ${i < current ? "done" : ""}`}
                      aria-current={i === current ? "step" : undefined}
                      onClick={() => goTo(i)}
                    >
                      <span className="replay-step-icon">
                        <Icon size={16} />
                      </span>
                      <span>
                        <small>
                          {i + 1}. {s.stage}
                        </small>
                        {s.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="replay-buttons">
              <button
                className="icon-button"
                aria-label="Previous step"
                disabled={current === 0}
                onClick={() => goTo(current - 1)}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  if (!playing && current >= steps.length - 1) goTo(0, false);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
                {playing ? "Pause" : "Play"}
              </button>
              <button
                className="icon-button"
                aria-label="Next step"
                disabled={current >= steps.length - 1}
                onClick={() => goTo(current + 1)}
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
          <div className="replay-panel" aria-live={playing ? "polite" : "off"}>
            <div className="replay-panel-head">
              <span className="eyebrow">
                STEP {current + 1} OF {steps.length} ·{" "}
                {active.stage.toUpperCase()}
              </span>
              <h2>{active.title}</h2>
              <p>{active.summary}</p>
            </div>
            {active.id === "documents" && (
              <DocumentsStep bundle={b} onView={setSource} />
            )}
            {active.id === "extraction" && <ExtractionStep bundle={b} />}
            {active.id === "verification" && (
              <VerificationStep bundle={b} onView={setSource} />
            )}
            {active.id === "reconciliation" && (
              <ReconciliationStep bundle={b} />
            )}
            {active.id === "findings" && (
              <FindingsStep bundle={b} onView={setSource} />
            )}
            {active.id === "evaluation" && (
              <EvaluationStep bundle={b} manifest={m} />
            )}
          </div>
        </section>
      )}
      {source && b && (
        <SourceModal
          view={source}
          packet={b.packet}
          onClose={() => setSource(null)}
        />
      )}
      {confirm && (
        <Modal
          title="Replace the current workspace?"
          onClose={() => setConfirm(false)}
        >
          <p>
            The sample's questionnaire and documents will replace the current
            workspace, and review notes will be cleared. Download a backup from
            Workspace settings first if you need it.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
            <button className="button primary" onClick={open}>
              Open sample
            </button>
          </div>
        </Modal>
      )}
      <p className="replay-footnote">
        {disclaimer}{" "}
        <button className="text-link" onClick={() => go("documents")}>
          Source library
          <ArrowRight size={14} />
        </button>
      </p>
    </>
  );
}

function Heading({ action }: { action?: ReactNode }) {
  return (
    <SectionHeading
      eyebrow="PRECOMPUTED PIPELINE RUN"
      title="Sample replay"
      action={action}
    >
      Step through one household's run, from source pages to the advisor review,
      and switch variants to compare.
    </SectionHeading>
  );
}

function title(packet: Packet, id: string) {
  return packet.documents.find((d) => d.id === id)?.title ?? id;
}

function DocumentsStep({
  bundle: { packet },
  onView,
}: {
  bundle: SampleBundle;
  onView: (v: SourceView) => void;
}) {
  return (
    <div className="replay-table" role="table" aria-label="Source documents">
      <div className="replay-row head" role="row">
        <span role="columnheader">Document</span>
        <span role="columnheader">Pages</span>
        <span role="columnheader">Text layer</span>
        <span role="columnheader">Label</span>
        <span role="columnheader">
          <span className="visually-hidden">Source</span>
        </span>
      </div>
      {packet.documents.map((d) => (
        <div className="replay-row" role="row" key={d.id}>
          <span role="cell">
            <strong>{d.title}</strong>
            <small>
              {d.kind} · <code>{d.id}</code>
            </small>
          </span>
          <span role="cell">{d.pages.length}</span>
          <span role="cell">{d.extractionSource ?? "digital"}</span>
          <span role="cell">
            <Badge tone="neutral">
              {d.source.toUpperCase().replace("_", "-")}
            </Badge>
          </span>
          <span role="cell">
            <button
              className="text-link"
              onClick={() => onView({ doc: d.id, page: 1 })}
              aria-label={`View pages of ${d.title}`}
            >
              View pages
              <ArrowRight size={14} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function ExtractionStep({ bundle: { packet } }: { bundle: SampleBundle }) {
  return (
    <div className="replay-docs">
      {packet.documents.map((d) => {
        const x = (d.extraction ?? {}) as Record<string, unknown>;
        const facts = packet.facts.filter(
          (f, i, all) =>
            f.documentId === d.id &&
            all.findIndex(
              (g) =>
                g.documentId === f.documentId &&
                g.quote === f.quote &&
                g.field === f.field &&
                g.page === f.page,
            ) === i,
        );
        return (
          <details className="replay-doc" key={d.id}>
            <summary>
              <FileText size={16} />
              <strong>{d.title}</strong>
              <span>{facts.length} facts</span>
              <small>
                {String(
                  x.model_served ?? x.model_requested ?? "model not recorded",
                )}
                {x.cached === true ? " · cached" : ""}
                {x.fallback_used === true ? " · fallback model" : ""}
              </small>
            </summary>
            <ul>
              {facts.map((f) => (
                <li key={f.id}>
                  <code>{f.backendField ?? f.field}</code>{" "}
                  {f.value || "(blank)"} <small>p.{f.page}</small>
                  <blockquote>“{f.quote}”</blockquote>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      <p className="field-hint">
        One strict tool call per document. Each fact must carry a verbatim quote
        and a page number; the next step checks both.
      </p>
    </div>
  );
}

function VerificationStep({
  bundle: { packet },
  onView,
}: {
  bundle: SampleBundle;
  onView: (v: SourceView) => void;
}) {
  const v = verificationStats(packet);
  return (
    <>
      <dl className="replay-metrics">
        {Object.entries(v.bySource).map(([src, r]) => (
          <div key={src}>
            <dt>{src} pass rate</dt>
            <dd>{pct(r.facts ? r.verified / r.facts : null)}</dd>
            <small>
              {r.verified} of {r.facts} quotes
            </small>
          </div>
        ))}
        {Object.entries(v.methods).map(([method, n]) => (
          <div key={method}>
            <dt>{method.replace("_", " ")} match</dt>
            <dd>{n}</dd>
          </div>
        ))}
      </dl>
      {v.failures.length ? (
        <>
          <h3 className="replay-subhead">
            Unverified, excluded from findings ({v.failures.length})
          </h3>
          {v.failures.map((f) => (
            <div className="evidence-quote unverified" key={f.id}>
              <div>
                <strong>
                  {f.backendField ?? f.field}: {f.value || "(blank)"}
                </strong>
                <Badge tone="amber">
                  {f.backendVerification?.reason?.replace(/_/g, " ") ??
                    "unverified"}
                </Badge>
              </div>
              <blockquote>“{f.quote}”</blockquote>
              <button
                className="text-link"
                onClick={() => onView({ doc: f.documentId, page: f.page })}
              >
                {title(packet, f.documentId)}, page {f.page}
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </>
      ) : (
        <p className="replay-ok">
          <ShieldCheck size={17} /> Every quote was found on its stated page,
          and every value appears in its quote.
        </p>
      )}
      <p className="field-hint">
        Digital documents must match exactly (ignoring spacing and punctuation).
        Fuzzy matching is allowed only for OCR'd scans.
      </p>
    </>
  );
}

const RULES = [
  "Former spouse on a beneficiary designation",
  "Deceased fiduciary or beneficiary",
  "Will or trust dated before the current marriage",
  "Titled asset registered outside the trust",
  "Intended beneficiary no document names",
  "Blank amendment date",
];

function ReconciliationStep({ bundle }: { bundle: SampleBundle }) {
  const r = bundle.reconciliation;
  const c = r.coverage;
  return (
    <>
      <dl className="replay-metrics">
        <div>
          <dt>Verified facts used</dt>
          <dd>{r.summary.verified_facts}</dd>
        </div>
        <div>
          <dt>Unverified excluded</dt>
          <dd>{r.summary.unverified_facts_excluded}</dd>
        </div>
        <div>
          <dt>Rules run</dt>
          <dd>{RULES.length}</dd>
        </div>
        <div>
          <dt>Reconcile time</dt>
          <dd>{(bundle.reconcileSeconds * 1000).toFixed(1)} ms</dd>
          <small>deterministic, no model call</small>
        </div>
      </dl>
      <h3 className="replay-subhead">Rules over verified facts</h3>
      <ul className="replay-rules">
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <h3 className="replay-subhead">Coverage</h3>
      <ul className="replay-coverage">
        <li>
          {c.gaps.length
            ? `${c.gaps.length} coverage gap(s): ${c.gaps.map((g) => `${g.document} (${g.reason})`).join("; ")}`
            : "No coverage gaps reported."}
        </li>
        {c.people_named_in_documents_but_not_in_questionnaire.length > 0 && (
          <li>
            Named in documents but not in the questionnaire:{" "}
            {c.people_named_in_documents_but_not_in_questionnaire.join(", ")}.
            Ask the client who they are.
          </li>
        )}
        {c.document_types_in_questionnaire_but_not_provided.length > 0 && (
          <li>
            Reported by the client but not provided:{" "}
            {c.document_types_in_questionnaire_but_not_provided
              .map((t) => t.replace(/_/g, " "))
              .join(", ")}
            . A request for the document, not a finding.
          </li>
        )}
      </ul>
      <p className="field-hint">
        A missing fact is a coverage gap, never a finding. Document age alone is
        never a finding. {r.rule_pack_status}.
      </p>
    </>
  );
}

function FindingsStep({
  bundle,
  onView,
}: {
  bundle: SampleBundle;
  onView: (v: SourceView) => void;
}) {
  const { shown, withheld } = shownFindings(bundle);
  const total = bundle.reconciliation.summary.amount_at_stake_flagged_usd;
  return (
    <>
      {withheld.length > 0 && (
        <div className="notice" role="note">
          {withheld.length} finding(s) withheld: their cited quotes are not
          verified in this packet.
        </div>
      )}
      {!shown.length ? (
        <div className="replay-clean">
          <ShieldCheck size={26} />
          <div>
            <strong>Zero material findings</strong>
            <p>
              The documents, questionnaire and asset inventory agree on every
              point the rules check. Nothing is raised to fill the page.
            </p>
          </div>
        </div>
      ) : (
        <>
          {total ? (
            <p className="replay-at-stake">
              <strong>{money(total)}</strong> hypothetical value governed by
              documents with flagged items.
            </p>
          ) : null}
          <div className="replay-findings">
            {shown.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                packet={bundle.packet}
                onView={onView}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FindingCard({
  finding: f,
  packet,
  onView,
}: {
  finding: BackendFinding;
  packet: Packet;
  onView: (v: SourceView) => void;
}) {
  return (
    <article className={`replay-finding ${f.status}`}>
      <header>
        <Badge tone={f.status === "flagged" ? "amber" : "blue"}>
          {f.status === "flagged" ? "Flagged" : "Unresolved"}
        </Badge>
        <span className="muted">{f.id}</span>
        {f.amount_at_stake_usd ? (
          <span className="push-right">
            {money(f.amount_at_stake_usd)} <small>hypothetical</small>
          </span>
        ) : null}
      </header>
      <h3>{ISSUE_LABELS[f.issue_type]}</h3>
      <dl>
        <dt>Observation</dt>
        <dd>{f.observation}</dd>
        <dt>Supporting evidence</dt>
        <dd>
          {f.evidence.map((e, i) => (
            <EvidenceLine
              key={i}
              evidence={e}
              packet={packet}
              onView={onView}
            />
          ))}
        </dd>
        <dt>Uncertainty</dt>
        <dd>{f.uncertainty}</dd>
        <dt>Next question</dt>
        <dd>{f.next_question}</dd>
      </dl>
      <small className="replay-disclaimer">{f.disclaimer}</small>
    </article>
  );
}

function EvidenceLine({
  evidence: e,
  packet,
  onView,
}: {
  evidence: Evidence;
  packet: Packet;
  onView: (v: SourceView) => void;
}) {
  if (e.source === "questionnaire")
    return (
      <div className="replay-evidence questionnaire">
        <small>Questionnaire · {e.path}</small>
        <span>{describeValue(e.value)}</span>
      </div>
    );
  const fact = citedFact(e, packet);
  return (
    <div className="replay-evidence">
      <blockquote>“{e.quote}”</blockquote>
      <button
        className="text-link"
        onClick={() => onView({ doc: e.doc, page: e.page, quote: e.quote })}
      >
        {title(packet, e.doc)}, page {e.page}
        <ArrowRight size={14} />
      </button>
      <small>
        {fact
          ? `Quote verified (${e.verification ?? "exact"})`
          : "Not verified"}
      </small>
    </div>
  );
}

function EvaluationStep({
  bundle,
  manifest,
}: {
  bundle: SampleBundle;
  manifest: Manifest;
}) {
  const e = bundle.evaluation!;
  const run = manifest.evaluation;
  const fieldRows = Object.entries(e.fields);
  return (
    <>
      <dl className="replay-metrics">
        <div>
          <dt>Planted issues caught</dt>
          <dd>
            {e.issues_caught} / {e.expected_issues}
          </dd>
          <small>status correct on {e.status_correct}</small>
        </div>
        <div>
          <dt>False alarms</dt>
          <dd>{e.false_alarms}</dd>
          {e.false_alarm_ids.length > 0 && (
            <small>{e.false_alarm_ids.join(", ")}</small>
          )}
        </div>
        {fieldRows.map(([src, c]) => (
          <div key={src}>
            <dt>Field accuracy, {src}</dt>
            <dd>{pct(c.expected ? c.found / c.expected : null)}</dd>
            <small>
              {c.found} of {c.expected} gold facts
            </small>
          </div>
        ))}
      </dl>
      {run && (
        <>
          <h3 className="replay-subhead">
            Whole run ({run.variants_scored} variants)
          </h3>
          <dl className="replay-metrics compact">
            <div>
              <dt>Recall</dt>
              <dd>{pct(run.issues.recall)}</dd>
              <small>
                {run.issues.caught} of {run.issues.expected}
              </small>
            </div>
            <div>
              <dt>False alarms</dt>
              <dd>{run.false_alarms.total}</dd>
              <small>
                clean controls with any finding:{" "}
                {run.false_alarms.clean_variants_with_findings} of{" "}
                {run.false_alarms.clean_variants}
              </small>
            </div>
            {Object.entries(run.citation_pass_rate).map(([k, v]) => (
              <div key={k}>
                <dt>Citation pass, {k}</dt>
                <dd>{pct(v)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <p className="field-hint">
        Scored by run_eval.py against the mutation script's answer key, which
        the product never reads. Synthetic variants only; these figures describe
        this test set, not real client documents.
      </p>
    </>
  );
}

function SourceModal({
  view,
  packet,
  onClose,
}: {
  view: SourceView;
  packet: Packet;
  onClose: () => void;
}) {
  const doc = packet.documents.find((d) => d.id === view.doc);
  const [page, setPage] = useState(view.page);
  if (!doc)
    return (
      <Modal title="Source not found" onClose={onClose}>
        <p>This document is not in the sample packet.</p>
      </Modal>
    );
  const text = doc.pages.find((p) => p.page === page)?.text ?? "";
  const parts =
    view.quote && page === view.page ? highlight(text, view.quote) : null;
  return (
    <Modal title={doc.title} onClose={onClose}>
      <div className="document-modal-meta">
        <Badge>{doc.kind}</Badge>
        <Badge tone="green">{doc.source.toUpperCase().replace("_", "-")}</Badge>
      </div>
      {doc.pages.length > 1 && (
        <div className="segmented" role="group" aria-label="Page">
          {doc.pages.map((p) => (
            <button
              key={p.page}
              className={p.page === page ? "selected" : ""}
              aria-pressed={p.page === page}
              onClick={() => setPage(p.page)}
            >
              Page {p.page}
            </button>
          ))}
        </div>
      )}
      {view.quote && page === view.page && !parts && (
        <p className="field-hint">
          The quote could not be highlighted on this page.
        </p>
      )}
      <pre className="replay-page">
        {parts ? (
          <>
            {parts[0]}
            <mark>{parts[1]}</mark>
            {parts[2]}
          </>
        ) : (
          text
        )}
      </pre>
    </Modal>
  );
}
