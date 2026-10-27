import { useState } from "react";
import { BACKEND_DOCUMENT_TYPES } from "./backendContract.generated";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Trash2,
} from "lucide-react";
import type { Asset, Page, Person, Questionnaire as Data } from "./domain";
import {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_SUGGESTIONS,
  completion,
  missingItems,
  money,
  normalize,
  parsePercent,
  relationshipKind,
  reviewWarnings,
  uid,
  sentenceCase,
} from "./domain";
import { Badge, Empty, Progress, SectionHeading } from "./components";
const steps = ["Household", "People", "Assets", "Wishes & roles", "Review"];
export default function Questionnaire({
  value: q,
  initialStep = 0,
  onChange,
  go,
}: {
  value: Data;
  initialStep?: number;
  onChange: (q: Data) => void;
  go: (p: Page) => void;
}) {
  const [step, setStep] = useState(initialStep);
  // Steps the advisor has left unfinished; their missing fields are then marked in place.
  const [attempted, setAttempted] = useState<Set<number>>(() => new Set());
  const completed = completion(q);
  const missing = missingItems(q);
  const warnings = reviewWarnings(q);
  const show = attempted.has(step);
  const update = (patch: Partial<Data>) =>
    onChange({ ...q, ...patch, reviewed: false });
  const leave = (to: number) => {
    if (step < 4 && missing[step].length)
      setAttempted((a) => new Set(a).add(step));
    setStep(Math.max(0, Math.min(to, 4)));
    window.scrollTo(0, 0);
  };
  const next = () => leave(step + 1);
  const stepStatus = (i: number) => {
    if (i === 4)
      return q.reviewed
        ? { tone: "done", text: "Reviewed" }
        : { tone: "todo", text: "Not yet reviewed" };
    if (missing[i].length)
      return attempted.has(i)
        ? { tone: "missing", text: `${missing[i].length} still needed` }
        : { tone: "todo", text: "Not finished" };
    if (warnings[i].length)
      return { tone: "warn", text: `${warnings[i].length} to confirm` };
    return { tone: "done", text: "Complete" };
  };
  const setPeople = (people: Person[]) => update({ people });
  const changePerson = (id: string, patch: Partial<Person>) =>
    setPeople(q.people.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPerson = () =>
    setPeople([
      ...q.people,
      {
        id: uid(),
        name: "",
        relationship: "",
        status: "unknown",
        note: "",
      },
    ]);
  const addAsset = () =>
    update({
      assets: [
        ...q.assets,
        {
          id: uid(),
          name: "",
          type: "Investment account",
          value: 0,
          character: "unknown",
          governing_document: "",
          retirementKind: "retirement_401k",
          owner: "",
          beneficiary: "",
          route: "Unknown",
          note: "",
        },
      ],
    });
  const setBeneficiary = (
    i: number,
    patch: Partial<Data["intended_beneficiaries"][number]>,
  ) =>
    update({
      intended_beneficiaries: q.intended_beneficiaries.map((r, j) =>
        j === i ? { ...r, ...patch } : r,
      ),
    });
  const shareTotal = q.intended_beneficiaries.reduce(
    (sum, b) => sum + (parsePercent(b.share) ?? 0),
    0,
  );
  return (
    <>
      <SectionHeading
        eyebrow="START WITH INTENTION"
        title="The household questionnaire"
        action={
          <Badge tone={completed.every(Boolean) ? "green" : "amber"}>
            {completed.filter(Boolean).length} of 5 complete
          </Badge>
        }
      >
        Understand the people, priorities, and plans behind the paperwork.
      </SectionHeading>
      <div className="questionnaire-layout">
        <aside className="questionnaire-steps">
          <div className="step-caption">BUILD THE PICTURE</div>
          {steps.map((label, i) => {
            const status = stepStatus(i);
            return (
              <button
                key={label}
                className={`form-step ${i === step ? "selected" : ""} status-${status.tone}`}
                onClick={() => leave(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <span>{completed[i] ? <Check size={15} /> : `0${i + 1}`}</span>
                <span className="form-step-label">
                  {label}
                  <small>{status.text}</small>
                </span>
              </button>
            );
          })}
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
                  "Start with a little context. Enter a household name for this prototype.",
                  "Include family, intended beneficiaries, and people with a decision-making role.",
                  "Record hypothetical assets and the client’s understanding of how each passes.",
                  "Capture intentions in the client’s words. These become the comparison point for the documents.",
                  "Review the information below. Missing details stay visible for follow-up.",
                ][step]
              }
            </p>
          </div>
          {step < 4 && (
            <StepChecklist
              missing={missing[step]}
              warnings={warnings[step]}
              emphasize={show}
            />
          )}
          {step === 0 && (
            <div className="form-body">
              <div className="form-grid">
                <Field
                  label="Household name"
                  required
                  invalid={show && !q.household.trim()}
                >
                  <input
                    aria-invalid={show && !q.household.trim()}
                    value={q.household}
                    onChange={(e) => update({ household: e.target.value })}
                    placeholder="e.g. Household name"
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Questionnaire completed by"
                  required
                  invalid={show && !q.respondent.trim()}
                >
                  <input
                    aria-invalid={show && !q.respondent.trim()}
                    value={q.respondent}
                    onChange={(e) => update({ respondent: e.target.value })}
                    placeholder="Name or role"
                  />
                </Field>
                <Field label="Client name">
                  <input
                    value={q.clientName}
                    onChange={(e) => update({ clientName: e.target.value })}
                  />
                </Field>
                <Field label="Questionnaire as-of date">
                  <input
                    type="date"
                    value={q.asOf}
                    onChange={(e) => update({ asOf: e.target.value })}
                  />
                </Field>
                <Field label="State of residence">
                  <select
                    value="Texas"
                    disabled
                    title="This prototype reviews Texas households only."
                  >
                    <option>Texas</option>
                  </select>
                  <small className="field-hint">
                    Texas only in this prototype.
                  </small>
                </Field>
                <Field
                  label="Marital status"
                  required
                  invalid={show && !q.maritalStatus}
                >
                  <select
                    aria-invalid={show && !q.maritalStatus}
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
                <h3>Marriage history</h3>
                <p className="muted">
                  Record each marriage, oldest first. Leave the end date and
                  ending blank for a current marriage.
                </p>
                {q.marriages.map((m, i) => (
                  <div className="repeater" key={i}>
                    <div className="form-grid">
                      <Field label={`Marriage ${i + 1}: spouse`}>
                        <input
                          value={m.spouse}
                          onChange={(e) =>
                            update({
                              marriages: q.marriages.map((r, j) =>
                                j === i ? { ...r, spouse: e.target.value } : r,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={`Marriage ${i + 1}: married date`}>
                        <input
                          type="date"
                          value={m.married}
                          onChange={(e) =>
                            update({
                              marriages: q.marriages.map((r, j) =>
                                j === i ? { ...r, married: e.target.value } : r,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={`Marriage ${i + 1}: ended date`}>
                        <input
                          type="date"
                          value={m.ended}
                          onChange={(e) =>
                            update({
                              marriages: q.marriages.map((r, j) =>
                                j === i ? { ...r, ended: e.target.value } : r,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={`Marriage ${i + 1}: how ended`}>
                        <select
                          value={m.how_ended}
                          onChange={(e) =>
                            update({
                              marriages: q.marriages.map((r, j) =>
                                j === i
                                  ? {
                                      ...r,
                                      how_ended: e.target
                                        .value as typeof m.how_ended,
                                    }
                                  : r,
                              ),
                            })
                          }
                        >
                          <option value="">Current / not ended</option>
                          <option value="divorce">Divorce</option>
                          <option value="death">Death</option>
                        </select>
                      </Field>
                    </div>
                    <button
                      className="button ghost"
                      onClick={() =>
                        update({
                          marriages: q.marriages.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove marriage {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  className="button secondary"
                  onClick={() =>
                    update({
                      marriages: [
                        ...q.marriages,
                        { spouse: "", married: "", ended: "", how_ended: "" },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Add marriage
                </button>
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
                  iconAction={{ label: "Add a person", onClick: addPerson }}
                  title="Every name adds context"
                >
                  Add the people connected to this household. Names are compared
                  exactly after capitalization and spacing are normalized.
                </Empty>
              )}
              {q.people.map((person, index) => {
                const kind = relationshipKind(person);
                const suggestion =
                  kind === "other"
                    ? RELATIONSHIP_SUGGESTIONS[normalize(person.relationship)]
                    : undefined;
                return (
                  <div className="repeater" key={person.id}>
                    <div className="repeater-head">
                      <strong>Person {index + 1}</strong>
                      <button
                        className="icon-button danger-text"
                        aria-label={`Remove person ${index + 1}`}
                        onClick={() =>
                          setPeople(q.people.filter((p) => p.id !== person.id))
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="form-grid">
                      <Field
                        label="Full name"
                        required
                        invalid={show && !person.name.trim()}
                      >
                        <input
                          aria-invalid={show && !person.name.trim()}
                          value={person.name}
                          onChange={(e) =>
                            changePerson(person.id, { name: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Current status">
                        <select
                          value={person.status}
                          onChange={(e) =>
                            changePerson(person.id, {
                              status: e.target.value as Person["status"],
                            })
                          }
                        >
                          <option value="living">Living</option>
                          <option value="deceased">Deceased</option>
                          <option value="unknown">Unknown / confirm</option>
                        </select>
                      </Field>
                    </div>
                    <fieldset className="relationship-field">
                      <legend>Relationship or role</legend>
                      <div className="choice-chips">
                        {RELATIONSHIP_KINDS.map((k) => (
                          <label
                            key={k}
                            className={`chip-radio ${kind === k ? "chosen" : ""}`}
                          >
                            <input
                              type="radio"
                              name={`relationship-${person.id}`}
                              checked={kind === k}
                              onChange={() =>
                                changePerson(person.id, {
                                  relationshipKind: k,
                                  relationship:
                                    k === "other"
                                      ? kind === "other"
                                        ? person.relationship
                                        : ""
                                      : k,
                                })
                              }
                            />
                            {k[0].toUpperCase() + k.slice(1)}
                          </label>
                        ))}
                      </div>
                      {kind === "other" && (
                        <Field label="Describe the relationship">
                          <input
                            value={person.relationship}
                            placeholder="e.g. sibling, friend, financial advisor"
                            onChange={(e) =>
                              changePerson(person.id, {
                                relationship: e.target.value,
                              })
                            }
                          />
                        </Field>
                      )}
                      {suggestion && (
                        <p className="field-hint">
                          “{person.relationship}” usually means {suggestion}.{" "}
                          <button
                            className="text-link inline"
                            onClick={() =>
                              changePerson(person.id, {
                                relationshipKind: suggestion,
                                relationship: suggestion,
                              })
                            }
                          >
                            Use{" "}
                            {suggestion[0].toUpperCase() + suggestion.slice(1)}
                          </button>
                        </p>
                      )}
                    </fieldset>
                    <NoteField
                      value={person.note}
                      onChange={(note) => changePerson(person.id, { note })}
                    />
                  </div>
                );
              })}
              <button className="button secondary" onClick={addPerson}>
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
                  showMissing={show}
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
                  iconAction={{ label: "Add an asset", onClick: addAsset }}
                  title="Bring the asset picture together"
                >
                  Add accounts, property, insurance, or business interests.
                  Leave unknown names blank so they remain open questions.
                </Empty>
              )}
              <button className="button secondary" onClick={addAsset}>
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
                invalid={show && !q.intentions.trim()}
              >
                <textarea
                  aria-invalid={show && !q.intentions.trim()}
                  rows={4}
                  value={q.intentions}
                  onChange={(e) => update({ intentions: e.target.value })}
                  placeholder="Capture the client’s goals, intended beneficiaries, and any important priorities."
                />
              </Field>
              <h3 className="field-group">Intended beneficiaries and shares</h3>
              <p className="muted">
                Household-level intentions, as distinct from account-specific
                designations.
              </p>
              {q.intended_beneficiaries.map((b, i) => {
                const pct = parsePercent(b.share);
                const legacy = b.share.trim() && pct === null ? b.share : "";
                return (
                  <div className="repeater" key={i}>
                    <div className="form-grid">
                      <Field label={`Beneficiary ${i + 1}: name`}>
                        <input
                          value={b.name}
                          list="people-options"
                          onChange={(e) =>
                            setBeneficiary(i, { name: e.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label={`Beneficiary ${i + 1}: share (%)`}
                        invalid={!!legacy}
                        message="Enter a percentage"
                      >
                        <span className="input-suffix">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            step="any"
                            aria-invalid={!!legacy}
                            value={pct ?? ""}
                            placeholder="0–100"
                            onChange={(e) =>
                              setBeneficiary(i, {
                                share: e.target.value
                                  ? `${e.target.value}%`
                                  : "",
                              })
                            }
                          />
                          <span aria-hidden="true">%</span>
                        </span>
                      </Field>
                    </div>
                    {legacy && (
                      <p className="field-hint">
                        Recorded earlier as “{legacy}”. Enter a percentage, and
                        keep any description in the notes.{" "}
                        <button
                          className="text-link inline"
                          onClick={() =>
                            setBeneficiary(i, {
                              share: "",
                              note: b.note ? `${b.note}\n${legacy}` : legacy,
                            })
                          }
                        >
                          Move to notes
                        </button>
                      </p>
                    )}
                    <NoteField
                      value={b.note}
                      placeholder="Conditions, timing, or how the client described this share"
                      onChange={(note) => setBeneficiary(i, { note })}
                    />
                    <button
                      className="button ghost"
                      onClick={() =>
                        update({
                          intended_beneficiaries:
                            q.intended_beneficiaries.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove beneficiary {i + 1}
                    </button>
                  </div>
                );
              })}
              {q.intended_beneficiaries.some((b) => b.share.trim()) && (
                <p className={`share-total ${shareTotal === 100 ? "" : "off"}`}>
                  Shares entered: {Math.round(shareTotal * 100) / 100}%
                  {shareTotal !== 100 && " of 100%"}
                </p>
              )}
              <button
                className="button secondary"
                onClick={() =>
                  update({
                    intended_beneficiaries: [
                      ...q.intended_beneficiaries,
                      { name: "", share: "", note: "" },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Add intended beneficiary
              </button>
              <h3 className="field-group">Documents available</h3>
              <div className="choice-chips">
                {BACKEND_DOCUMENT_TYPES.map((kind) => (
                  <button
                    key={kind}
                    aria-pressed={q.documents_available.includes(kind)}
                    className={
                      q.documents_available.includes(kind) ? "chosen" : ""
                    }
                    onClick={() =>
                      update({
                        documents_available: q.documents_available.includes(
                          kind,
                        )
                          ? q.documents_available.filter((k) => k !== kind)
                          : [...q.documents_available, kind],
                      })
                    }
                  >
                    {sentenceCase(kind)}
                  </button>
                ))}
              </div>
              <h3 className="field-group">Who do they intend to act?</h3>
              <p className="muted">
                Record names as the client understands them. Leave unknown roles
                blank.
              </p>
              <div className="form-grid">
                {(["executor", "trustee"] as const).map((role) => (
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
                    {/* Visible picks: native suggestion popups can render unreadably in some themes. */}
                    <span className="name-picks">
                      {q.people
                        .filter((p) => p.name && p.name !== q[role])
                        .slice(0, 6)
                        .map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={(e) => {
                              e.preventDefault();
                              update({ [role]: p.name });
                            }}
                          >
                            {p.name}
                          </button>
                        ))}
                    </span>
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
                    <span>
                      {s}
                      {!completed[i] && (
                        <small className="readiness-missing">
                          Needed: {missing[i].join(", ")}
                        </small>
                      )}
                    </span>
                    <button
                      className={`push-right text-link ${completed[i] ? "" : "amber-text"}`}
                      onClick={() => leave(i)}
                    >
                      {completed[i] ? "Captured" : "Finish this step"}
                    </button>
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
                  I have reviewed these household details and they are ready for
                  document comparison.
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
              onClick={() => leave(step - 1)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            {step < 4 && missing[step].length ? (
              <span className="footer-missing" role="status">
                <CircleAlert size={14} />
                {missing[step].length} still needed · saved as you go
              </span>
            ) : (
              <span className="muted">
                <Check size={14} />
                Changes saved as you go
              </span>
            )}
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
  invalid,
  message = "Required to finish this step",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  message?: string;
}) {
  return (
    <label className={`field ${invalid ? "is-missing" : ""}`}>
      <span>
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {children}
      {invalid && (
        <small className="field-error">
          <CircleAlert size={12} />
          {message}
        </small>
      )}
    </label>
  );
}
function NoteField({
  value,
  onChange,
  placeholder = "Anything the advisor should know about this item",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="note-row">
      <Field label="Notes or comments">
        <textarea
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    </div>
  );
}
function StepChecklist({
  missing,
  warnings,
  emphasize,
}: {
  missing: string[];
  warnings: string[];
  emphasize: boolean;
}) {
  if (!missing.length && !warnings.length)
    return (
      <div className="step-checklist done">
        <CheckCircle2 size={16} />
        This step is complete.
      </div>
    );
  return (
    <div className={`step-checklist ${emphasize ? "emphasize" : ""}`}>
      {missing.length > 0 && (
        <div>
          <strong>
            <CircleAlert size={15} />
            To finish this step
          </strong>
          <ul>
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="checklist-warnings">
          <strong>Worth confirming</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
function AssetForm({
  asset: a,
  index,
  showMissing,
  people,
  change,
  remove,
}: {
  asset: Asset;
  index: number;
  showMissing: boolean;
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
        <Field
          label="Asset name"
          required
          invalid={showMissing && !a.name.trim()}
        >
          <input
            aria-invalid={showMissing && !a.name.trim()}
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
        <Field label="Property character">
          <select
            value={a.character}
            onChange={(e) =>
              change({ character: e.target.value as Asset["character"] })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="community">Community</option>
            <option value="separate">Separate</option>
          </select>
        </Field>
        <Field label="Governing document ID">
          <input
            value={a.governing_document}
            onChange={(e) => change({ governing_document: e.target.value })}
            placeholder="Extraction document ID (file name without extension)"
          />
        </Field>
        {a.type === "Retirement account" && (
          <Field label="Retirement account kind">
            <select
              value={a.retirementKind}
              onChange={(e) =>
                change({
                  retirementKind: e.target.value as Asset["retirementKind"],
                })
              }
            >
              <option value="retirement_401k">401(k)</option>
              <option value="ira">IRA</option>
            </select>
          </Field>
        )}
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
      <NoteField value={a.note} onChange={(note) => change({ note })} />
      <p className="asset-reference">
        Evidence reference: <code>{a.id}</code>
      </p>
    </div>
  );
}
