#[test]
fn db_roundtrip_succeeds() {
    // This is a minimal synchronous smoke test for the rusqlite-backed functions.
    // It exercises open_db indirectly by calling the functions directly.
    // Note: These are async functions; call within a runtime.
    use smairs::db::{save_scenes, save_reveals, list_scenes, list_reveals, SceneRecord, RevealRecord};

    // Use a temp DB path via env var to avoid polluting real app db
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");
    std::env::set_var("SMAIRS_DB_PATH", &db_path);

    // Create a simple runtime
    let rt = tokio::runtime::Runtime::new().unwrap();

    rt.block_on(async {
        let scenes = vec![SceneRecord {
            id: "s1".into(),
            chapter_id: "c1".into(),
            start_offset: 0,
            end_offset: 100,
            word_count: 20,
            dialogue_ratio: 0.25,
        }];
        save_scenes(scenes.clone()).await.expect("save scenes");
        let got = list_scenes().await.expect("list scenes");
        assert_eq!(got.len(), 1);
        assert_eq!(got[0], scenes[0]);

        let reveals = vec![RevealRecord {
            id: "r1".into(),
            description: "A big reveal".into(),
            first_scene_id: "s1".into(),
            prereqs: "[]".into(),
        }];
        save_reveals(reveals.clone()).await.expect("save reveals");
        let got_r = list_reveals().await.expect("list reveals");
        assert_eq!(got_r.len(), 1);
        assert_eq!(got_r[0], reveals[0]);
    });
}
