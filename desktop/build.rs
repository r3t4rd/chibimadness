//! Generates the compile-time registry for the production web distribution.

use std::{env, fs, path::Path};

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "css", "gif", "html", "ico", "jpeg", "jpg", "js", "json", "png", "svg", "webp", "woff2",
];

fn main() {
    let manifest_directory = env::var("CARGO_MANIFEST_DIR").expect("Cargo sets manifest directory");
    let dist_directory = Path::new(&manifest_directory).join("../dist");
    println!("cargo:rerun-if-changed={}", dist_directory.display());

    let mut assets = Vec::new();
    collect_assets(&dist_directory, &dist_directory, &mut assets);
    assets.sort();
    assert!(
        assets.iter().any(|(path, _)| path == "index.html"),
        "dist/index.html is missing; run npm ci and npm run build in the repository root"
    );

    let mut generated = String::from(
        "/// Builds the fixed local page from the packaged production assets.\n\
         pub fn local_page(csp: LocalCsp) -> Result<LocalPage, Box<dyn Error>> {\n",
    );
    generated.push_str("    let entry = AssetPath::parse(\"index.html\")?;\n");
    generated.push_str(
        "    let mut assets = AssetBundle::new(MimePolicy::strict(), AssetLimits::default());\n",
    );
    for (logical_path, absolute_path) in assets {
        generated.push_str(&format!(
            "    assets.insert(AssetPath::parse({logical_path:?})?, include_bytes!({absolute_path:?}).to_vec())?;\n"
        ));
    }
    generated.push_str("    Ok(LocalPage::new(entry, assets, csp)?)\n}\n");

    let output = Path::new(&env::var("OUT_DIR").expect("Cargo sets OUT_DIR")).join("embedded_assets.rs");
    fs::write(output, generated).expect("write generated asset registry");
}

fn collect_assets(root: &Path, directory: &Path, assets: &mut Vec<(String, String)>) {
    for entry in fs::read_dir(directory).expect("read web distribution directory") {
        let entry = entry.expect("read web distribution entry");
        let path = entry.path();
        if path.is_dir() {
            collect_assets(root, &path, assets);
            continue;
        }
        let supported = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| SUPPORTED_EXTENSIONS.contains(&extension));
        if !supported {
            continue;
        }
        let logical_path = path
            .strip_prefix(root)
            .expect("asset remains inside web distribution")
            .to_string_lossy()
            .replace('\\', "/");
        assets.push((logical_path, path.to_string_lossy().into_owned()));
    }
}
