import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { workspaceSchema, parsePacket, reviewItems } from "../src/domain";
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
});
