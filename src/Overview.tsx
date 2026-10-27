import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ClipboardList,
  FileCheck2,
  Files,
  GitBranch,
  Landmark,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import type { Page, Workspace } from "./domain";
import { completion, money, reviewItems, verifiedFacts } from "./domain";
import { Badge, Progress, SectionHeading, TextLink, Tick } from "./components";
export default function Overview({
  workspace: w,
  go,
}: {
  workspace: Workspace;
  go: (p: Page) => void;
}) {
  const q = w.questionnaire;
  const progress = completion(q).filter(Boolean).length * 20;
  const findings = reviewItems(w);
  const verified = verifiedFacts(w.packet);
  const total = q.assets.reduce((sum, a) => sum + a.value, 0);
  const documents = w.packet?.documents ?? [];
  const started = !!q.household;
  return (
    <>
      <SectionHeading
        eyebrow="THE BIG PICTURE"
        title={
          started
            ? `${q.household} overview`
            : "A clearer picture. A better conversation."
        }
        action={
          <button className="button secondary" onClick={() => go("report")}>
            <FileCheck2 size={16} />
            Review packet
            <ArrowUpRight size={14} />
          </button>
        }
      >
        Bring intentions, documents, and the questions that matter into one
        place.
      </SectionHeading>
      <section className="welcome-card">
        <div className="welcome-copy">
          <div className="welcome-kicker">
            <span className="light-dot" />{" "}
            {started
              ? "YOUR REVIEW IS TAKING SHAPE"
              : "LET’S BUILD THE FULL PICTURE"}
          </div>
          <h2>
            {started
              ? "Connect the details.\nSee what needs a conversation."
              : "Every estate has a story.\nStart with the people behind it."}
          </h2>
          <p>
            A thoughtful review starts with understanding the household.
            <br className="desktop-only" /> Capture their intentions, then see
            how the documents align.
          </p>
          <button className="button light" onClick={() => go("questionnaire")}>
            {started ? "Continue questionnaire" : "Start a household review"}
            <ArrowRight size={16} />
          </button>
          <span className="welcome-footnote">
            Five guided steps <span>·</span> Progress saved as you go
          </span>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span className="art-star star-one">✧</span>
          <span className="art-star star-two">✧</span>
          <div className="art-card art-back">
            <span />
            <span />
            <span />
          </div>
          <div className="art-card art-front">
            <div className="art-leaf">
              <ShieldCheck size={26} />
            </div>
            <div className="art-line" />
            <div className="art-line short" />
            <div className="art-check">
              <Check size={13} />
              Intentions, connected.
            </div>
          </div>
          <div className="art-bubble">
            <Users size={21} />
          </div>
        </div>
      </section>
      <div className="stats-grid">
        <Stat
          icon={<Wallet size={19} />}
          label="HOUSEHOLD ASSETS"
          value={q.assets.length ? money(total) : "—"}
          detail={
            q.assets.length
              ? `${q.assets.length} assets · hypothetical values`
              : "Add the assets that tell the story"
          }
          onClick={() => go("questionnaire")}
        />
        <Stat
          icon={<Files size={19} />}
          label="SUPPORTING DOCUMENTS"
          value={String(documents.length).padStart(2, "0")}
          detail={
            documents.length
              ? `${verified.length} quotes verified against pages`
              : "Ready for your first document"
          }
          onClick={() => go("documents")}
        />
        <Stat
          icon={<ListChecks size={19} />}
          label="ITEMS TO DISCUSS"
          value={String(findings.length).padStart(2, "0")}
          detail={
            w.packet
              ? "Evidence-backed review prompts"
              : "Available after evidence review"
          }
          onClick={() => go("review")}
        />
        <Stat
          icon={<ClipboardList size={19} />}
          label="QUESTIONNAIRE"
          value={`${progress}%`}
          detail={
            progress === 100
              ? "Client intentions captured"
              : "A little context goes a long way"
          }
          onClick={() => go("questionnaire")}
        />
      </div>
      <div className="overview-columns">
        <section className="card journey-card">
          <div className="card-heading">
            <div>
              <h2>Your review, step by step</h2>
              <p>A connected workflow from first question to follow-up.</p>
            </div>
            <span className="subtle-label">
              {
                [
                  progress === 100,
                  documents.length > 0,
                  verified.length > 0,
                  q.reviewed &&
                    !!w.packet &&
                    findings.every(
                      (f) =>
                        w.dispositions[f.id]?.status &&
                        w.dispositions[f.id].status !== "open",
                    ),
                ].filter(Boolean).length
              }{" "}
              OF 4
            </span>
          </div>
          <div className="journey-list">
            {[
              {
                icon: Users,
                title: "Understand the household",
                body: "People, priorities, and the plan they have in mind.",
                page: "questionnaire" as Page,
                done: progress === 100,
                active: progress < 100,
              },
              {
                icon: Files,
                title: "Connect the documents",
                body: "Bring the records and their supporting evidence together.",
                page: "documents" as Page,
                done: documents.length > 0,
                active: progress === 100 && !documents.length,
              },
              {
                icon: GitBranch,
                title: "Follow the estate flow",
                body: "Explore how assets connect to people and instruments.",
                page: "flow" as Page,
                done: verified.length > 0,
                active: false,
              },
              {
                icon: FileCheck2,
                title: "Prepare the conversation",
                body: "Review differences and capture the next questions.",
                page: "review" as Page,
                done:
                  q.reviewed &&
                  !!w.packet &&
                  findings.every(
                    (f) =>
                      w.dispositions[f.id]?.status &&
                      w.dispositions[f.id].status !== "open",
                  ),
                active: false,
              },
            ].map((item, i) => (
              <button
                key={item.title}
                className={`journey-step ${item.active ? "current" : ""}`}
                onClick={() => go(item.page)}
              >
                <span className="step-icon">
                  {item.done ? <Check size={18} /> : <item.icon size={19} />}
                </span>
                <span className="step-body">
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                  {item.active && (
                    <Badge tone="green">
                      {i === 0 ? "Start here" : "Next step"}
                    </Badge>
                  )}
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <section className="card readiness-card">
          <div className="card-heading">
            <div>
              <h2>Review readiness</h2>
              <p>Good evidence makes the difference.</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div
            className="readiness-ring"
            style={{
              background: `conic-gradient(var(--green) ${progress * 3.6}deg, var(--track, #ebece5) 0)`,
            }}
          >
            <div>
              <strong>
                {progress}
                <span>%</span>
              </strong>
              <small>questionnaire complete</small>
            </div>
          </div>
          <div className="readiness-checks">
            <div>
              <Tick done={progress === 100} />
              Household context captured
            </div>
            <div>
              <Tick done={documents.length > 0} />
              Source documents connected
            </div>
            <div>
              <Tick done={verified.length > 0} />
              Supporting quotes verified
            </div>
          </div>
          <div className="soft-note">
            <Sparkles size={16} />
            <p>
              {w.packet
                ? "Verified quotes support review. They do not establish legal effect."
                : "Your review will take shape as you add context and evidence."}
            </p>
          </div>
        </section>
      </div>
      <section className="card flow-preview">
        <div className="card-heading">
          <div>
            <span className="eyebrow">CONNECTING THE DOTS</span>
            <h2>The estate, at a glance</h2>
            <p>From what they own to who they intend to benefit.</p>
          </div>
          <TextLink onClick={() => go("flow")}>Explore estate flow</TextLink>
        </div>
        <div className="mini-flow">
          <div className="mini-node">
            <span className="mini-node-icon">
              <Landmark size={21} />
            </span>
            <div>
              <small>ASSETS</small>
              <strong>
                {q.assets.length
                  ? `${q.assets.length} household assets`
                  : "What they own"}
              </strong>
              <span>
                {q.assets.length
                  ? `${money(total)} · hypothetical`
                  : "Accounts, property & interests"}
              </span>
            </div>
          </div>
          <div className="flow-connector">
            <ArrowRight size={16} />
          </div>
          <div className="mini-node">
            <span className="mini-node-icon amber-icon">
              <Files size={21} />
            </span>
            <div>
              <small>INSTRUMENTS</small>
              <strong>
                {documents.length
                  ? `${documents.length} source documents`
                  : "How it passes"}
              </strong>
              <span>Wills, trusts & designations</span>
            </div>
          </div>
          <div className="flow-connector">
            <ArrowRight size={16} />
          </div>
          <div className="mini-node">
            <span className="mini-node-icon blue-icon">
              <Users size={21} />
            </span>
            <div>
              <small>BENEFICIARIES</small>
              <strong>
                {q.people.length
                  ? `${q.people.length} people in the picture`
                  : "Who it reaches"}
              </strong>
              <span>People, organizations & intentions</span>
            </div>
          </div>
        </div>
        <div className="flow-preview-bottom">
          <span className="muted">
            <span className="small-dot" />{" "}
            {q.assets.length
              ? "Client-reported connections · document review may be incomplete"
              : "Your estate map will populate as the review develops."}
          </span>
          <button className="text-link" onClick={() => go("questionnaire")}>
            <Plus size={15} />
            Add household details
          </button>
        </div>
      </section>
      <div className="bottom-quote">
        <p>The best next step starts with the right question.</p>
        <div>BUILT FOR THOUGHTFUL ADVISOR CONVERSATIONS</div>
      </div>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className="stat-card" onClick={onClick}>
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      {label === "QUESTIONNAIRE" && <Progress value={parseInt(value)} />}
    </button>
  );
}
