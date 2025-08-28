use smairs::search::{search_index_write, IndexScene};

#[test]
fn index_and_search_basic() {
    // Use temp index dir
    let dir = tempfile::tempdir().unwrap();
    std::env::set_current_dir(&dir).unwrap();

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async move {
        let index_scenes: Vec<IndexScene> = vec![
            IndexScene { id: "s1".into(), chapter_id: "c1".into(), text: "Bob went to the market.".into(), start_offset: 0 },
            IndexScene { id: "s2".into(), chapter_id: "c1".into(), text: "Robert talked with Alice.".into(), start_offset: 23 },
        ];
        let mut idx = search_index_write().expect("init index");
        idx.index_manuscript(&index_scenes).expect("index");
        let hits = idx.search("\"went to the market\"", 10).expect("search");
        assert!(hits.iter().any(|h| h.scene_id == "s1"));
        let char_hits = idx.find_character_mentions("Bob").expect("char search");
        assert!(char_hits.len() >= 1);
    });
}
