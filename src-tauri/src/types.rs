use specta::{Type, TypeCollection};
use specta_typescript::Typescript;

// Core data types shared between Rust and TypeScript. Avoid non-serializable types.

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub chapter_id: String,
    pub text: String,
    pub hook_score: f32,
    pub tension_score: f32,
    pub clarity_score: f32,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpeningCandidate {
    pub id: String,
    pub scene_ids: Vec<String>,
    pub r#type: String,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpeningAnalysis {
    pub id: String,
    pub candidate_id: String,
    pub confidence: f32,
    pub spoiler_count: u32,
    pub edit_burden_percent: f32,
    pub rationale: String,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SpoilerViolation {
    pub id: String,
    pub reveal_id: String,
    pub location: String,
    pub severity: String,
    pub suggested_fix: String,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub verdict: DecisionVerdict,
    pub why_it_works: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub risk_notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, Type)]
pub enum DecisionVerdict {
    Accept,
    Revise,
    Reject,
}

/// Export all known Specta types in this module to a TypeScript file at the given path.
pub fn export_typescript(output_path: &str) -> specta_typescript::Result<()> {
    let types = TypeCollection::default()
        .register::<Scene>()
        .register::<OpeningCandidate>()
        .register::<OpeningAnalysis>()
        .register::<SpoilerViolation>()
        .register::<Decision>()
        .register::<DecisionVerdict>();

    Typescript::default().export_to(output_path, &types)
}
