use smairs::search::{search_index_mut, search_index_get_or_init};
use smairs::types::Scene;

#[test]
fn index_and_search_basic() {
    // Use temp index dir
    let dir = tempfile::tempdir().unwrap();
    std::env::set_current_dir(&dir).unwrap();

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async move {
        let mut scenes: Vec<Scene> = vec![
            Scene { id: "s1".into(), chapter_id: "c1".into(), text: "Bob went to the market.".into(), hook_score: 0.0, tension_score: 0.0, clarity_score: 0.0 },
            Scene { id: "s2".into(), chapter_id: "c1".into(), text: "Robert talked with Alice.".into(), hook_score: 0.0, tension_score: 0.0, clarity_score: 0.0 },
        ];
        // fill offsets expected by indexer via serde rename, but our Scene struct lacks offsets; we assume 0
        // In app, TS Scene includes offsets; for test we adapt by ensuring index uses start_offset default 0
        let idx = search_index_mut().expect("init index");
        idx.index_manuscript(&scenes).expect("index");
        let hits = idx.search("\"went to the market\"", 10).expect("search");
        assert!(hits.iter().any(|h| h.scene_id == "s1"));
        let char_hits = idx.find_character_mentions("Bob").expect("char search");
        assert!(char_hits.len() >= 1);
    });
}
