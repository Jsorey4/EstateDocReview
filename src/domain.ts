import { z } from "zod";
import {
  BACKEND_FIELDS,
  BACKEND_DOCUMENT_TYPES,
  BACKEND_ISSUE_TYPES,
} from "./backendContract.generated";

export const RELATIONSHIP_KINDS = [
  "parent",
  "child",
  "spouse",
  "attorney",
  "other",
] as const;
export const personSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  // The standard category, or the client's own words when relationshipKind is "other".
  relationship: z.string(),
  relationshipKind: z.enum(RELATIONSHIP_KINDS).optional(),
  status: z.enum(["living", "deceased", "unknown"]),
  note: z.string().default(""),
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
  character: z.enum(["community", "separate", "unknown"]).default("unknown"),
  governing_document: z.string().default(""),
  retirementKind: z.enum(["retirement_401k", "ira"]).default("retirement_401k"),
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
  note: z.string().default(""),
});
export const questionnaireSchema = z.object({
  clientName: z.string().default(""),
  asOf: z.string().default(""),
  marriages: z
    .array(
      z.object({
        spouse: z.string(),
        married: z.string(),
        ended: z.string(),
        how_ended: z.enum(["", "divorce", "death"]),
      }),
    )
    .default([]),
  intended_beneficiaries: z
    .array(
      z.object({
        name: z.string(),
        // A percentage such as "50%". Older answers may hold a description.
        share: z.string(),
        note: z.string().default(""),
      }),
    )
    .default([]),
  documents_available: z.array(z.enum(BACKEND_DOCUMENT_TYPES)).default([]),
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
  text: z.string().max(200000),
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
  pdfPath: z
    .string()
    .regex(/^examples\/pdfs\/[A-Za-z0-9_-]+\.pdf$/)
    .optional(),
  backendVerifier: z.record(z.string(), z.unknown()).optional(),
  extraction: z.record(z.string(), z.unknown()).optional(),
  unreadablePages: z.array(z.number().int().positive()).optional(),
  extractionSource: z.enum(["digital", "scanned"]).optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  source: z.enum(["synthetic", "public", "user_supplied"]),
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
  field: z.enum([...BACKEND_FIELDS, "owner", "agent"]),
  detail: z.string().optional(),
  backendField: z.enum(BACKEND_FIELDS).optional(),
  backendVerification: z
    .object({
      status: z.enum(["verified", "unverified"]),
      method: z.enum(["exact", "exact_compact", "fuzzy"]).nullable(),
      score: z.number().nullable(),
      page_checked: z.number().int().nullable(),
      found_on_pages: z.array(z.number().int()),
      value_supported: z.boolean().nullable(),
      reason: z.string().nullable(),
    })
    .optional(),
  value: z.string(),
  quote: z.string(),
  page: z.number().int().positive(),
  verification: z.enum(["verified", "unverified"]),
});
export const packetSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
    if (p.schemaVersion === 2) {
      for (const d of p.documents)
        if (!d.sha256 || !d.extractionSource)
          ctx.addIssue({
            code: "custom",
            message:
              "Backend packets require document hashes and extraction sources",
          });
      for (const f of p.facts)
        if (
          !f.backendField ||
          f.field !== f.backendField ||
          !f.backendVerification ||
          f.verification !== f.backendVerification.status
        )
          ctx.addIssue({
            code: "custom",
            message: "Backend verification metadata is missing or inconsistent",
          });
    }
    for (const f of p.facts)
      if (!p.documents.some((d) => d.id === f.documentId))
        ctx.addIssue({
          code: "custom",
          message: `Missing document for fact ${f.id}`,
        });
  });
