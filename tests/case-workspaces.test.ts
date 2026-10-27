import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  completion,
  parsePacket,
  reviewItems,
  verifiedFacts,
  workspaceSchema,
} from "../src/domain";
const load = (name: string) => {
  const w = workspaceSchema.parse(
    JSON.parse(readFileSync(`public/examples/${name}.json`, "utf8")),
  );
  w.packet = parsePacket(w.packet);
  return w;
};
describe("prepared PDF scenarios", () => {
  it("loads all three with prefilled details and PDF links", () => {
    for (const [id, count] of [
      ["case1", 5],
      ["case2", 5],
      ["case3", 6],
    ] as const) {
      const w = load(id);
      expect(w.questionnaire.clientName).not.toBe("");
      expect(w.questionnaire.assets.length).toBeGreaterThan(0);
      expect(w.packet.documents).toHaveLength(count);
      expect(w.packet.documents.every((d) => d.pdfPath?.endsWith(".pdf"))).toBe(
        true,
      );
    }
  });
  it("compares the Case 1 questionnaire against the will and retains a clean baseline", () => {
    expect(reviewItems(load("case1")).map((f) => f.type)).toEqual([
      "discrepancy",
    ]);
    expect(reviewItems(load("case1-clean"))).toHaveLength(0);
  });
  it("finds the Case 2 document conflict even without a questionnaire trustee answer", () => {
    const w = load("case2");
    w.questionnaire.trustee = "";
    const f = reviewItems(w).find((f) => f.type === "unresolved")!;
    expect(f).toBeDefined();
    expect(new Set(f.facts.map((f) => f.documentId)).size).toBe(2);
    expect(f.facts.map((f) => f.value).sort()).toEqual([
      "Beatrice Vance",
      "Julian M. Montgomery",
    ]);
  });
  it("opens every case with a completed client questionnaire", () => {
    for (const id of ["case1", "case2", "case3"]) {
      const q = load(id).questionnaire;
      expect(completion(q).every(Boolean)).toBe(true);
      expect(q.respondent).toContain("example client");
      expect(q.people.every((p) => p.status !== "unknown")).toBe(true);
    }
  });
  it("produces only the authorized demo findings, with no false alarms", () => {
    const summary = (id: string) =>
      reviewItems(load(id))
        .map((f) => `${f.type}:${f.title}`)
        .sort();
    expect(summary("case1")).toEqual([
      "discrepancy:Executor differs from questionnaire",
    ]);
    expect(summary("case2")).toEqual([
      "discrepancy:Executor differs from questionnaire",
      "discrepancy:Former spouse named in document",
      "unresolved:Conflicting trustee records",
    ]);
    expect(summary("case3")).toEqual([
      "discrepancy:Trustee differs from questionnaire",
    ]);
  });
  it("verifies every Case 1 asset beneficiary against a quoted page", () => {
    const w = load("case1");
    const assetFacts = verifiedFacts(w.packet).filter((f) =>
      f.subjectId.startsWith("case1-asset-"),
    );
    expect(new Set(assetFacts.map((f) => f.subjectId)).size).toBe(
      w.questionnaire.assets.length,
    );
  });
  it("notes when the questionnaire's name appears in the quote in another role", () => {
    for (const id of ["case1", "case2"]) {
      const executor = reviewItems(load(id)).find((f) =>
        f.title.startsWith("Executor"),
      )!;
      expect(executor.uncertainty).toContain(
        "also appears in the quoted passage",
      );
    }
    const trustee = reviewItems(load("case3"))[0];
    expect(new Set(trustee.facts.map((f) => f.documentId)).size).toBe(4);
    expect(trustee.uncertainty).not.toContain("also appears");
  });
  it("flags the former spouse left in the Case 2 trust copy, with the amount at stake", () => {
    const w = load("case2");
    const f = reviewItems(w).find((f) => f.title.startsWith("Former spouse"))!;
    expect(f.facts[0].value).toBe("Diane Whitaker Montgomery");
    expect(f.amount).toBe(650000);
    expect(f.observation).toContain("2010-11-05");
    // Case 1 also lists a former spouse, but no document names her: no finding.
    const c1 = load("case1");
    expect(c1.questionnaire.marriages[0].how_ended).toBe("divorce");
    expect(
      reviewItems(c1).some((f) => f.title.startsWith("Former spouse")),
    ).toBe(false);
  });
  it("gives the two cases different alternates", () => {
    expect(load("case1").questionnaire.executor).toBe("Graham M. Pendelton");
    expect(
      load("case1").packet!.documents.some((d) =>
        d.pages.some((p) => p.text.includes("Julian")),
      ),
    ).toBe(false);
  });
});
