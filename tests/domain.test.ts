import { describe, expect, it } from "vitest";
import {
  completion,
  emptyWorkspace,
  normalize,
  packetSchema,
  parsePacket,
  quoteMatches,
  reconcile,
  workspaceSchema,
} from "../src/domain";
import type { Fact, Packet } from "../src/domain";
// Protocol-level token fixtures only. These are not estate documents or an evaluation answer key.
const fact: Fact = {
  id: "f",
  documentId: "d",
  subjectId: "household",
  field: "executor",
  value: "B",
  quote: "B",
  page: 1,
  verification: "verified",
};
const packet = (): Packet => ({
  schemaVersion: 1,
  verifiedBy: "verify_quotes.py",
  documents: [
    {
      id: "d",
      title: "Protocol token",
      kind: "Other",
      date: "",
      source: "synthetic",
      pages: [{ page: 1, text: "B C" }],
    },
  ],
  facts: [{ ...fact }],
});
describe("evidence integrity", () => {
  it("normalizes names without treating different names as identical", () => {
    expect(normalize(" A  B ")).toBe("a b");
    expect(normalize("AB")).not.toBe(normalize("A B"));
  });
  it("requires the specified source page and case-sensitive quote", () => {
    const d = packet().documents[0];
    expect(quoteMatches(fact, d)).toBe(true);
    expect(quoteMatches({ ...fact, page: 2 }, d)).toBe(false);
    expect(quoteMatches({ ...fact, quote: "b" }, d)).toBe(false);
    expect(quoteMatches({ ...fact, quote: " " }, d)).toBe(false);
  });
  it("downgrades a forged verified label when the quote is absent", () => {
    const p = packet();
    p.facts[0].quote = "MISSING";
    expect(parsePacket(p).facts[0].verification).toBe("unverified");
  });
  it("does not promote a fact marked unverified", () => {
    const p = packet();
    p.facts[0].verification = "unverified";
    expect(parsePacket(p).facts[0].verification).toBe("unverified");
  });
  it("rejects duplicate source pages, duplicate IDs and missing documents", () => {
    const p = packet();
    p.documents[0].pages.push({ page: 1, text: "C" });
    expect(packetSchema.safeParse(p).success).toBe(false);
    const p2 = packet();
    p2.facts.push({ ...fact });
    expect(packetSchema.safeParse(p2).success).toBe(false);
    const p3 = packet();
    p3.documents = [];
    expect(packetSchema.safeParse(p3).success).toBe(false);
  });
  it("requires a safe URL for public sources", () => {
    const p = packet();
    p.documents[0].source = "public";
    expect(packetSchema.safeParse(p).success).toBe(false);
    p.documents[0].sourceUrl = "javascript:alert(1)";
    expect(packetSchema.safeParse(p).success).toBe(false);
  });
});
describe("conservative comparison", () => {
  it("produces no findings without evidence or intent", () => {
    const q = emptyWorkspace().questionnaire;
    expect(reconcile(q, null)).toEqual([]);
    expect(reconcile(q, packet())).toEqual([]);
  });
  it("produces zero discrepancies for matching names", () => {
    const q = emptyWorkspace().questionnaire;
    q.executor = " b ";
    expect(reconcile(q, packet())).toEqual([]);
  });
  it("excludes unverified and unmatched facts", () => {
    const q = emptyWorkspace().questionnaire;
    q.executor = "A";
    const p = packet();
    p.facts[0].verification = "unverified";
    expect(reconcile(q, p)).toEqual([]);
    p.facts[0] = { ...fact, subjectId: "unknown" };
    expect(reconcile(q, p)).toEqual([]);
  });
  it("provides all four parts of a supported difference", () => {
    const q = emptyWorkspace().questionnaire;
    q.executor = "A";
    const result = reconcile(q, packet());
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("discrepancy");
    for (const key of ["observation", "uncertainty", "question"] as const)
      expect(result[0][key].length).toBeGreaterThan(0);
    expect(result[0].facts).toHaveLength(1);
  });
  it("keeps conflicting records unresolved and retains both quotes", () => {
    const p = packet();
    p.facts.push({ ...fact, id: "g", value: "C", quote: "C" });
    const result = reconcile(emptyWorkspace().questionnaire, p);
    expect(result[0].type).toBe("unresolved");
    expect(result[0].facts).toHaveLength(2);
  });
  it("invalidates old follow-up IDs when evidence or intentions change", () => {
    const q = emptyWorkspace().questionnaire;
    q.executor = "A";
    const id = reconcile(q, packet())[0].id;
    q.executor = "D";
    expect(reconcile(q, packet())[0].id).not.toBe(id);
  });
});
describe("draft persistence", () => {
  it("retains incomplete people and asset drafts without reporting them complete", () => {
    const w = emptyWorkspace();
    w.questionnaire.people.push({
      id: "p",
      name: "",
      relationship: "",
      status: "unknown",
    });
    w.questionnaire.assets.push({
      id: "a",
      name: "",
      type: "Other",
      value: 0,
      owner: "",
      beneficiary: "",
      route: "Unknown",
    });
    expect(workspaceSchema.safeParse(w).success).toBe(true);
    expect(completion(w.questionnaire)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
