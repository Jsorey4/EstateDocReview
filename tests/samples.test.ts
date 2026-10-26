import { describe, expect, it } from "vitest";
import {
  backendFindings,
  emptyQuestionnaire,
  emptyWorkspace,
  findingTouchesAsset,
  reviewItems,
  workspaceSchema,
} from "../src/domain";
import type { Workspace } from "../src/domain";
import {
  fetchBundle,
  fetchManifest,
  highlight,
  parseBundle,
  replaySteps,
  shownFindings,
  verificationStats,
} from "../src/samples";
// Protocol-level token fixtures only. These are not estate documents or an evaluation answer key.
const verification = (status: "verified" | "unverified") => ({
  status,
  method: status === "verified" ? ("exact" as const) : null,
  score: status === "verified" ? 100 : null,
  page_checked: 1,
  found_on_pages: [],
  value_supported: status === "verified",
  reason: status === "verified" ? null : "wrong_page",
});
const fact = (i: number, subject: string, quote: string, ok = true) => ({
  id: `d:${i}:${subject}`,
  documentId: "d",
  subjectId: subject,
  field: "primary_beneficiary",
  backendField: "primary_beneficiary",
  value: "B",
  quote,
  page: 1,
  verification: ok ? "verified" : "unverified",
  backendVerification: verification(ok ? "verified" : "unverified"),
});
const evidence = (quote: string) => ({
  source: "document",
  doc: "d",
  page: 1,
  field: "primary_beneficiary",
  quote,
  verification: "exact",
});
const finding = (quote: string) => ({
  id: "F01",
  issue_type: "former_spouse_beneficiary",
  status: "flagged",
  documents: ["d"],
  people: ["B"],
  assets: ["x"],
  amount_at_stake_usd: 10,
  amount_is_hypothetical: true,
  observation: "o",
  evidence: [
    evidence(quote),
    { source: "questionnaire", path: "marriages[0]", value: {} },
  ],
  uncertainty: "u",
  next_question: "q",
  rule_refs: [],
  disclaimer: "Not a substitute for the advice of an attorney.",
});
const bundle = (findings: unknown[] = [], evaluation: unknown = null) => ({
  bundleVersion: 1,
  id: "token",
  synthetic: true,
  valuesAreHypothetical: true,
  questionnaire: emptyQuestionnaire,
  extractedFacts: 2,
  packet: {
    schemaVersion: 2,
    verifiedBy: "verify_quotes.py",
    documents: [
      {
        id: "d",
        title: "Token",
        kind: "Other",
        date: "",
        source: "synthetic",
        extractionSource: "digital",
        sha256: "a".repeat(64),
        pages: [{ page: 1, text: "Line A\n  Primary:   B\nLine C" }],
      },
    ],
    // Fact 0 is linked to two assets, so it appears twice in the packet.
    facts: [
      fact(0, "x", "Primary: B"),
      fact(0, "y", "Primary: B"),
      fact(1, "x", "Missing text", false),
    ],
  },
  reconciliation: {
    reconcile_version: "1",
    synthetic: true,
    values_are_hypothetical: true,
    rule_pack_status: "none",
    disclaimer: "Not a substitute for the advice of an attorney.",
    client: "A",
    findings,
    summary: {
      findings: findings.length,
      flagged: findings.length,
      unresolved: 0,
      amount_at_stake_flagged_usd: null,
      documents: ["d"],
      verified_facts: 1,
      unverified_facts_excluded: 1,
    },
    coverage: {
      gaps: [],
      unverified_facts: [],
      people_named_in_documents_but_not_in_questionnaire: [],
      document_types_in_questionnaire_but_not_provided: [],
    },
  },
  reconcileSeconds: 0.001,
  extractionSeconds: null,
  evaluation,
});
const respond = (status: number, body: string) =>
  (async () => new Response(body, { status })) as typeof fetch;

