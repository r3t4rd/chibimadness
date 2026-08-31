//! Native Windows package for the ChibiMadness web game.
//!
//! The compiled Vite bundle is embedded in memory. A verified optional patch is
//! loaded from the local cache; the process never exposes a local HTTP server.

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    env,
    error::Error,
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    rc::Rc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;
use yuyib::{
    app::{Application, ApplicationWebView, ApplicationWebViewHandle, RenderLoop},
    platform::{WindowConfig, WindowMode},
    webview::{
        AssetBundle, AssetLimits, AssetPath, BridgeLimits, BridgeRouter, EndpointName, LocalCsp,
        LocalPage, MimePolicy, PageEvent, PageSessionId, TypedEndpoint, WebSocketOrigin,
        WebViewBuilder,
    },
};

include!(concat!(env!("OUT_DIR"), "/embedded_assets.rs"));

const DEFAULT_SERVER_URL: Option<&str> = option_env!("CHIBIMADNESS_SERVER_URL");
const DEFAULT_PATCH_MANIFEST_URL: &str =
    "https://github.com/r3t4rd/chibimadness/releases/latest/download/patch-manifest.json";
const DEFAULT_PATCH_BUNDLE_URL: &str =
    "https://github.com/r3t4rd/chibimadness/releases/latest/download/web-patch.zip";
const PATCH_FORMAT_VERSION: u8 = 1;
const MAX_PATCH_FILES: usize = 512;
const MAX_PATCH_BYTES: usize = 64 * 1024 * 1024;
const MAX_PATCH_FILE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchManifest {
    format_version: u8,
    version: String,
    files: Vec<PatchFile>,
}

#[derive(Clone, Deserialize, Serialize)]
struct PatchFile {
    path: String,
    sha256: String,
    size: usize,
}

#[derive(Deserialize)]
struct GameReady {}

#[derive(Serialize)]
struct GameConfiguration {
    server_url: Option<String>,
    content_version: String,
    content_source: ContentSource,
}

