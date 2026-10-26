import { z } from "zod";

export const personSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  relationship: z.string(),
  status: z.enum(["living", "deceased", "unknown"]),
});
export const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum([
    "Retirement account",
    "Investment account",
    "Bank account",
    "Real estate",
    "Life insurance",
    "Business interest",
    "Other",
  ]),
  value: z.number().finite().nonnegative(),
  owner: z.string(),
  beneficiary: z.string(),
  route: z.enum([
    "Unknown",
    "Will / probate",
    "Revocable trust",
    "Beneficiary designation",
    "Joint ownership",
  ]),
});
export const questionnaireSchema = z.object({
  household: z.string(),
  respondent: z.string(),
  maritalStatus: z.string(),
  spouse: z.string(),
  state: z.literal("Texas"),
  events: z.array(z.string()),
  people: z.array(personSchema),
  assets: z.array(assetSchema),
  executor: z.string(),
  trustee: z.string(),
  agent: z.string(),
  intentions: z.string(),
  concerns: z.string(),
  reviewed: z.boolean(),
});
const pageSchema = z.object({
  page: z.number().int().positive(),
  text: z.string().min(1).max(200000),
});
export const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum([
    "Will",
    "Revocable trust",
    "Amendment",
    "Beneficiary designation",
    "Titling record",
    "Power of attorney",
    "Other",
  ]),
  date: z.string(),
  source: z.enum(["synthetic", "public"]),
  sourceUrl: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//.test(v))
    .optional(),
  pages: z.array(pageSchema).min(1).max(1000),
});
export const factSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  subjectId: z.string().min(1),
  field: z.enum(["beneficiary", "owner", "executor", "trustee", "agent"]),
  value: z.string().min(1),
  quote: z.string().min(1),
  page: z.number().int().positive(),
  verification: z.enum(["verified", "unverified"]),
});
export const packetSchema = z
  .object({
    schemaVersion: z.literal(1),
    verifiedBy: z.literal("verify_quotes.py"),
    documents: z.array(documentSchema).max(100),
    facts: z.array(factSchema).max(10000),
  })
  .superRefine((p, ctx) => {
    for (const [name, rows] of [
      ["documents", p.documents],
      ["facts", p.facts],
    ] as const) {
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${name} IDs` });
    }
    for (const d of p.documents) {
      if (new Set(d.pages.map((p) => p.page)).size !== d.pages.length)
        ctx.addIssue({
          code: "custom",
          message: `Duplicate page numbers in ${d.title}`,
        });
      if (d.source === "public" && !d.sourceUrl)
        ctx.addIssue({
          code: "custom",
          message: `A public source URL is required for ${d.title}`,
        });
    }
    for (const f of p.facts)
      if (!p.documents.some((d) => d.id === f.documentId))
        ctx.addIssue({
          code: "custom",
          message: `Missing document for fact ${f.id}`,
        });
  });
export type Person = z.infer<typeof personSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Questionnaire = z.infer<typeof questionnaireSchema>;
export type ReviewDocument = z.infer<typeof documentSchema>;
export type Fact = z.infer<typeof factSchema>;
export type Packet = z.infer<typeof packetSchema>;
export type Page =
  "overview" | "questionnaire" | "documents" | "flow" | "review" | "report";
export type Disposition = {
  status: "open" | "discussed" | "attorney";
  note: string;
};
export const workspaceSchema = z.object({
  version: z.literal(1),
  questionnaire: questionnaireSchema,
  packet: packetSchema.nullable(),
  dispositions: z.record(
    z.string(),
    z.object({
      status: z.enum(["open", "discussed", "attorney"]),
      note: z.string(),
    }),
  ),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const emptyQuestionnaire: Questionnaire = {
  household: "",
  respondent: "",
  maritalStatus: "",
  spouse: "",
  state: "Texas",
  events: [],
  people: [],
  assets: [],
  executor: "",
  trustee: "",
  agent: "",
  intentions: "",
  concerns: "",
  reviewed: false,
};
export const emptyWorkspace = (): Workspace => ({
  version: 1,
  questionnaire: { ...emptyQuestionnaire, people: [], assets: [], events: [] },
  packet: null,
  dispositions: {},
});
export const normalize = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
export const quoteMatches = (fact: Fact, document?: ReviewDocument) => {
  const page = document?.pages.find((p) => p.page === fact.page);
  // Case-sensitive verbatim match after whitespace normalization; uncertain OCR stays unverified.
  const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  return (
    !!page &&
    !!squash(fact.quote) &&
    squash(page.text).includes(squash(fact.quote))
  );
};
export function verifiedFacts(packet: Packet | null): Fact[] {
  return (
    packet?.facts.filter(
      (f) =>
        f.verification === "verified" &&
        quoteMatches(
          f,
          packet.documents.find((d) => d.id === f.documentId),
        ),
    ) ?? []
  );
}
export function parsePacket(input: unknown): Packet {
  const packet = packetSchema.parse(input);
  return {
    ...packet,
    facts: packet.facts.map((f) => ({
      ...f,
      verification:
        f.verification === "verified" &&
        quoteMatches(
          f,
          packet.documents.find((d) => d.id === f.documentId),
        )
          ? "verified"
          : "unverified",
    })),
  };
}
export function completion(q: Questionnaire) {
  return [
    !!q.household.trim() && !!q.respondent.trim() && !!q.maritalStatus,
    q.people.length > 0 && q.people.every((p) => !!p.name.trim()),
    q.assets.length > 0 && q.assets.every((a) => !!a.name.trim()),
    !!q.intentions.trim(),
    q.reviewed,
  ];
}
export type Finding = {
  id: string;
  type: "discrepancy" | "unresolved";
  title: string;
  observation: string;
  uncertainty: string;
  question: string;
  facts: Fact[];
  expected: string;
  subject: string;
};
export function reconcile(q: Questionnaire, packet: Packet | null): Finding[] {
  const facts = verifiedFacts(packet);
  const subjects = [
    ...q.assets.flatMap((a) =>
      (["beneficiary", "owner"] as const).map((field) => ({
        id: a.id,
        label: a.name,
        field,
        expected: a[field],
      })),
    ),
    ...(["executor", "trustee", "agent"] as const).map((field) => ({
      id: "household",
      label: "Household",
      field,
      expected: q[field],
    })),
  ];
  const findings: Finding[] = [];
  for (const subject of subjects) {
    const evidence = facts.filter(
      (f) => f.subjectId === subject.id && f.field === subject.field,
    );
    if (!evidence.length) continue;
    const distinct = new Set(evidence.map((f) => normalize(f.value)));
    const ambiguous = distinct.size > 1;
    if (
      !ambiguous &&
      (!subject.expected.trim() ||
        normalize(evidence[0].value) === normalize(subject.expected))
    )
      continue;
    const dead = q.people.some(
      (p) =>
        p.status === "deceased" &&
        evidence.some((f) => normalize(f.value) === normalize(p.name)),
    );
    const fingerprint = evidence
      .map((f) => `${f.documentId}:${f.page}:${f.value}:${f.quote}`)
      .sort()
      .join("|");
    findings.push({
      id: `${subject.id}:${subject.field}:${subject.expected}:${fingerprint}`,
      type: ambiguous ? "unresolved" : "discrepancy",
      title: ambiguous
        ? `Conflicting ${subject.field} records`
        : `${subject.field[0].toUpperCase() + subject.field.slice(1)} differs from questionnaire`,
      observation: ambiguous
        ? `${subject.label} has different ${subject.field} names in the supplied records.`
        : `${subject.label} names “${evidence[0].value}” in the document; the questionnaire names “${subject.expected}”.`,
      uncertainty: ambiguous
        ? "Document precedence has not been established. Neither record is assumed to supersede the other."
        : `A name difference may reflect aliases, incomplete records, or a deliberate choice.${dead ? " The questionnaire also reports this person as deceased." : ""} Legal effect has not been determined.`,
      question: `Confirm the current ${subject.field} record and the client’s intention. Which record is in effect? Refer questions about legal effect to an estate attorney.`,
      facts: evidence,
      expected: subject.expected,
      subject: subject.label,
    });
  }
  return findings;
}
export function routeEvidence(asset: Asset, packet: Packet | null) {
  return verifiedFacts(packet).filter((f) => f.subjectId === asset.id);
}
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
export const uid = () => crypto.randomUUID();
export const STORAGE_KEY = "estate-review.workspace.v1";
export function loadWorkspace(): { workspace: Workspace; error: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { workspace: emptyWorkspace(), error: "" };
    const workspace = workspaceSchema.parse(JSON.parse(raw));
    if (workspace.packet) workspace.packet = parsePacket(workspace.packet);
    return { workspace, error: "" };
  } catch {
    return {
      workspace: emptyWorkspace(),
      error:
        "The saved workspace could not be read. It has been preserved in browser storage. Download a backup or clear it before saving new work.",
    };
  }
}
export function download(
  filename: string,
  contents: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