describe("sample loader", () => {
  it("treats a missing manifest as no samples, including Vite's HTML fallback", async () => {
    expect(await fetchManifest(respond(404, ""))).toBeNull();
    expect(
      await fetchManifest(respond(200, "<!doctype html><html></html>")),
    ).toBeNull();
  });
  it("rejects a manifest in the wrong format or with unsafe file names", async () => {
    await expect(fetchManifest(respond(200, "{}"))).rejects.toThrow(
      "bridge/build_replay_samples.py",
    );
    const manifest = {
      bundleVersion: 1,
      synthetic: true,
      builtAt: "",
      run: "r",
      skipped: [],
      evaluation: null,
      samples: [
        {
          id: "x",
          file: "../secret.json",
          documents: 0,
          facts: 0,
          findings: 0,
          flagged: 0,
          unresolved: 0,
        },
      ],
    };
    await expect(
      fetchManifest(respond(200, JSON.stringify(manifest))),
    ).rejects.toThrow();
  });
  it("refuses a bundle that is not labeled synthetic or does not match its entry", async () => {
    expect(() => parseBundle({ ...bundle(), synthetic: false })).toThrow();
    const entry = {
      id: "other",
      file: "other.json",
      documents: 1,
      facts: 2,
      findings: 0,
      flagged: 0,
      unresolved: 0,
    };
    await expect(
      fetchBundle(entry, respond(200, JSON.stringify(bundle())), "t1/"),
    ).rejects.toThrow("does not match");
  });
});

describe("replay", () => {
  it("counts each extracted fact once and keeps unverified facts visible", () => {
    const stats = verificationStats(parseBundle(bundle()).packet);
    expect(stats.total).toBe(2);
    expect(stats.verified).toBe(1);
    expect(stats.reasons).toEqual({ wrong_page: 1 });
    expect(stats.failures.map((f) => f.quote)).toEqual(["Missing text"]);
  });
  it("shows a finding only when its cited quote is a verified packet fact", () => {
    const b = parseBundle(
      bundle([
        finding("Primary:  B"),
        { ...finding("Missing text"), id: "F02" },
      ]),
    );
    const { shown, withheld } = shownFindings(b);
    expect(shown.map((f) => f.id)).toEqual(["F01"]);
    expect(withheld.map((f) => f.id)).toEqual(["F02"]);
  });
  it("says zero material findings for a clean run and adds evaluation only when scored", () => {
    const clean = replaySteps(parseBundle(bundle()));
    expect(clean.map((s) => s.id)).toEqual([
      "documents",
      "extraction",
      "verification",
      "reconciliation",
      "findings",
    ]);
    expect(clean[4].summary).toBe("Zero material findings.");
    const scored = replaySteps(
      parseBundle(
        bundle([], {
          expected_issues: 0,
          issues_caught: 0,
          status_correct: 0,
          false_alarms: 0,
          false_alarm_ids: [],
          fields: {},
          citations: {},
          extraction_seconds: null,
        }),
      ),
    );
    expect(scored.at(-1)?.id).toBe("evaluation");
    expect(scored.at(-1)?.summary).toContain("0 false alarms");
  });
  it("highlights a quote across differences in spacing", () => {
    expect(highlight("Line A\n  Primary:   B\nLine C", "Primary: B")).toEqual([
      "Line A\n  ",
      "Primary:   B",
      "\nLine C",
    ]);
    expect(highlight("abc", "zzz")).toBeNull();
  });
});

describe("backend findings in the workspace", () => {
  const opened = (findings: unknown[]): Workspace => {
    const b = parseBundle(bundle(findings));
    return {
      ...emptyWorkspace(),
      questionnaire: b.questionnaire,
      packet: b.packet,
      backend: {
        source: "sample token",
        questionnaire: b.questionnaire,
        reconciliation: b.reconciliation,
      },
    };
  };
  it("lists verified reconcile.py findings first and withholds the rest", () => {
    const w = opened([
      finding("Primary: B"),
      { ...finding("Missing text"), id: "F02", people: ["C"] },
    ]);
    const { shown, withheld, stale } = backendFindings(w);
    expect(withheld).toBe(1);
    expect(stale).toBe(false);
    expect(shown).toHaveLength(1);
    const [item] = reviewItems(w);
    expect(item.origin).toBe("reconcile");
    expect(item.title).toBe("Former spouse named on a designation");
    expect(item.type).toBe("discrepancy");
    expect(item.facts.map((f) => f.quote)).toEqual(["Primary: B"]);
    expect(item.questionnaireEvidence).toEqual(["marriages[0]: (blank)"]);
    expect(item.amount).toBe(10);
    expect(findingTouchesAsset(item, "x")).toBe(true);
  });
  it("marks findings stale after a questionnaire edit and drops them without a packet", () => {
    const w = opened([finding("Primary: B")]);
    const edited = {
      ...w,
      questionnaire: { ...w.questionnaire, concerns: "edited" },
    };
    expect(backendFindings(edited).stale).toBe(true);
    expect(backendFindings({ ...w, packet: null }).shown).toEqual([]);
  });
  it("reads older backups that have no backend field", () => {
    const { backend: _omit, ...old } = emptyWorkspace();
    void _omit;
    expect(workspaceSchema.parse(old).backend).toBeNull();
  });
});
