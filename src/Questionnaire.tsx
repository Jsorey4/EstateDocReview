import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Trash2,
} from "lucide-react";
import type { Asset, Page, Person, Questionnaire as Data } from "./domain";
import { completion, money, uid } from "./domain";
import { Badge, Empty, Progress, SectionHeading } from "./components";
const steps = ["Household", "People", "Assets", "Wishes & roles", "Review"];
export default function Questionnaire({
  value: q,
  onChange,
  go,
}: {
  value: Data;
  onChange: (q: Data) => void;
  go: (p: Page) => void;
}) {
  const [step, setStep] = useState(0);
  const completed = completion(q);
  const update = (patch: Partial<Data>) =>
    onChange({ ...q, ...patch, reviewed: false });
  const next = () => {
    setStep((s) => Math.min(s + 1, 4));
    window.scrollTo(0, 0);
  };
  return (
    <>
      <SectionHeading
        eyebrow="START WITH INTENTION"
        title="The household questionnaire"
        action={
          <Badge tone="green">
            {completed.filter(Boolean).length} of 5 complete
          </Badge>
        }
      >
        Understand the people, priorities, and plans behind the paperwork.
      </SectionHeading>
      <div className="questionnaire-layout">
        <aside className="questionnaire-steps">
          <div className="step-caption">BUILD THE PICTURE</div>
          {steps.map((label, i) => (
            <button
              key={label}
              className={`form-step ${i === step ? "selected" : ""}`}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
            >
              <span>{completed[i] ? <Check size={15} /> : `0${i + 1}`}</span>
              {label}
            </button>
          ))}
          <div className="questionnaire-progress">
            <span>{completed.filter(Boolean).length * 20}% complete</span>
            <Progress value={completed.filter(Boolean).length * 20} />
            <small>Saved as you go. You can revisit any step.</small>
          </div>
        </aside>
        <section className="card form-card">
          <div className="form-heading">
            <span className="eyebrow">STEP 0{step + 1} / 05</span>
            <h2>
              {
                [
                  "Meet the household",
                  "People in the picture",
                  "What makes up the estate?",
                  "What matters most?",
                  "Ready for the next conversation?",
                ][step]
              }
            </h2>
            <p>
              {
                [
                  "Start with a little context. Use a synthetic household name for this prototype.",
                  "Include family, intended beneficiaries, and people with a decision-making role.",
                  "Record hypothetical assets and the client’s understanding of how each passes.",
                  "Capture intentions in the client’s words. These become the comparison point for the documents.",
                  "Review the information below. Missing details stay visible for follow-up.",
                ][step]
              }
            </p>
          </div>
          {step === 0 && (
            <div className="form-body">
              <div className="form-grid">
                <Field label="Household name" required>
                  <input
                    value={q.household}
                    onChange={(e) => update({ household: e.target.value })}
                    placeholder="e.g. Synthetic household name"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Questionnaire completed by" required>
                  <input
                    value={q.respondent}
                    onChange={(e) => update({ respondent: e.target.value })}
                    placeholder="Name or role"
                  />
                </Field>
                <Field label="State of residence">
                  <select value="Texas" disabled>
                    <option>Texas</option>
                  </select>
                </Field>
                <Field label="Marital status" required>
                  <select
                    value={q.maritalStatus}
                    onChange={(e) => update({ maritalStatus: e.target.value })}
                  >
                    <option value="">Select status</option>
                    {[
                      "Single",
                      "Married",
                      "Divorced",
                      "Widowed",
                      "Separated",
                      "Prefer to discuss",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                {q.maritalStatus === "Married" && (
                  <Field label="Spouse name">
                    <input
                      value={q.spouse}
                      onChange={(e) => update({ spouse: e.target.value })}
                      placeholder="Spouse or partner"
                    />
                  </Field>
                )}
              </div>
              <div className="field-group">
                <h3>Has anything changed?</h3>
                <p className="muted">
                  Select life events that may be relevant to the review. An
                  event alone is not a finding.
                </p>
                <div className="choice-chips">
                  {[
                    "Marriage",
                    "Divorce",
                    "New child or grandchild",
                    "Death in the family",
                    "Move to Texas",
                    "Significant asset change",
                    "Health or care needs",
                  ].map((event) => (
                    <button
                      key={event}
                      className={q.events.includes(event) ? "chosen" : ""}
                      aria-pressed={q.events.includes(event)}
                      onClick={() =>
                        update({
                          events: q.events.includes(event)
                            ? q.events.filter((v) => v !== event)
                            : [...q.events, event],
                        })
                      }
                    >
                      {q.events.includes(event) && <Check size={13} />} {event}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="form-body">
              {q.people.length === 0 && (
                <Empty
                  icon={<Plus size={25} />}
                  title="Every name adds context"
                >
                  Add the people connected to this household. Names are compared
                  exactly after capitalization and spacing are normalized.
                </Empty>
              )}
              {q.people.map((person, index) => (
                <div className="repeater" key={person.id}>
                  <div className="repeater-head">
                    <strong>Person {index + 1}</strong>
                    <button
                      className="icon-button danger-text"
                      aria-label={`Remove person ${index + 1}`}
                      onClick={() =>
                        update({
                          people: q.people.filter((p) => p.id !== person.id),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field label="Full name">
                      <input
                        value={person.name}
                        onChange={(e) =>
                          update({
                            people: q.people.map((p) =>
                              p.id === person.id
                                ? { ...p, name: e.target.value }
                                : p,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Relationship or role">
                      <input
                        value={person.relationship}
                        placeholder="e.g. Child, spouse, attorney"
                        onChange={(e) =>
                          update({
                            people: q.people.map((p) =>
                              p.id === person.id
                                ? { ...p, relationship: e.target.value }
                                : p,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Current status">
                      <select
                        value={person.status}
                        onChange={(e) =>
                          update({
                            people: q.people.map((p) =>
                              p.id === person.id
                                ? {
                                    ...p,
                                    status: e.target.value as Person["status"],
                                  }
                                : p,
                            ),
                          })
                        }
                      >
                        <option value="living">Living</option>
                        <option value="deceased">Deceased</option>
                        <option value="unknown">Unknown / confirm</option>
                      </select>
                    </Field>
                  </div>
                </div>
              ))}
              <button
                className="button secondary"
                onClick={() =>
                  update({
                    people: [
                      ...q.people,
                      {
                        id: uid(),
                        name: "",
                        relationship: "",
                        status: "unknown",
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Add a person
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="form-body">
              <div className="notice">
                All amounts in this prototype are hypothetical. Asset routes are
                client-reported and remain unconfirmed by documents.
              </div>
              {q.assets.map((asset, i) => (
                <AssetForm
                  key={asset.id}
                  asset={asset}
                  index={i}
                  people={q.people}
                  change={(patch) =>
                    update({
                      assets: q.assets.map((a) =>
                        a.id === asset.id ? { ...a, ...patch } : a,
                      ),
                    })
                  }
                  remove={() =>
                    update({
                      assets: q.assets.filter((a) => a.id !== asset.id),
                    })
                  }
                />
              ))}
              {q.assets.length === 0 && (
                <Empty
                  icon={<Plus size={25} />}
                  title="Bring the asset picture together"
                >
                  Add accounts, property, insurance, or business interests.
                  Leave unknown names blank so they remain open questions.
                </Empty>
              )}
              <button
                className="button secondary"
                onClick={() =>
                  update({
                    assets: [
                      ...q.assets,
                      {
                        id: uid(),
                        name: "",
                        type: "Investment account",
                        value: 0,
                        owner: "",
                        beneficiary: "",
                        route: "Unknown",
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Add an asset
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="form-body">
              <Field
                label="In their words: what should this plan accomplish?"
                required
              >
                <textarea
                  rows={4}
                  value={q.intentions}
                  onChange={(e) => update({ intentions: e.target.value })}
                  placeholder="Capture the client’s goals, intended beneficiaries, and any important priorities."
                />
              </Field>
              <h3 className="field-group">Who do they intend to act?</h3>
              <p className="muted">
                Record names as the client understands them. Leave unknown roles
                blank.
              </p>
              <div className="form-grid">
                {(["executor", "trustee", "agent"] as const).map((role) => (
                  <Field
                    key={role}
                    label={
                      {
                        executor: "Intended executor",
                        trustee: "Intended successor trustee",
                        agent: "Intended financial agent",
                      }[role]
                    }
                  >
                    <input
                      list="people-options"
                      value={q[role]}
                      onChange={(e) => update({ [role]: e.target.value })}
                      placeholder="Name or confirm later"
                    />
                  </Field>
                ))}
              </div>
              <datalist id="people-options">
                {q.people
                  .filter((p) => p.name)
                  .map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
              </datalist>
              <div className="field-group">
                <Field label="Questions or concerns to bring to the advisor">
                  <textarea
                    rows={3}
                    value={q.concerns}
                    onChange={(e) => update({ concerns: e.target.value })}
                    placeholder="Anything that feels unclear, has changed, or needs a closer look?"
                  />
                </Field>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="form-body">
              <div className="review-summary-grid">
                <div>
                  <small>HOUSEHOLD</small>
                  <strong>{q.household || "Not provided"}</strong>
                  <span>{q.maritalStatus || "Status to confirm"} · Texas</span>
                </div>
                <div>
                  <small>PEOPLE</small>
                  <strong>
                    {q.people.filter((p) => p.name.trim()).length} named people
                  </strong>
                  <span>{q.events.length} relevant life events</span>
                </div>
                <div>
                  <small>ASSETS</small>
                  <strong>
                    {money(q.assets.reduce((sum, a) => sum + a.value, 0))}
                  </strong>
                  <span>Hypothetical · {q.assets.length} assets</span>
                </div>
              </div>
              <h3>Client intentions</h3>
              <p className="answer-quote">
                {q.intentions || "No intentions captured yet."}
              </p>
              <div className="readiness-checks">
                {steps.slice(0, 4).map((s, i) => (
                  <div key={s}>
                    {completed[i] ? (
                      <CheckCircle2 size={17} className="green-text" />
                    ) : (
                      <span className="small-dot amber-dot" />
                    )}
                    {s}
                    <span className="push-right">
                      {completed[i] ? "Captured" : "Needs details"}
                    </span>
                  </div>
                ))}
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={q.reviewed}
                  disabled={!completed.slice(0, 4).every(Boolean)}
                  onChange={(e) =>
                    onChange({ ...q, reviewed: e.target.checked })
                  }
                />
                <span>
                  I have reviewed these synthetic or public household details
                  and they are ready for document comparison.
                </span>
              </label>
              {!completed.slice(0, 4).every(Boolean) && (
                <p className="field-hint">
                  Complete the first four sections, including a named person and
                  asset, to mark the questionnaire reviewed.
                </p>
              )}
            </div>
          )}
          <div className="form-footer">
            <button
              className="button ghost"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <span className="muted">
              <Check size={14} />
              Changes saved as you go
            </span>
            {step < 4 ? (
              <button className="button primary" onClick={next}>
                Continue
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="button primary"
                onClick={() => go("documents")}
              >
                Connect documents
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      </div>
      <div className="privacy-caption">
        <ClipboardCheck size={15} />
        Your questionnaire establishes client intentions. Document evidence is
        reviewed separately.
      </div>
    </>
  );
}
function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {children}
    </label>
  );
}
function AssetForm({
  asset: a,
  index,
  people,
  change,
  remove,
}: {
  asset: Asset;
  index: number;
  people: Person[];
  change: (patch: Partial<Asset>) => void;
  remove: () => void;
}) {
  return (
    <div className="repeater">
      <div className="repeater-head">
        <strong>Asset {index + 1}</strong>
        <button
          className="icon-button danger-text"
          aria-label={`Remove asset ${index + 1}`}
          onClick={remove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="form-grid">
        <Field label="Asset name">
          <input
            value={a.name}
            onChange={(e) => change({ name: e.target.value })}
            placeholder="Use a label, not an account number"
          />
        </Field>
        <Field label="Asset type">
          <select
            value={a.type}
            onChange={(e) => change({ type: e.target.value as Asset["type"] })}
          >
            {[
              "Retirement account",
              "Investment account",
              "Bank account",
              "Real estate",
              "Life insurance",
              "Business interest",
              "Other",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Estimated value (USD · hypothetical)">
          <input
            type="number"
            min="0"
            step="1"
            value={a.value || ""}
            onChange={(e) =>
              change({
                value: Number.isFinite(Number(e.target.value))
                  ? Math.max(0, Number(e.target.value) || 0)
                  : 0,
              })
            }
            placeholder="0"
          />
        </Field>
        <Field label="Reported owner / title">
          <input
            value={a.owner}
            onChange={(e) => change({ owner: e.target.value })}
          />
        </Field>
        <Field label="Intended beneficiary">
          <input
            value={a.beneficiary}
            list={`asset-people-${a.id}`}
            onChange={(e) => change({ beneficiary: e.target.value })}
            placeholder="Name or organization"
          />
          <datalist id={`asset-people-${a.id}`}>
            {people
              .filter((p) => p.name)
              .map((p) => (
                <option key={p.id} value={p.name} />
              ))}
          </datalist>
        </Field>
        <Field label="How the client believes it passes">
          <select
            value={a.route}
            onChange={(e) =>
              change({ route: e.target.value as Asset["route"] })
            }
          >
            {[
              "Unknown",
              "Will / probate",
              "Revocable trust",
              "Beneficiary designation",
              "Joint ownership",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="asset-reference">
        Evidence reference: <code>{a.id}</code>
      </p>
    </div>
  );
}
