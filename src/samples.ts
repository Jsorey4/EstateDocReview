import { z } from "zod";
import {
  citedFact,
  packetSchema,
  parsePacket,
  questionnaireSchema,
  reconciliationSchema,
  squash,
  verifiedFacts,
} from "./domain";
import type { BackendFinding, Fact, Packet } from "./domain";

// Precomputed runs written by bridge/build_replay_samples.py into public/samples/. Same-origin static files only.
export const SAMPLES_BASE = "samples/";
const MAX_BYTES = 8_000_000;
const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(1).nullable();
const fileName = z.string().regex(/^[A-Za-z0-9_.-]+\.json$/);
const sampleId = z.string().regex(/^[A-Za-z0-9_.-]+$/);

export const sampleEntrySchema = z.object({
  id: sampleId,
  file: fileName,
  documents: count,
  facts: count,
  findings: count,
  flagged: count,
  unresolved: count,
});
const evaluationSummarySchema = z.object({
  variants_scored: count,
  field_accuracy: z.record(z.string(), rate),
  issues: z.object({
    expected: count,
    caught: count,
    recall: rate,
    status_correct: count,
  }),
  false_alarms: z.object({
    total: count,
    clean_variants: count,
    clean_variants_with_findings: count,
  }),
  citation_pass_rate: z.record(z.string(), rate),
  time: z.object({
    reconcile_seconds_total: z.number().nonnegative(),
    extraction_seconds_total: z.number().nonnegative().nullable(),
  }),
});
export const manifestSchema = z.object({
  bundleVersion: z.literal(1),
  synthetic: z.literal(true),
  builtAt: z.string(),
  run: z.string(),
  samples: z.array(sampleEntrySchema).max(200),
  skipped: z.array(z.string()),
  evaluation: evaluationSummarySchema.nullable(),
});

const variantEvaluationSchema = z.object({
  expected_issues: count,
  issues_caught: count,
  status_correct: count,
  false_alarms: count,
  false_alarm_ids: z.array(z.string()),
  fields: z.record(
    z.string(),
    z.object({ expected: count, found: count, page_correct: count }),
  ),
  citations: z.record(z.string(), z.object({ facts: count, verified: count })),
  extraction_seconds: z.number().nonnegative().nullable(),
});
export const bundleSchema = z.object({
  bundleVersion: z.literal(1),
  id: sampleId,
  synthetic: z.literal(true),
  valuesAreHypothetical: z.literal(true),
  questionnaire: questionnaireSchema,
  extractedFacts: count,
  packet: packetSchema,
  reconciliation: reconciliationSchema,
  reconcileSeconds: z.number().nonnegative(),
  extractionSeconds: z.number().nonnegative().nullable(),
  evaluation: variantEvaluationSchema.nullable(),
});
export type Manifest = z.infer<typeof manifestSchema>;
export type SampleEntry = z.infer<typeof sampleEntrySchema>;
export type SampleBundle = z.infer<typeof bundleSchema> & { packet: Packet };

export class SampleError extends Error {}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
async function readJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const response = await fetcher(url, { cache: "no-cache" });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new SampleError(
      `The sample file could not be loaded (${response.status}).`,
    );
  const body = await response.text();
  if (body.length > MAX_BYTES)
    throw new SampleError("The sample file exceeds the 8 MB browser limit.");
  try {
    return JSON.parse(body);
  } catch {
    // Vite's dev server answers a missing file with index.html; treat that as absent.
    if (body.trimStart().startsWith("<")) return null;
    throw new SampleError("The sample file is not valid JSON.");
  }
}

/** The manifest, or null when no samples have been published yet. */
export async function fetchManifest(
  fetcher: Fetcher = fetch,
  base = SAMPLES_BASE,
): Promise<Manifest | null> {
  const raw = await readJson(fetcher, `${base}index.json`);
  if (raw === null) return null;
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success)
    throw new SampleError(
      "samples/index.json does not match the format written by bridge/build_replay_samples.py.",
    );
  return parsed.data;
}

export function parseBundle(raw: unknown, entry?: SampleEntry): SampleBundle {
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success)
    throw new SampleError(
      "This sample does not match the format written by bridge/build_replay_samples.py.",
    );
  if (entry && parsed.data.id !== entry.id)
    throw new SampleError("This sample's ID does not match the manifest.");
  return { ...parsed.data, packet: parsePacket(parsed.data.packet) };
}

const cache = new Map<string, Promise<SampleBundle>>();
export function fetchBundle(
  entry: SampleEntry,
  fetcher: Fetcher = fetch,
  base = SAMPLES_BASE,
): Promise<SampleBundle> {
  const key = `${base}${entry.file}`;
  if (!cache.has(key))
    cache.set(
      key,
      readJson(fetcher, key)
        .then((raw) => {
          if (raw === null)
            throw new SampleError(`${entry.file} is listed but missing.`);
          return parseBundle(raw, entry);
        })
        .catch((e) => {
          cache.delete(key);
          throw e;
        }),
    );
  return cache.get(key)!;
}