const count = z.number().int().nonnegative();
// Output of reconcile.py (Python rules over verified facts), as packaged by bridge/build_replay_samples.py.
const evidenceSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("document"),
    doc: z.string(),
    page: z.number().int().positive(),
    field: z.string(),
    quote: z.string(),
    verification: z.string().nullable(),
  }),
  z.object({
    source: z.literal("questionnaire"),
    path: z.string(),
    value: z.unknown(),
  }),
]);
const findingSchema = z.object({
  id: z.string(),
  issue_type: z.enum(BACKEND_ISSUE_TYPES),
  status: z.enum(["flagged", "unresolved"]),
  documents: z.array(z.string()),
  people: z.array(z.string()),
  assets: z.array(z.string()),
  amount_at_stake_usd: z.number().nonnegative().nullable(),
  amount_is_hypothetical: z.literal(true),
  observation: z.string(),
  evidence: z.array(evidenceSchema).min(1),
  uncertainty: z.string(),
  next_question: z.string(),
  rule_refs: z.array(z.unknown()),
  disclaimer: z.string(),
});
export const reconciliationSchema = z.object({
  reconcile_version: z.string(),
  synthetic: z.literal(true),
  values_are_hypothetical: z.literal(true),
  rule_pack_status: z.string(),
  disclaimer: z.string(),
  client: z.string(),
  findings: z.array(findingSchema),
  summary: z.object({
    findings: count,
    flagged: count,
    unresolved: count,
    amount_at_stake_flagged_usd: z.number().nullable(),
    documents: z.array(z.string()),
    verified_facts: count,
    unverified_facts_excluded: count,
  }),
  coverage: z.object({
    gaps: z.array(z.object({ document: z.string(), reason: z.string() })),
    unverified_facts: z.array(
      z.object({
        document: z.string(),
        field: z.string().nullable(),
        value: z.string().nullable(),
        reason: z.string().nullable(),
      }),
    ),
    people_named_in_documents_but_not_in_questionnaire: z.array(z.string()),
    document_types_in_questionnaire_but_not_provided: z.array(z.string()),
  }),
});
export type Person = z.infer<typeof personSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Questionnaire = z.infer<typeof questionnaireSchema>;
export type ReviewDocument = z.infer<typeof documentSchema>;
export type Fact = z.infer<typeof factSchema>;
export type Packet = z.infer<typeof packetSchema>;
export type Reconciliation = z.infer<typeof reconciliationSchema>;
export type BackendFinding = z.infer<typeof findingSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Page =
  | "overview"
  | "questionnaire"
  | "documents"
  | "flow"
  | "review"
  | "report"
  | "replay";
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
  // reconcile.py output for this packet, with the questionnaire it was computed against.
  backend: z
    .object({
      source: z.string(),
      questionnaire: questionnaireSchema,
      reconciliation: reconciliationSchema,
    })
    .nullable()
    .default(null),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const emptyQuestionnaire: Questionnaire = {
  clientName: "",
  asOf: "",
  marriages: [],
  intended_beneficiaries: [],
  documents_available: [],
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
  backend: null,
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
function evidenceVerified(f: Fact, packet: Packet): boolean {
  const doc = packet.documents.find((d) => d.id === f.documentId);
  if (packet.schemaVersion === 1)
    return f.verification === "verified" && quoteMatches(f, doc);
  const v = f.backendVerification;
  // V2 is a trusted, precomputed result from bridge/facts_to_review_packet.py, not browser-side OCR verification.
  return (
    f.verification === "verified" &&
    v?.status === "verified" &&
    v.value_supported !== false &&
    v.page_checked === f.page &&
    !!v.method &&
    !!doc?.pages.some((p) => p.page === f.page) &&
    (v.method !== "fuzzy" || doc.extractionSource === "scanned")
  );
}
export function verifiedFacts(packet: Packet | null): Fact[] {
  return packet?.facts.filter((f) => evidenceVerified(f, packet)) ?? [];
}

export function parsePacket(input: unknown): Packet {
  const packet = packetSchema.parse(input);
  return {
    ...packet,
    facts: packet.facts.map((f) => ({
      ...f,
      verification:
        packet.schemaVersion === 2
          ? f.verification
          : evidenceVerified(f, packet)
            ? "verified"
            : "unverified",
    })),
  };
}
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];
export function relationshipKind(p: Person): RelationshipKind | "" {
  if (p.relationshipKind) return p.relationshipKind;
  const text = normalize(p.relationship);
  if ((RELATIONSHIP_KINDS as readonly string[]).includes(text))
    return text as RelationshipKind;
  return text ? "other" : "";
}
// Words a client might type under Other that map to a standard category. Offered, never applied.
export const RELATIONSHIP_SUGGESTIONS: Record<string, RelationshipKind> = {
  wife: "spouse",
  husband: "spouse",
  mother: "parent",
  father: "parent",
  mom: "parent",
  dad: "parent",
  son: "child",
  daughter: "child",
  lawyer: "attorney",
};
/** "75", "75%" or "75.5 %" as a number from 0 to 100; anything else is null. */
export function parsePercent(share: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(share);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 100 ? n : null;
}
/** What blocks each of the first four steps from counting as complete. */
export function missingItems(q: Questionnaire): string[][] {
  return [
    [
      !q.household.trim() && "Household name",
      !q.respondent.trim() && "Who completed the questionnaire",
      !q.maritalStatus && "Marital status",
    ].filter((s): s is string => !!s),
    q.people.length
      ? q.people.flatMap((p, i) =>
          p.name.trim() ? [] : [`Name for person ${i + 1}`],
        )
      : ["At least one person"],
    q.assets.length
      ? q.assets.flatMap((a, i) =>
          a.name.trim() ? [] : [`Name for asset ${i + 1}`],
        )
      : ["At least one asset"],
    q.intentions.trim() ? [] : ["The client's intentions, in their words"],
  ];
}
/** Gaps that do not block a step but should be confirmed before the review. */
export function reviewWarnings(q: Questionnaire): string[][] {
  const household: string[] = [];
  if (!q.clientName.trim() || !q.asOf)
    household.push("Client name and as-of date (needed for backend export)");
  if (q.maritalStatus === "Married" && !q.marriages.some((m) => !m.ended))
    household.push("The current marriage in marriage history");
  q.marriages.forEach((m, i) => {
    if (!m.spouse.trim() || !m.married)
      household.push(`Spouse and date for marriage ${i + 1}`);
  });
  const people = q.people.flatMap((p, i) => {
    const kind = relationshipKind(p);
    return [
      !kind && `Relationship for person ${i + 1}`,
      kind === "other" &&
        !p.relationship.trim() &&
        `Describe the relationship for person ${i + 1}`,
      p.status === "unknown" && `Living or deceased for person ${i + 1}`,
    ].filter((s): s is string => !!s);
  });
  const wishes: string[] = [];
  const shares = q.intended_beneficiaries.map((b) => parsePercent(b.share));
  q.intended_beneficiaries.forEach((b, i) => {
    if (!b.name.trim()) wishes.push(`Name for beneficiary ${i + 1}`);
    if (!b.share.trim()) wishes.push(`Share for beneficiary ${i + 1}`);
    else if (shares[i] === null)
      wishes.push(`Share for beneficiary ${i + 1} as a percentage`);
  });
  if (shares.length && shares.every((s) => s !== null)) {
    const total = Math.round(shares.reduce((a, s) => a + s!, 0) * 100) / 100;
    if (total !== 100) wishes.push(`Shares add up to ${total}%, not 100%`);
  }
  return [household, people, [], wishes];
}
export function completion(q: Questionnaire) {
  return [...missingItems(q).map((m) => m.length === 0), q.reviewed];
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
  // Set on findings from reconcile.py; absent on the browser's own name comparisons.
  origin?: "reconcile";
  questionnaireEvidence?: string[];
  assets?: string[];
  amount?: number | null;
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
    ...(["executor", "trustee"] as const).map((field) => ({
      id: "household",
      label: "Household",
      field,
      expected: q[field],
    })),
  ];
  const findings: Finding[] = [];
  for (const subject of subjects) {
    const evidence = facts.filter(
      (f) =>
        f.subjectId === subject.id &&
        (packet?.schemaVersion === 2
          ? subject.field === "beneficiary"
            ? ["beneficiary", "primary_beneficiary"].includes(f.field)
            : subject.field === "owner"
              ? f.field === "titled_owner"
              : subject.field === "trustee"
                ? f.field === "successor_trustee"
                : f.field === subject.field
          : f.field === subject.field),
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
    const household = subject.id === "household";
    const source = (f: Fact) =>
      packet?.documents.find((d) => d.id === f.documentId)?.title ??
      "The document";
    const names = [...new Set(evidence.map((f) => f.value))];
    // The questionnaire's name can sit in the same passage in another role, such as an alternate.
    const alsoQuoted =
      !!subject.expected.trim() &&
      evidence.some((f) =>
        normalize(f.quote).includes(normalize(subject.expected)),
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
        ? `The supplied records name different ${subject.field}s${household ? "" : ` for ${subject.label}`}: ${names.map((n) => `“${n}”`).join(" and ")}.`
        : `${source(evidence[0])} names “${evidence[0].value}” as ${subject.field}${household ? "" : ` for ${subject.label}`}${evidence.length > 1 ? `, as do ${evidence.length - 1} other quoted ${evidence.length === 2 ? "passage" : "passages"}` : ""}; the questionnaire names “${subject.expected}”.`,
      uncertainty: ambiguous
        ? "Multiple names may reflect co-appointments, shares, conditions, or different document versions. Confirm the role and document precedence; no record is assumed to supersede another."
        : `A name difference may reflect aliases, incomplete records, or a deliberate choice.${alsoQuoted ? ` “${subject.expected}” also appears in the quoted passage, possibly in another role such as alternate or successor.` : ""}${dead ? " The questionnaire also reports this person as deceased." : ""} Legal effect has not been determined.`,
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
export const squash = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim();

/** The verified packet fact behind a document citation, if the packet still verifies it. */
export function citedFact(e: Evidence, packet: Packet): Fact | undefined {
  if (e.source !== "document") return undefined;
  return verifiedFacts(packet).find(
    (f) =>
      f.documentId === e.doc &&
      f.page === e.page &&
      f.backendField === e.field &&
      squash(f.quote) === squash(e.quote),
  );
}

export const ISSUE_LABELS: Record<
  (typeof BACKEND_ISSUE_TYPES)[number],
  string
> = {
  former_spouse_beneficiary: "Former spouse named on a designation",
  deceased_fiduciary: "Deceased person appointed to a role",
  deceased_beneficiary: "Deceased person named as beneficiary",
  document_predates_marriage: "Document dated before the current marriage",
  asset_outside_trust: "Asset registered outside the trust",
  intent_mismatch: "Intended beneficiary not named in any document",
  undated_amendment: "Amendment date is blank",
};

export function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  if (typeof value !== "object") return String(value);
  return (
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${describeValue(v)}`)
      .join(" · ") || "(blank)"
  );
}

/** Backend findings as review items. Hard rule 1: a finding whose cited quotes are not all
 * verified facts in the current packet is withheld, never shown. */
export function backendFindings(w: Workspace) {
  const shown: Finding[] = [];
  let withheld = 0;
  if (!w.backend || !w.packet) return { shown, withheld, stale: false };
  const packet = w.packet;
  const title = (id: string) =>
    packet.documents.find((d) => d.id === id)?.title ?? id;
  for (const f of w.backend.reconciliation.findings) {
    const cited = f.evidence.map((e) =>
      e.source === "document" ? citedFact(e, packet) : null,
    );
    if (cited.some((c) => c === undefined)) {
      withheld++;
      continue;
    }
    const assetNames = f.assets.map(
      (id) => w.questionnaire.assets.find((a) => a.id === id)?.name || id,
    );
    shown.push({
      id: `reconcile:${f.issue_type}:${f.documents.join(",")}:${f.people.join(",")}`,
      origin: "reconcile",
      type: f.status === "flagged" ? "discrepancy" : "unresolved",
      title: ISSUE_LABELS[f.issue_type],
      observation: f.observation,
      uncertainty: f.uncertainty,
      question: f.next_question,
      facts: cited.filter((c): c is Fact => !!c),
      questionnaireEvidence: f.evidence.flatMap((e) =>
        e.source === "questionnaire"
          ? [`${e.path}: ${describeValue(e.value)}`]
          : [],
      ),
      expected: "",
      subject:
        assetNames.join(", ") ||
        f.documents.map(title).join(", ") ||
        f.people.join(", "),
      assets: f.assets,
      amount: f.amount_at_stake_usd,
    });
  }
  const stale =
    JSON.stringify(w.backend.questionnaire) !== JSON.stringify(w.questionnaire);
  return { shown, withheld, stale };
}

/** Everything in the review queue: reconcile.py findings first, then the name comparisons. */
export function reviewItems(w: Workspace): Finding[] {
  return [...backendFindings(w).shown, ...reconcile(w.questionnaire, w.packet)];
}
export const findingTouchesAsset = (f: Finding, assetId: string) =>
  !!f.assets?.includes(assetId) || f.facts.some((e) => e.subjectId === assetId);
