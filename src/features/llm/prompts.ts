import { z } from "zod";

// --- System prompts --------------------------------------------------
export const systemAnalysis = `
You are Opening Lab, an expert literary development assistant.
Analyze the proposed opening candidate against the manuscript context.
Return a strict JSON object that matches the provided schema.
`;

export const systemCandidateGen = `
You are Opening Lab.
Given a manuscript, propose strong opening candidates by identifying scene IDs.
Return JSON only, matching the schema.
`;

// --- Schemas ---------------------------------------------------------
export const OpeningAnalysisSchema = z.object({
  id: z.string().optional(),
  candidateId: z.string(),
  confidence: z.number().min(0).max(1),
  spoilerCount: z.number().int().nonnegative(),
  editBurdenPercent: z.number().min(0).max(1),
  rationale: z.string(),
});

export const CandidateSchema = z.object({ id: z.string(), sceneIds: z.array(z.string()), type: z.string().default("llm") });
export const CandidateListSchema = z.object({ candidates: z.array(CandidateSchema) });

export type OpeningAnalysisOut = z.infer<typeof OpeningAnalysisSchema>;

// --- Token estimation ------------------------------------------------
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // heuristic: chars/4
  return Math.ceil(text.length / 4);
}

// --- Templates -------------------------------------------------------
export function buildAnalysisPrompt(args: { manuscriptText: string; candidateId: string; candidateText?: string }) {
  const { manuscriptText, candidateId, candidateText } = args;
  const header = `Task: Analyze opening candidate ${candidateId}\n` +
    `Goals: judge hook strength, detect spoilers, estimate edit burden, and provide rationale.`;
  const schemaHint = OpeningAnalysisSchema.toString();
  const prompt = [
    header,
    "\n== Manuscript (excerpt or full) ==\n",
    safeSliceLong(manuscriptText, 120_000),
    "\n== Candidate Opening ==\n",
    safeSliceLong(candidateText || "", 20_000),
    "\n== Output Format (JSON) ==\n",
    schemaHint,
  ].join("\n");
  return { system: systemAnalysis, prompt, schema: OpeningAnalysisSchemaToJSON() } as const;
}

export function buildCandidateGenPrompt(args: { manuscriptText: string; maxCandidates: number }) {
  const { manuscriptText, maxCandidates } = args;
  const header = `Task: Propose up to ${maxCandidates} opening candidates by listing scene IDs in order.`;
  const prompt = [
    header,
    "\n== Manuscript (excerpt or full) ==\n",
    safeSliceLong(manuscriptText, 120_000),
    "\n== Output Format ==\n",
    CandidateListSchema.toString(),
  ].join("\n");
  return { system: systemCandidateGen, prompt, schema: CandidateListSchemaToJSON() } as const;
}

// Convert zod schema to JSON Schema roughly; minimal for providers that accept json_schema
function OpeningAnalysisSchemaToJSON(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      candidateId: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      spoilerCount: { type: "integer", minimum: 0 },
      editBurdenPercent: { type: "number", minimum: 0, maximum: 1 },
      rationale: { type: "string" },
    },
    required: ["candidateId", "confidence", "spoilerCount", "editBurdenPercent", "rationale"],
    additionalProperties: false,
  };
}

function CandidateListSchemaToJSON(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, sceneIds: { type: "array", items: { type: "string" } }, type: { type: "string" } },
          required: ["id", "sceneIds"],
          additionalProperties: false,
        },
      },
    },
    required: ["candidates"],
    additionalProperties: false,
  };
}

function safeSliceLong(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Keep head and tail to preserve global/ending signals for long-context models
  const head = text.slice(0, Math.floor(maxChars * 0.8));
  const tail = text.slice(-Math.floor(maxChars * 0.2));
  return `${head}\n...\n[TRIMMED]\n...\n${tail}`;
}
