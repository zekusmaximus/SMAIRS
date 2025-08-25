// This file will be overwritten by Specta. DO NOT EDIT.
// Placeholder to satisfy TypeScript before first generation.

export type Scene = {
	id: string;
	chapterId: string;
	text: string;
	hookScore: number;
	tensionScore: number;
	clarityScore: number;
};

export type OpeningCandidate = {
	id: string;
	sceneIds: string[];
	type: string;
};

export type OpeningAnalysis = {
	id: string;
	candidateId: string;
	confidence: number;
	spoilerCount: number;
	editBurdenPercent: number;
	rationale: string;
};

export type SpoilerViolation = {
	id: string;
	revealId: string;
	location: string;
	severity: string;
	suggestedFix: string;
};

export type DecisionVerdict = "Accept" | "Revise" | "Reject";

export type Decision = {
	verdict: DecisionVerdict;
	whyItWorks: string[];
	riskNotes?: string;
};
