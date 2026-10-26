import { ArrowRight, Download, Printer } from "lucide-react";
import {
  completion,
  download,
  money,
  parsePercent,
  reviewItems,
  verifiedFacts,
} from "./domain";
import type { Page, Workspace } from "./domain";
import { Badge, disclaimer, SectionHeading } from "./components";
export default function Report({
  workspace: w,
  go,
}: {
  workspace: Workspace;
  go: (p: Page) => void;
}) {
  const q = w.questionnaire;
  const findings = reviewItems(w);
  const verified = verifiedFacts(w.packet);
  const completed = completion(q).every(Boolean);
  return (
    <>
      <SectionHeading
        eyebrow="PREPARE THE CONVERSATION"
        title="The advisor review packet"
        action={
          <div className="button-group">
            <button
              className="button secondary"
              onClick={() =>
                download(
                  "estate-review-workspace.json",
                  JSON.stringify(w, null, 2),
                )
              }
            >
              <Download size={16} />
              Export data
            </button>
            <button className="button primary" onClick={() => window.print()}>
              <Printer size={16} />
              Print / Save PDF
            </button>
          </div>
        }
      >
        A concise record of intentions, evidence, and what to confirm next.
      </SectionHeading>
      <div className="report-sheet">
        <div className="report-topline">
          <span>ESTATE REVIEW / ADVISOR WORKSPACE</span>
          <Badge tone="amber">
            {completed && w.packet ? "For advisor review" : "Incomplete review"}
          </Badge>
        </div>
        <h2>{q.household || "New household"}</h2>
        <p className="report-subtitle">
          Estate document review · Texas ·{" "}
          {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
            new Date(),
          )}
        </p>
        <div className="report-disclaimer">
          Prototype · Synthetic or public data only · All asset values are
          hypothetical.
          <br />
          {disclaimer}
        </div>
        <div className="report-metrics">
          <div>
            <strong>{q.assets.length}</strong>
            <span>Assets reported</span>
          </div>
          <div>
            <strong>{w.packet?.documents.length ?? 0}</strong>
            <span>Source documents</span>
          </div>
          <div>
            <strong>{verified.length}</strong>
            <span>Verified quotes</span>
          </div>
          <div>
            <strong>{findings.length}</strong>
            <span>Discussion items</span>
          </div>
        </div>
        <ReportSection number="01" title="Household intentions">
          <p>{q.intentions || "Client intentions have not been captured."}</p>
          <div className="detail-grid">
            <div>
              <small>Respondent</small>
              <strong>{q.respondent || "Not supplied"}</strong>
            </div>
            <div>
              <small>Marital status</small>
              <strong>{q.maritalStatus || "Not supplied"}</strong>
            </div>
            <div>
              <small>Relevant changes</small>
              <strong>{q.events.join(", ") || "None reported"}</strong>
            </div>
          </div>
          {q.concerns && (
            <p>
              <strong>Client questions:</strong> {q.concerns}
            </p>
          )}
          {q.people.length > 0 && (
            <>
              <h4>People</h4>
              <ul className="report-list">
                {q.people.map((p) => (
                  <li key={p.id}>
                    <strong>{p.name || "Unnamed person"}</strong> ·{" "}
                    {p.relationship || "Relationship to confirm"} ·{" "}
                    {p.status === "unknown" ? "status to confirm" : p.status}
                    {p.note && <span className="report-note">{p.note}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {q.intended_beneficiaries.length > 0 && (
            <>
              <h4>Intended beneficiaries</h4>
              <ul className="report-list">
                {q.intended_beneficiaries.map((b, i) => (
                  <li key={i}>
                    <strong>{b.name || "Unnamed beneficiary"}</strong> ·{" "}
                    {parsePercent(b.share) !== null
                      ? `${parsePercent(b.share)}%`
                      : b.share
                        ? `“${b.share}” (not a percentage)`
                        : "share to confirm"}
                    {b.note && <span className="report-note">{b.note}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </ReportSection>
        <ReportSection number="02" title="Asset and beneficiary overview">
          {q.assets.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Hypothetical value</th>
                    <th>Reported route</th>
                    <th>Intended beneficiary</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {q.assets.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name || "Unnamed asset"}</td>
                      <td>{money(a.value)}</td>
                      <td>{a.route}</td>
                      <td>{a.beneficiary || "To confirm"}</td>
                      <td>{a.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No assets have been recorded.</p>
          )}
          <p className="field-hint">
            Routes and intentions are client-reported. Legal effect and actual
            transfer paths have not been established.
          </p>
        </ReportSection>
        <ReportSection number="03" title="Observations and follow-up">
          {findings.length ? (
            findings.map((f) => (
              <div className="report-finding" key={f.id}>
                <h4>
                  {f.title} · {f.subject}
                </h4>
                {f.origin === "reconcile" && (
                  <p>
                    <strong>Source:</strong> reconcile.py rules over verified
                    facts
                  </p>
                )}
                <p>
                  <strong>Observation:</strong> {f.observation}
                </p>
                {f.amount ? (
                  <p>
                    <strong>Amount at stake:</strong> {money(f.amount)}{" "}
                    (hypothetical)
                  </p>
                ) : null}
                {f.questionnaireEvidence?.map((line) => (
                  <p key={line}>
                    <strong>Questionnaire:</strong> {line}
                  </p>
                ))}
                {f.facts.map((fact) => (
                  <blockquote key={fact.id}>
                    “{fact.quote}”
                    <cite>
                      {
                        w.packet?.documents.find(
                          (d) => d.id === fact.documentId,
                        )?.title
                      }
                      , page {fact.page} · Quote verified
                    </cite>
                  </blockquote>
                ))}
                <p>
                  <strong>Uncertainty:</strong> {f.uncertainty}
                </p>
                <p>
                  <strong>Next question:</strong> {f.question}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {
                    {
                      open: "To discuss",
                      discussed: "Discussed with client",
                      attorney: "Attorney follow-up",
                    }[w.dispositions[f.id]?.status ?? "open"]
                  }
                </p>
                {w.dispositions[f.id]?.note && (
                  <p>
                    <strong>Advisor notes:</strong> {w.dispositions[f.id].note}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p>
              {w.backend
                ? "The reconciliation rules found no material findings in the verified facts, and the name comparison found no differences. This is not a determination that the estate plan is complete or suitable."
                : w.packet
                  ? "No supported name discrepancies found in the supplied comparable facts. This is not a determination that the estate plan is complete or suitable."
                  : "Document comparison has not been performed. Import evidence to populate this section."}
            </p>
          )}
        </ReportSection>
        <ReportSection number="04" title="Evidence register">
          {w.packet?.documents.length ? (
            <ul className="evidence-register">
              {w.packet.documents.map((d) => (
                <li key={d.id}>
                  <strong>{d.title}</strong>
                  <span>
                    {d.source.toUpperCase()} · {d.kind} · {d.date || "Undated"}{" "}
                    · {d.pages.length} pages
                  </span>
                  {d.sourceUrl && <a href={d.sourceUrl}>{d.sourceUrl}</a>}
                </li>
              ))}
            </ul>
          ) : (
            <p>No source documents are connected.</p>
          )}
        </ReportSection>
        <ReportSection number="05" title="Review scope and open questions">
          <p>
            Comparison covers exact names for matching assets and roles. It does
            not assess tax exposure, legal validity, document precedence, or
            whether an estate plan achieves the client’s goals.
          </p>
          {w.backend && (
            <p>
              Observations from reconcile.py ({w.backend.source}) come from
              deterministic rules over verified facts: former spouse on a
              designation, deceased fiduciary or beneficiary, document dated
              before the current marriage, asset registered outside the trust,
              intended beneficiary no document names, and blank amendment date.
              Rule pack: {w.backend.reconciliation.rule_pack_status}.
            </p>
          )}
          <ul>
            <li>Questionnaire: {completed ? "reviewed" : "incomplete"}.</li>
            <li>
              {(w.packet?.facts.length ?? 0) - verified.length} unverified facts
              excluded from observations.
            </li>
            <li>
              Missing, unmatched, or unprovided records require follow-up.
            </li>
            <li>
              Confirm current records and refer legal interpretation to an
              estate attorney.
            </li>
          </ul>
        </ReportSection>
        <div className="report-end">{disclaimer}</div>
      </div>
      <div className="report-bottom">
        <span className="muted">
          Print layout includes source references and advisor notes.
        </span>
        <button className="text-link" onClick={() => go("review")}>
          Return to review queue
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
function ReportSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="report-section">
      <h3>
        <span>{number}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
