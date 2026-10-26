import { useState } from "react";
import {
  ArrowRight,
  Expand,
  FileText,
  GitBranch,
  Landmark,
  Plus,
  Users,
  X,
} from "lucide-react";
import type { Asset, Page, Workspace } from "./domain";
import { money, reconcile, routeEvidence } from "./domain";
import { Badge, Empty, Modal, SectionHeading } from "./components";
const lane = (a: Asset) =>
  a.route === "Will / probate"
    ? "Probate"
    : a.route === "Unknown"
      ? "Unconfirmed route"
      : "Non-probate · client reported";
export default function Flow({
  workspace: w,
  go,
}: {
  workspace: Workspace;
  go: (p: Page) => void;
}) {
  const [filter, setFilter] = useState("All assets");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [expanded, setExpanded] = useState(false);
  const findings = reconcile(w.questionnaire, w.packet);
  const assets = w.questionnaire.assets.filter(
    (a) =>
      filter === "All assets" ||
      (filter === "Needs discussion"
        ? findings.some((f) => f.facts.some((e) => e.subjectId === a.id))
        : a.route === "Unknown"),
  );
  const map = (
    <>
      <div className="flow-column-labels">
        <span>
          01 <strong>ASSETS</strong>
        </span>
        <span>
          02 <strong>REPORTED INSTRUMENT</strong>
        </span>
        <span>
          03 <strong>BENEFICIARY</strong>
        </span>
      </div>
      {["Probate", "Non-probate · client reported", "Unconfirmed route"].map(
        (group) =>
          assets.some((a) => lane(a) === group) && (
            <section className="flow-lane" key={group}>
              <div className="lane-label">
                <span />
                {group}
                <small>
                  {assets.filter((a) => lane(a) === group).length} assets
                </small>
              </div>
              {assets
                .filter((a) => lane(a) === group)
                .map((a) => {
                  const evidence = routeEvidence(a, w.packet);
                  const flag = findings.some((f) =>
                    f.facts.some((e) => e.subjectId === a.id),
                  );
                  const beneficiaryEvidence = evidence.filter((f) =>
                    ["beneficiary", "primary_beneficiary"].includes(f.field),
                  );
                  const names = [
                    ...new Set(beneficiaryEvidence.map((f) => f.value)),
                  ];
                  return (
                    <button
                      className={`flow-row ${flag ? "flagged" : ""}`}
                      key={a.id}
                      onClick={() => setSelected(a)}
                      aria-label={`Inspect ${a.name || "unnamed asset"}`}
                    >
                      <div className="flow-node">
                        <div className="flow-node-icon">
                          <Landmark size={19} />
                        </div>
                        <strong>{a.name || "Unnamed asset"}</strong>
                        <small>{a.type}</small>
                        <span>
                          {money(a.value)} <small>hypothetical</small>
                        </span>
                      </div>
                      <div className="node-connector">
                        <ArrowRight size={16} />
                      </div>
                      <div className="flow-node instrument">
                        <FileText size={20} />
                        <strong>
                          {a.route === "Unknown" ? "To be confirmed" : a.route}
                        </strong>
                        <small>Client reported · unconfirmed</small>
                        <span className="node-status">
                          {evidence.length
                            ? `${evidence.length} supporting facts`
                            : "Awaiting document evidence"}
                        </span>
                      </div>
                      <div className="node-connector">
                        <ArrowRight size={16} />
                      </div>
                      <div className="flow-node beneficiary">
                        <Users size={20} />
                        <strong>
                          {names.length
                            ? names.join(" / ")
                            : a.beneficiary || "To be confirmed"}
                        </strong>
                        <small>
                          {names.length
                            ? "Name in verified source quote"
                            : "Questionnaire intention"}
                        </small>
                        <Badge
                          tone={
                            flag ? "amber" : names.length ? "green" : "neutral"
                          }
                        >
                          {flag
                            ? "Needs discussion"
                            : names.length
                              ? "Quote verified"
                              : "Unconfirmed"}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
            </section>
          ),
      )}
    </>
  );
  return (
    <>
      <SectionHeading
        eyebrow="FOLLOW THE CONNECTIONS"
        title="The estate flow"
        action={
          <button
            className="button secondary"
            onClick={() => go("questionnaire")}
          >
            <Plus size={16} />
            Manage assets
          </button>
        }
      >
        See the path from assets to instruments to people. Select a connection
        to inspect its evidence.
      </SectionHeading>
      <section className="card flow-card">
        <div className="flow-toolbar">
          <div className="segmented">
            {["All assets", "Needs discussion", "Unknown route"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "selected" : ""}
                aria-pressed={filter === f}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            aria-label="Expand estate flow"
            onClick={() => setExpanded(true)}
          >
            <Expand size={18} />
          </button>
        </div>
        <div className="map-area">
          {assets.length ? (
            map
          ) : (
            <Empty
              icon={<GitBranch size={34} />}
              title={
                w.questionnaire.assets.length
                  ? "No assets in this view"
                  : "A picture of how it all connects"
              }
              action={
                <button
                  className="button primary"
                  onClick={() =>
                    w.questionnaire.assets.length
                      ? setFilter("All assets")
                      : go("questionnaire")
                  }
                >
                  {w.questionnaire.assets.length
                    ? "Show all assets"
                    : "Add household assets"}
                  <ArrowRight size={16} />
                </button>
              }
            >
              {w.questionnaire.assets.length
                ? "Choose another filter to explore the estate."
                : "Start with the household’s assets and intentions. Document evidence adds the next layer of context."}
            </Empty>
          )}
        </div>
        <div className="map-legend">
          <span>
            <i className="legend-green" />
            Quote verified
          </span>
          <span>
            <i className="legend-amber" />
            Needs discussion
          </span>
          <span>
            <i className="legend-gray" />
            Unconfirmed
          </span>
          <span className="push-right">All asset values are hypothetical</span>
        </div>
      </section>
      <div className="notice flow-notice">
        Routes are based on questionnaire answers, not a legal determination.
        Verified quotes confirm source text only. The legal effect of title,
        probate status, and beneficiary designations requires professional
        review.
      </div>
      {expanded && (
        <div
          className="expanded-map"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded estate flow"
        >
          <Modal
            title="Estate flow · expanded view"
            onClose={() => setExpanded(false)}
          >
            <div className="map-area">
              {assets.length ? map : <p>No assets in this view.</p>}
            </div>
            <button
              className="button secondary"
              onClick={() => setExpanded(false)}
            >
              <X size={16} />
              Close expanded view
            </button>
          </Modal>
        </div>
      )}
      {selected && (
        <Modal
          title={selected.name || "Asset detail"}
          onClose={() => setSelected(null)}
        >
          <div className="asset-detail-total">
            {money(selected.value)}
            <small>Hypothetical value · {selected.type}</small>
          </div>
          <div className="detail-grid">
            <div>
              <small>Reported owner</small>
              <strong>{selected.owner || "Unknown"}</strong>
            </div>
            <div>
              <small>Intended beneficiary</small>
              <strong>{selected.beneficiary || "Unknown"}</strong>
            </div>
            <div>
              <small>Reported route</small>
              <strong>{selected.route}</strong>
            </div>
          </div>
          <h3>Supporting document facts</h3>
          {routeEvidence(selected, w.packet).length ? (
            routeEvidence(selected, w.packet).map((f) => (
              <div className="evidence-quote" key={f.id}>
                <strong>
                  {f.field}: {f.value}
                </strong>
                <blockquote>“{f.quote}”</blockquote>
                <small>
                  {
                    w.packet?.documents.find((d) => d.id === f.documentId)
                      ?.title
                  }{" "}
                  · Page {f.page}
                </small>
              </div>
            ))
          ) : (
            <p className="muted">
              No verified source quotes are connected to this asset yet.
            </p>
          )}
          <button
            className="button secondary full"
            onClick={() => {
              setSelected(null);
              setExpanded(false);
              go("review");
            }}
          >
            View discussion items
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}
