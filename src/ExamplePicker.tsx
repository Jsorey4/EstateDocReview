import { useEffect, useState } from "react";
import {
  emptyWorkspace,
  householdBadge,
  workspaceSchema,
  parsePacket,
} from "./domain";
import type { Workspace } from "./domain";
import { Modal } from "./components";

const examples = [
  {
    id: "case1",
    title: "Simple & straightforward estate",
    description:
      "Pendelton household · will, TOD deed, beneficiary schedule, and incapacity documents.",
  },
  {
    id: "case2",
    title: "Medium complexity estate",
    description:
      "Montgomery household · blended family, revocable trust, and sub-trusts.",
  },
  {
    id: "case3",
    title: "Complex estate",
    description:
      "Thorne household · FLP, ILIT, SLAT, GRAT, buy-sell, and charitable trust.",
  },
];

export default function ExamplePicker({
  inline = false,
  current,
  onSelect,
  onClose,
}: {
  inline?: boolean;
  current: Workspace;
  onSelect: (workspace: Workspace) => void;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Record<string, Workspace>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Workspace | null>(null);
  // Ask before replacing only when the current household holds work that would be lost.
  const choose = (next: Workspace) => {
    const q = current.questionnaire;
    const blank = !q.household && !q.people.length && !q.assets.length;
    const unedited = Object.values(loaded).some(
      (example) => JSON.stringify(example) === JSON.stringify(current),
    );
    if (blank || unedited) onSelect(next);
    else setPending(next);
  };
  useEffect(() => {
    let live = true;
    void Promise.all(
      examples.map(async ({ id }) => {
        try {
          const response = await fetch(
            `${import.meta.env.BASE_URL}examples/${id}.json`,
          );
          if (!response.ok) return null;
          const workspace = workspaceSchema.parse(await response.json());
          if (workspace.packet)
            workspace.packet = parsePacket(workspace.packet);
          return [id, workspace] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!live) return;
      setLoaded(
        Object.fromEntries(
          results.filter((r): r is NonNullable<typeof r> => r !== null),
        ),
      );
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);
  const confirm = pending && (
    <Modal title="Start this household?" onClose={() => setPending(null)}>
      <p>
        This replaces the current household and its edits in this browser. An
        empty household lets you enter your own details; document evidence is
        available only through the prepared examples.
      </p>
      <div className="modal-actions">
        <button className="button secondary" onClick={() => setPending(null)}>
          Cancel
        </button>
        <button className="button primary" onClick={() => onSelect(pending)}>
          Start household
        </button>
      </div>
    </Modal>
  );
  // The sidebar list mirrors the household switch itself; the dialog keeps the descriptive cards.
  const option = (
    workspace: Workspace | undefined,
    label: string,
    onClick: () => void,
    key?: string,
  ) => {
    const badge = workspace
      ? householdBadge(workspace.questionnaire)
      : { initials: "…", name: loading ? "Loading…" : "Not available" };
    const isCurrent =
      !!workspace &&
      workspace.questionnaire.clientName === current.questionnaire.clientName &&
      workspace.questionnaire.household === current.questionnaire.household;
    return (
      <button
        key={key}
        className={`household-option ${isCurrent ? "current" : ""}`}
        aria-label={label}
        aria-current={isCurrent || undefined}
        title={label}
        disabled={!workspace}
        onClick={onClick}
      >
        <span className="household-avatar">{badge.initials}</span>
        <span>
          {badge.name}
          <small>Texas · Estate review</small>
        </span>
      </button>
    );
  };
  if (inline)
    return (
      <div className="household-dropdown" role="group" aria-label="Households">
        {examples.map(({ id, title }, index) =>
          option(
            loaded[id],
            `${index + 1}. ${title}`,
            () => choose(structuredClone(loaded[id])),
            id,
          ),
        )}
        {option(emptyWorkspace(), "Start an empty household", () =>
          choose(emptyWorkspace()),
        )}
        {confirm}
      </div>
    );
  const content = (
    <div className="example-choices">
      <p>Choose an example to explore, or start with an empty household.</p>
      {examples.map(({ id, title, description }, index) => (
        <button
          key={id}
          className="example-choice"
          disabled={!loaded[id]}
          onClick={() => choose(structuredClone(loaded[id]))}
        >
          <strong>
            {index + 1}. {title}
          </strong>
          <span>{description}</span>
          {!loaded[id] && (
            <small>
              {loading ? "Loading…" : "Household data is not available yet."}
            </small>
          )}
        </button>
      ))}
      <button
        className="button secondary full"
        onClick={() => choose(emptyWorkspace())}
      >
        Start an empty household
      </button>
      <button className="text-link" onClick={onClose}>
        Close
      </button>
      {confirm}
    </div>
  );
  return (
    <Modal title="Choose a household" onClose={onClose}>
      {content}
    </Modal>
  );
}