/** Hard rule 1: a finding is shown only if every document citation is a verified packet fact. */
export function shownFindings(bundle: SampleBundle) {
  const shown: BackendFinding[] = [];
  const withheld: BackendFinding[] = [];
  for (const f of bundle.reconciliation.findings)
    (f.evidence.every(
      (e) => e.source !== "document" || citedFact(e, bundle.packet),
    )
      ? shown
      : withheld
    ).push(f);
  return { shown, withheld };
}

export type StepId =
  | "documents"
  | "extraction"
  | "verification"
  | "reconciliation"
  | "findings"
  | "evaluation";
export type ReplayStep = {
  id: StepId;
  title: string;
  stage: string;
  summary: string;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function verificationStats(packet: Packet) {
  // Packet facts repeat once per linked asset; count each extracted fact once.
  const unique = new Map<string, Fact>();
  for (const f of packet.facts)
    unique.set(
      `${f.documentId}:${f.id.slice(f.documentId.length + 1).split(":")[0]}`,
      f,
    );
  const verified = new Set(verifiedFacts(packet).map((f) => f.id));
  const bySource: Record<string, { facts: number; verified: number }> = {};
  const methods: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const failures: Fact[] = [];
  for (const f of unique.values()) {
    const source =
      packet.documents.find((d) => d.id === f.documentId)?.extractionSource ??
      "digital";
    const row = (bySource[source] ??= { facts: 0, verified: 0 });
    row.facts++;
    if (verified.has(f.id)) {
      row.verified++;
      const m = f.backendVerification?.method ?? "exact";
      methods[m] = (methods[m] ?? 0) + 1;
    } else {
      const r = f.backendVerification?.reason ?? "not verified";
      reasons[r] = (reasons[r] ?? 0) + 1;
      failures.push(f);
    }
  }
  const total = unique.size;
  const ok = Object.values(bySource).reduce((n, r) => n + r.verified, 0);
  return { total, verified: ok, bySource, methods, reasons, failures };
}

export function replaySteps(bundle: SampleBundle): ReplayStep[] {
  const { packet, reconciliation: r } = bundle;
  const pages = packet.documents.reduce((n, d) => n + d.pages.length, 0);
  const scanned = packet.documents.filter(
    (d) => d.extractionSource === "scanned",
  ).length;
  const v = verificationStats(packet);
  const { shown } = shownFindings(bundle);
  const flagged = shown.filter((f) => f.status === "flagged").length;
  const steps: ReplayStep[] = [
    {
      id: "documents",
      stage: "Intake",
      title: "Source documents",
      summary: `${plural(packet.documents.length, "document")}, ${plural(pages, "page")}${scanned ? `, ${scanned} scanned` : ""}.`,
    },
    {
      id: "extraction",
      stage: "Extract",
      title: "Structured extraction",
      summary: `${plural(bundle.extractedFacts, "fact")} recorded, each with a verbatim quote and page.`,
    },
    {
      id: "verification",
      stage: "Verify",
      title: "Quote verification",
      summary: `${v.verified} of ${v.total} quotes found on the stated page.`,
    },
    {
      id: "reconciliation",
      stage: "Reconcile",
      title: "Cross-source reconciliation",
      summary: `${plural(r.summary.verified_facts, "verified fact")} compared with the questionnaire and asset inventory.`,
    },
    {
      id: "findings",
      stage: "Review",
      title: "Advisor review",
      summary: shown.length
        ? `${plural(flagged, "flagged item")}, ${shown.length - flagged} unresolved.`
        : "Zero material findings.",
    },
  ];
  if (bundle.evaluation)
    steps.push({
      id: "evaluation",
      stage: "Measure",
      title: "Evaluation",
      summary: `${bundle.evaluation.issues_caught} of ${bundle.evaluation.expected_issues} planted issues caught, ${plural(bundle.evaluation.false_alarms, "false alarm")}.`,
    });
  return steps;
}

/** Split a page around the first occurrence of a quote (whitespace-insensitive). */
export function highlight(text: string, quote: string) {
  const needle = squash(quote);
  if (!needle) return null;
  // Map each squashed character back to its index in the original text.
  const map: number[] = [];
  let flat = "";
  const source = text.normalize("NFKC");
  for (let i = 0; i < source.length; i++) {
    const ws = /\s/.test(source[i]);
    if (ws && (flat.endsWith(" ") || !flat)) continue;
    flat += ws ? " " : source[i];
    map.push(i);
  }
  const at = flat.indexOf(needle);
  if (at < 0) return null;
  const start = map[at];
  const end = map[at + needle.length - 1] + 1;
  return [source.slice(0, start), source.slice(start, end), source.slice(end)];
}