struct ServerEndpoint {
    websocket_url: String,
    csp_origin: WebSocketOrigin,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum ContentSource {
    Embedded,
    Patch,
}

struct LaunchAssets {
    assets: AssetBundle,
    version: String,
    source: ContentSource,
}

fn main() -> Result<(), Box<dyn Error>> {
    let server = configured_server()?;
    let csp = match &server {
        Some(server) => LocalCsp::strict().with_websocket_origin(&server.csp_origin),
        None => LocalCsp::strict(),
    };
    let launch_assets = assets_for_launch()?;
    let page = local_page(csp, launch_assets.assets)?;

    let session = PageSessionId::parse("b9c9f5bbfae14dbdb3f5e2356b74d0aa")?;
    let limits = BridgeLimits::default();
    let outbound = Rc::new(RefCell::new(None::<ApplicationWebViewHandle>));
    let outbound_for_endpoint = Rc::clone(&outbound);
    let server_url = server.map(|server| server.websocket_url);
    let content_version = launch_assets.version;
    let content_source = launch_assets.source;
    let mut bridge = BridgeRouter::new(session, limits);
    bridge.register(TypedEndpoint::new(
        EndpointName::parse("game.ready")?,
        move |_message: GameReady| {
            let Some(handle) = outbound_for_endpoint.borrow().clone() else {
                return;
            };
            let event = PageEvent::from_typed(
                limits.protocol_version(),
                session,
                EndpointName::parse("game.configuration").expect("static endpoint is valid"),
                GameConfiguration {
                    server_url: server_url.clone(),
                    content_version: content_version.clone(),
                    content_source,
                },
                limits,
            );
            if let Ok(event) = event {
                let _ = handle.enqueue(event);
            }
        },
    ))?;
    let builder = WebViewBuilder::new()
        .with_local_page(page)
        .with_bridge_router(bridge);
    let (webview, handle) = ApplicationWebView::new(builder).with_event_queue(8)?;
    *outbound.borrow_mut() = Some(handle);

    Application::new()
        .window(WindowConfig {
            title: "ChibiMadness — Yuyib Desktop".to_owned(),
            width: 1_600,
            height: 900,
            resizable: true,
            decorations: true,
            mode: WindowMode::Windowed,
        })
        // WebView2 owns the game's own animation cadence. A continuously
        // presenting native WGPU parent competes with its child compositor,
        // so the host must remain event-driven.
        .render_loop(RenderLoop::OnDemand)
        .webview(webview)
        .run()?;
    Ok(())
}

fn local_page(csp: LocalCsp, assets: AssetBundle) -> Result<LocalPage, Box<dyn Error>> {
    Ok(LocalPage::new(
        AssetPath::parse("index.html")?,
        assets,
        csp,
    )?)
}

fn assets_for_launch() -> Result<LaunchAssets, Box<dyn Error>> {
    let Ok(cache_root) = patch_cache_root() else {
        return embedded_launch_assets();
    };
    let cached = load_latest_cached_patch(&cache_root);
    match fetch_manifest() {
        Ok(manifest) => match install_or_load_patch(&cache_root, &manifest) {
            Ok(assets) => {
                cleanup_patch_cache(&cache_root, &manifest.version);
                Ok(LaunchAssets {
                    assets,
                    version: manifest.version,
                    source: ContentSource::Patch,
                })
            }
            Err(error) => {
                eprintln!("ChibiMadness patch update ignored: {error}");
                match cached {
                    Some(assets) => Ok(assets),
                    None => embedded_launch_assets(),
                }
            }
        },
        Err(error) => {
            eprintln!("ChibiMadness patch check skipped: {error}");
            match cached {
                Some(assets) => Ok(assets),
                None => embedded_launch_assets(),
            }
        }
    }
}

fn embedded_launch_assets() -> Result<LaunchAssets, Box<dyn Error>> {
    Ok(LaunchAssets {
        assets: bundled_assets()?,
        version: option_env!("CHIBIMADNESS_BUILD_VERSION")
            .unwrap_or("embedded")
            .to_owned(),
        source: ContentSource::Embedded,
    })
}

fn patch_cache_root() -> Result<PathBuf, Box<dyn Error>> {
    let base = env::var_os("LOCALAPPDATA")
        .or_else(|| env::var_os("APPDATA"))
        .ok_or("Windows application-data directory is unavailable")?;
    let root = PathBuf::from(base).join("ChibiMadness").join("web-patches");
    fs::create_dir_all(&root)?;
    Ok(root)
}

fn fetch_manifest() -> Result<PatchManifest, Box<dyn Error>> {
    let bytes = download_bytes(
        option_env!("CHIBIMADNESS_PATCH_MANIFEST_URL").unwrap_or(DEFAULT_PATCH_MANIFEST_URL),
        256 * 1024,
    )?;
    let manifest = serde_json::from_slice::<PatchManifest>(&bytes)?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn install_or_load_patch(
    root: &Path,
    manifest: &PatchManifest,
) -> Result<AssetBundle, Box<dyn Error>> {
    let destination = root.join(&manifest.version);
    if let Ok(assets) = patch_assets(&destination, manifest) {
        return Ok(assets);
    }

    let bundle = download_bytes(
        option_env!("CHIBIMADNESS_PATCH_BUNDLE_URL").unwrap_or(DEFAULT_PATCH_BUNDLE_URL),
        MAX_PATCH_BYTES,
    )?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let staging = root.join(format!(".{}-{stamp}.partial", manifest.version));
    fs::create_dir_all(&staging)?;
    let result = unpack_patch(&bundle, &staging, manifest).and_then(|()| {
        fs::write(
            staging.join("patch-manifest.json"),
            serde_json::to_vec(manifest)?,
        )
        .map_err(Into::into)
    });
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if destination.exists() {
        fs::remove_dir_all(&destination)?;
    }
    fs::rename(&staging, &destination)?;
    patch_assets(&destination, manifest)
}

fn load_latest_cached_patch(root: &Path) -> Option<LaunchAssets> {
    let mut candidates = fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .collect::<Vec<_>>();
    candidates.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    candidates.reverse();
    candidates.into_iter().find_map(|entry| {
        let manifest = fs::read(entry.path().join("patch-manifest.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<PatchManifest>(&bytes).ok())?;
        validate_manifest(&manifest).ok()?;
        patch_assets(&entry.path(), &manifest)
            .ok()
            .map(|assets| LaunchAssets {
                assets,
                version: manifest.version,
                source: ContentSource::Patch,
            })
    })
}

fn cleanup_patch_cache(root: &Path, active_version: &str) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        if entry.file_name().to_string_lossy() != active_version
            && entry.file_type().is_ok_and(|kind| kind.is_dir())
        {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

fn unpack_patch(
    bytes: &[u8],
    destination: &Path,
    manifest: &PatchManifest,
) -> Result<(), Box<dyn Error>> {
    let expected = manifest
        .files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<BTreeMap<_, _>>();
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    if archive.len() != expected.len() {
        return Err("patch archive file list does not match its manifest".into());
    }
    let mut total = 0usize;
    let mut seen = BTreeSet::new();
    for index in 0..archive.len() {
        let mut source = archive.by_index(index)?;
        let path = source.name().replace('\\', "/");
        let Some(file) = expected.get(path.as_str()) else {
            return Err("patch archive contains an unexpected file".into());
        };
        if !seen.insert(path.clone()) || source.is_dir() || source.size() != file.size as u64 {
            return Err("patch archive contains an invalid file entry".into());
        }
        let mut content = Vec::with_capacity(file.size);
        source
            .by_ref()
            .take((file.size + 1) as u64)
            .read_to_end(&mut content)?;
        total = total
            .checked_add(content.len())
            .ok_or("patch archive is too large")?;
        if content.len() != file.size || total > MAX_PATCH_BYTES || sha256(&content) != file.sha256
        {
            return Err("patch file does not match its manifest".into());
        }
        let asset_path = AssetPath::parse(&path)?;
        let output = destination.join(asset_path.as_str());
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(output, content)?;
    }
    if seen.len() != expected.len() {
        return Err("patch archive is missing a manifest file".into());
    }
    Ok(())
}

fn patch_assets(root: &Path, manifest: &PatchManifest) -> Result<AssetBundle, Box<dyn Error>> {
    validate_manifest(manifest)?;
    let mut assets = AssetBundle::new(MimePolicy::strict(), AssetLimits::default());
    for file in &manifest.files {
        let asset_path = AssetPath::parse(&file.path)?;
        let bytes = fs::read(root.join(asset_path.as_str()))?;
        if bytes.len() != file.size || sha256(&bytes) != file.sha256 {
            return Err("cached patch file does not match its manifest".into());
        }
        assets.insert(asset_path, bytes)?;
    }
    Ok(assets)
}

fn validate_manifest(manifest: &PatchManifest) -> Result<(), Box<dyn Error>> {
    if manifest.format_version != PATCH_FORMAT_VERSION
        || manifest.files.is_empty()
        || manifest.files.len() > MAX_PATCH_FILES
        || manifest.version.is_empty()
        || !manifest
            .version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    {
        return Err("patch manifest has an unsupported format".into());
    }
    let mut paths = BTreeSet::new();
    let mut total = 0usize;
    for file in &manifest.files {
        let path = AssetPath::parse(&file.path)?;
        if !paths.insert(path.as_str().to_owned())
            || file.size > MAX_PATCH_FILE_BYTES
            || !is_sha256(&file.sha256)
        {
            return Err("patch manifest contains an invalid file".into());
        }
        total = total
            .checked_add(file.size)
            .ok_or("patch manifest is too large")?;
    }
    if total > MAX_PATCH_BYTES || !paths.contains("index.html") {
        return Err("patch manifest is incomplete or too large".into());
    }
    Ok(())
}

fn download_bytes(url: &str, limit: usize) -> Result<Vec<u8>, Box<dyn Error>> {
    let response = ureq::get(url).timeout(Duration::from_secs(3)).call()?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err("download exceeds the configured limit".into());
    }
    Ok(bytes)
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn configured_server() -> Result<Option<ServerEndpoint>, Box<dyn Error>> {
    let mut arguments = env::args().skip(1);
    let mut server = DEFAULT_SERVER_URL.map(str::to_owned);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--server" => server = Some(arguments.next().ok_or("--server requires a WSS URL")?),
            "--help" | "-h" => {
                println!("Usage: chibimadness-desktop [--server wss://game.example.com/ws]");
                return Ok(None);
            }
            _ => return Err(format!("unknown argument {argument:?}").into()),
        }
    }
    server.map(parse_server_endpoint).transpose()
}

fn parse_server_endpoint(value: String) -> Result<ServerEndpoint, Box<dyn Error>> {
    let url = Url::parse(&value)?;
    if url.scheme() != "wss" {
        return Err("server URL must use wss://".into());
    }
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        return Err("server URL must include a host and must not contain credentials".into());
    }
    Ok(ServerEndpoint {
        websocket_url: value,
        csp_origin: WebSocketOrigin::parse(url.as_str())?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(path: &str) -> PatchManifest {
        PatchManifest {
            format_version: PATCH_FORMAT_VERSION,
            version: "v1.2.3".to_owned(),
            files: vec![PatchFile {
                path: path.to_owned(),
                sha256: "0".repeat(64),
                size: 1,
            }],
        }
    }

    #[test]
    fn patch_manifest_requires_safe_paths_and_index_page() {
        assert!(validate_manifest(&manifest("index.html")).is_ok());
        assert!(validate_manifest(&manifest("../index.html")).is_err());
        assert!(validate_manifest(&manifest("assets/game.js")).is_err());
    }

    #[test]
    fn patch_manifest_rejects_invalid_hashes() {
        let mut invalid = manifest("index.html");
        invalid.files[0].sha256 = "not-a-hash".to_owned();
        assert!(validate_manifest(&invalid).is_err());
    }
}
