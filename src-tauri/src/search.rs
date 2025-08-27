use std::path::{Path, PathBuf};
use anyhow::{Result, anyhow};
use once_cell::sync::OnceCell;
use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};
use serde::{Deserialize, Serialize};
use tantivy::{schema::*, Index, IndexReader, IndexWriter};
use tantivy::doc;


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub scene_id: String,
    pub offset: usize,
    pub snippet: String,
    pub score: f32,
    pub highlights: Vec<(usize, usize)>,
}

pub struct SearchIndex {
    pub index: Index,
    pub schema: Schema,
    text_f: Field,
    scene_f: Field,
    chapter_f: Field,
    offset_f: Field,
    chars_f: Field,
    reader: IndexReader,
}

fn index_dir() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    dir.push(".smairs");
    dir.push("index");
    dir
}

fn build_schema() -> Schema {
    let mut schema = Schema::builder();
    let _scene_f = schema.add_text_field("scene_id", TEXT | STORED);
    let _chapter_f = schema.add_text_field("chapter_id", TEXT | STORED);
    let _text_f = schema.add_text_field(
        "text",
        TextOptions::default()
            .set_indexing_options(TextFieldIndexing::default().set_tokenizer("default").set_index_option(IndexRecordOption::WithFreqsAndPositions))
            .set_stored(),
    );
    let _offset_f = schema.add_u64_field("offset", STORED);
    let _chars_f = schema.add_text_field("character_names", TEXT); // multi-value via repeated add_text
    schema.build()
}

impl SearchIndex {
    pub fn new(path: &Path) -> Result<Self> {
        let schema = build_schema();
        std::fs::create_dir_all(path)?;
        let index = if path.join("meta.json").exists() {
            Index::open_in_dir(path)?
        } else {
            Index::create_in_dir(path, schema.clone())?
        };
        // default tokenizer is fine; for fuzzy we'll use FuzzyTermQuery
        let reader = index.reader()?;
        let scene_f = index.schema().get_field("scene_id").unwrap();
        let chapter_f = index.schema().get_field("chapter_id").unwrap();
        let text_f = index.schema().get_field("text").unwrap();
        let offset_f = index.schema().get_field("offset").unwrap();
        let chars_f = index.schema().get_field("character_names").unwrap();
        Ok(Self { index, schema, text_f, scene_f, chapter_f, offset_f, chars_f, reader })
    }

    fn writer(&self) -> Result<IndexWriter> { Ok(self.index.writer(50_000_000)? /* ~50MB */) }

    pub fn index_manuscript(&mut self, scenes: &[IndexScene]) -> Result<()> {
        // Incremental: delete docs for provided scene_ids then re-add
        let mut writer = self.writer()?;
        let scene_ids: Vec<String> = scenes.iter().map(|s| s.id.clone()).collect();
        if !scene_ids.is_empty() {
            let term_queries: Vec<Term> = scene_ids
                .iter()
                .map(|id| Term::from_field_text(self.scene_f, id))
                .collect();
            for term in term_queries { writer.delete_term(term); }
        }

        for s in scenes {
            let mut document = doc!(
                self.scene_f => s.id.as_str(),
                self.chapter_f => s.chapter_id.as_str(),
                self.text_f => s.text.as_str(),
                self.offset_f => s.start_offset as u64,
            );
            // naive character extraction: capitalized words > 2 letters
            for name in extract_character_names(&s.text) { document.add_text(self.chars_f, &name.to_lowercase()); }
            writer.add_document(document)?;
        }
        writer.commit()?;
        self.reader.reload()?;
        Ok(())
    }

    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchHit>> {
        use tantivy::query::{QueryParser, FuzzyTermQuery, BooleanQuery, Occur};
        let searcher = self.reader.searcher();
        let qp = QueryParser::for_index(&self.index, vec![self.text_f]);

        // Support phrase with quotes, wildcard via QueryParser, and fuzzy terms (~= distance <=2)
        let mut subqueries: Vec<(Occur, Box<dyn tantivy::query::Query>)> = Vec::new();
        for token in split_query(query_str) {
            if token.starts_with('"') && token.ends_with('"') && token.len() > 2 {
                let q = qp.parse_query(&token)?; // phrase
                subqueries.push((Occur::Must, q));
            } else if token.contains('*') || token.contains('?') {
                let q = qp.parse_query(&token)?; // wildcard supported
                subqueries.push((Occur::Must, q));
            } else {
                let term = Term::from_field_text(self.text_f, &token);
                let q = Box::new(FuzzyTermQuery::new_prefix(term, 2, true));
                subqueries.push((Occur::Should, q));
            }
        }
        if subqueries.is_empty() {
            return Ok(vec![]);
        }
        let q: Box<dyn tantivy::query::Query> = if subqueries.len() == 1 {
            subqueries.into_iter().next().unwrap().1
        } else {
            Box::new(BooleanQuery::from(subqueries))
        };
        let top_docs = searcher.search(&q, &tantivy::collector::TopDocs::with_limit(limit))?;
        let mut hits: Vec<SearchHit> = Vec::new();
        for (score, addr) in top_docs {
            let retrieved = searcher.doc::<tantivy::TantivyDocument>(addr)?;
            let scene_id = retrieved.get_first(self.scene_f).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let scene_start = retrieved.get_first(self.offset_f).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let text = retrieved.get_first(self.text_f).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let (snippet, hl, match_pos) = make_snippet(&text, &query_str);
            let abs = match_pos.map(|p| scene_start + p).unwrap_or(scene_start);
            hits.push(SearchHit { scene_id, offset: abs, snippet, score, highlights: hl });
        }
        Ok(hits)
    }

