fn main() {
    use std::path::PathBuf;
    // Build absolute output path based on the location of this Cargo manifest (src-tauri)
    let out: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/types/generated.ts");
    match smairs::types::export_typescript(out.to_str().expect("valid path")) {
        Ok(_) => println!("Generated TypeScript types at {}", out.display()),
        Err(e) => {
            eprintln!("Failed to generate TypeScript types: {}", e);
            std::process::exit(1);
        }
    }
}