    pub fn find_character_mentions(&self, name: &str) -> Result<Vec<SearchHit>> {
        // normalize variations: e.g., Bob -> bob, robert, mr. smith (very naive placeholder)
        let mut variants = vec![name.to_string()];
        if let Some(norm) = canonical_name(name) { variants.extend(norm); }

        let searcher = self.reader.searcher();
        use tantivy::query::{BooleanQuery, Occur, Query, FuzzyTermQuery};
        let mut shoulds: Vec<(Occur, Box<dyn Query>)> = vec![];
        for v in variants {
            let term = Term::from_field_text(self.text_f, &v);
            shoulds.push((Occur::Should, Box::new(FuzzyTermQuery::new_prefix(term, 1, true))));
        }
        if shoulds.is_empty() { return Ok(vec![]); }
        let q = BooleanQuery::from(shoulds);
        let top_docs = searcher.search(&q, &tantivy::collector::TopDocs::with_limit(200))?;
        let mut hits = vec![];
        for (score, addr) in top_docs {
            let retrieved = searcher.doc::<tantivy::TantivyDocument>(addr)?;
            let scene_id = retrieved.get_first(self.scene_f).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let scene_start = retrieved.get_first(self.offset_f).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let text = retrieved.get_first(self.text_f).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let (snippet, hl, match_pos) = make_snippet(&text, name);
            let abs = match_pos.map(|p| scene_start + p).unwrap_or(scene_start);
            hits.push(SearchHit { scene_id, offset: abs, snippet, score, highlights: hl });
        }
        Ok(hits)
    }
}

fn extract_character_names(text: &str) -> Vec<String> {
    let mut out = vec![];
    let re = regex_lite::Regex::new(r"\b([A-Z][a-z]{2,})(?:\s+[A-Z][a-z]{2,})*\b").unwrap();
    for m in re.find_iter(text) { out.push(m.as_str().to_string()); }
    out
}

fn split_query(q: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    let mut in_quote = false;
    for c in q.chars() {
        match c {
            '"' => { in_quote = !in_quote; cur.push(c); if !in_quote { out.push(cur.clone()); cur.clear(); } },
            ' ' if !in_quote => { if !cur.is_empty() { out.push(cur.clone()); cur.clear(); } },
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() { out.push(cur); }
    out
}

fn make_snippet(text: &str, query: &str) -> (String, Vec<(usize, usize)>, Option<usize>) {
    let lower = text.to_lowercase();
    let q = query.trim_matches('"').to_lowercase();
    if q.is_empty() { return (text.chars().take(160).collect(), vec![], None); }
    if let Some(pos) = lower.find(&q) {
        let start = pos.saturating_sub(60);
        let end = (pos + q.len() + 60).min(text.len());
        let snippet = String::from(&text[start..end]);
        return (snippet, vec![(pos - start, (pos - start) + q.len())], Some(pos));
    }
    (text.chars().take(160).collect(), vec![], None)
}

fn canonical_name(name: &str) -> Option<Vec<String>> {
    let n = name.to_lowercase();
    let mut out: Vec<String> = vec![];
    // Extremely naive sample mappings; production would load alias lists from metadata
    match n.as_str() {
        "bob" => out.extend(["robert".into(), "bobby".into()]),
        "rob" => out.extend(["robert".into()]),
        _ => {}
    }
    if name.split_whitespace().count() == 2 {
        let last = name.split_whitespace().last().unwrap().to_lowercase();
        out.push(format!("mr {}", last));
        out.push(format!("mrs {}", last));
        out.push(format!("ms {}", last));
    }
    if out.is_empty() { None } else { Some(out) }
}

// Global index singleton for commands
static GLOBAL_INDEX: OnceCell<RwLock<SearchIndex>> = OnceCell::new();

fn global_index() -> Result<&'static RwLock<SearchIndex>> {
    GLOBAL_INDEX.get_or_try_init(|| {
        let dir = index_dir();
        Ok::<_, anyhow::Error>(RwLock::new(SearchIndex::new(&dir)?))
    })
}

pub fn search_index_read() -> Result<RwLockReadGuard<'static, SearchIndex>> { Ok(global_index()?.read().map_err(|_| anyhow!("poisoned"))?) }
pub fn search_index_write() -> Result<RwLockWriteGuard<'static, SearchIndex>> { Ok(global_index()?.write().map_err(|_| anyhow!("poisoned"))?) }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexScene {
    pub id: String,
    pub chapter_id: String,
    pub text: String,
    pub start_offset: usize,
}
