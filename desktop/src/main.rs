//! Native Windows package for the ChibiMadness web game.
//!
//! The compiled Vite bundle is embedded in memory. A verified optional patch is
//! loaded from the local cache; the process never exposes a local HTTP server.

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod world_renderer;
mod scene_executor;
mod chibi_assets;

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
use world_renderer::{
    NativeRenderFrame, NativeRenderScene, NativeRendererMetrics, NativeWorldRenderer, NativeWorldState,
};
use yuyib::{
    platform::{
        Window, WindowConfig, WindowMode,
        winit::{
            application::ApplicationHandler,
            dpi::{PhysicalPosition, PhysicalSize},
            event::WindowEvent,
            event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
            window::WindowId,
        },
    },
    render::{ClearColor, Renderer},
    webview::{
        AssetBundle, AssetLimits, AssetPath, BridgeLimits, BridgeRouter, EndpointName, LocalCsp,
        LocalPage, MimePolicy, PageEvent, PageSessionId, TypedEndpoint, WebSocketOrigin,
        WebViewBuilder, WebViewHost,
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
struct NativeRendererReady {
    active: bool,
}

#[derive(Clone, Serialize)]
struct GameConfiguration {
    server_url: Option<String>,
    content_version: String,
    content_source: ContentSource,
    native_renderer: bool,
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

/// Owns the native game surface and its WebView HUD explicitly instead of
/// using Yuyib's convenience `Application` facade. A windowed WebView2 child
/// cannot reveal a DXGI surface behind it, even if CSS and the controller are
/// transparent. Native mode therefore places the JS/TS HUD in a separate,
/// transparent top-level window owned by the WGPU game window; DWM composites
/// those two top-level surfaces correctly.
struct GameDesktopApp {
    native_renderer: bool,
    session: PageSessionId,
    limits: BridgeLimits,
    builder: Option<WebViewBuilder>,
    outbound: Rc<RefCell<Option<WebViewHost>>>,
    native_world: Rc<RefCell<NativeWorldState>>,
    parent_window: Option<Window>,
    overlay_window: Option<Window>,
    renderer: Option<Renderer>,
    world_renderer: NativeWorldRenderer,
    native_world_rendered: bool,
}

impl GameDesktopApp {
    fn sync_webview_surface(&mut self) {
        let Some(parent) = &self.parent_window else {
            return;
        };
        let physical = parent.physical_size();
        let width = physical.width.max(1);
        let height = physical.height.max(1);
        let logical = physical.to_logical::<f64>(parent.raw().scale_factor());
        let bounds = yuyib::webview::WebViewBounds::new(
            0.0,
            0.0,
            logical.width.max(1.0),
            logical.height.max(1.0),
        );
        if let (Ok(bounds), Some(webview)) = (bounds, self.outbound.borrow().as_ref()) {
            if let Err(error) = webview.set_bounds(bounds) {
                eprintln!("could not resize local WebView: {error}");
            }
        }
        if let Some(overlay) = &self.overlay_window {
            // The owned overlay is a second top-level window, so its origin is
            // the main window's client area in screen coordinates. Ownership
            // preserves z-order/minimise/teardown without pinning it above
            // unrelated desktop applications.
            let position = parent
                .raw()
                .inner_position()
                .or_else(|_| parent.raw().outer_position())
                .unwrap_or_else(|_| PhysicalPosition::new(0, 0));
            overlay.raw().set_outer_position(position);
            let _ = overlay
                .raw()
                .request_inner_size(PhysicalSize::new(width, height));
        }
    }

    fn render_world(&mut self) {
        if !self.native_renderer {
            return;
        }
        let Some(renderer) = self.renderer.as_mut() else {
            return;
        };
        let state = self.native_world.borrow();
        let world_renderer = &mut self.world_renderer;
        let mut rendered = false;
        let result = renderer.render_frame(ClearColor::default(), |frame| {
            rendered = world_renderer.render(frame, &state);
        });
        drop(state);
        if let Err(error) = result {
            eprintln!("native world presentation failed: {error}");
            return;
        }
        if rendered && !self.native_world_rendered {
            emit_native_renderer_ready(&self.outbound, self.session, self.limits);
            self.native_world_rendered = true;
        }
        if let Some(metrics) = self.world_renderer.record_presentation() {
            emit_native_renderer_metrics(&self.outbound, self.session, self.limits, metrics);
        }
    }

    fn shutdown(&mut self, event_loop: &ActiveEventLoop) {
        self.renderer.take();
        self.outbound.borrow_mut().take();
        self.overlay_window.take();
        self.parent_window.take();
        event_loop.exit();
    }

    fn finish_webview_initialisation(
        &mut self,
        event_loop: &ActiveEventLoop,
        parent: Window,
        native_surfaces: Option<(Window, Renderer)>,
    ) {
        let Some(builder) = self.builder.take() else {
            eprintln!("game WebView was already consumed");
            event_loop.exit();
            return;
        };
        let webview_parent = native_surfaces
            .as_ref()
            .map_or(&parent, |(overlay, _)| overlay);
        let webview = match builder.build(webview_parent) {
            Ok(webview) => webview,
            Err(error) => {
                eprintln!("could not create game WebView: {error}");
                event_loop.exit();
                return;
            }
        };
        *self.outbound.borrow_mut() = Some(webview);
        self.parent_window = Some(parent);
        if let Some((overlay, renderer)) = native_surfaces {
            self.overlay_window = Some(overlay);
            self.renderer = Some(renderer);
            self.sync_webview_surface();
            if let Some(parent) = &self.parent_window {
                parent.request_redraw();
            }
        }
    }
}

impl ApplicationHandler for GameDesktopApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.parent_window.is_some() {
            return;
        }
        let parent = match Window::create(
            event_loop,
            &WindowConfig {
                title: "ChibiMadness — Yuyib Desktop".to_owned(),
                width: 1_600,
                height: 900,
                resizable: true,
                decorations: true,
                mode: WindowMode::Windowed,
            },
        ) {
            Ok(window) => window,
            Err(error) => {
                eprintln!("could not create game window: {error}");
                event_loop.exit();
                return;
            }
        };

        let renderer = if self.native_renderer {
            match Renderer::new(&parent) {
                Ok(renderer) => renderer,
                Err(error) => {
                    eprintln!("could not initialise native world renderer: {error}");
                    event_loop.exit();
                    return;
                }
            }
        } else {
            // Canvas compatibility mode owns the visual surface in WebView.
            // It does not allocate an unused WGPU swapchain.
            return self.finish_webview_initialisation(event_loop, parent, None);
        };
        let size = parent.physical_size();
        let position = parent
            .raw()
            .inner_position()
            .or_else(|_| parent.raw().outer_position())
            .unwrap_or_else(|_| PhysicalPosition::new(0, 0));
        let overlay = match Window::create_owned_overlay(event_loop, &parent, position, size) {
            Ok(overlay) => overlay,
            Err(error) => {
                eprintln!("could not create transparent game HUD overlay: {error}");
                event_loop.exit();
                return;
            }
        };
        self.finish_webview_initialisation(event_loop, parent, Some((overlay, renderer)));
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        window_id: WindowId,
        event: WindowEvent,
    ) {
        let parent_id = self.parent_window.as_ref().map(|window| window.raw().id());
        let overlay_id = self.overlay_window.as_ref().map(|window| window.raw().id());
        if parent_id == Some(window_id) {
            match event {
                WindowEvent::CloseRequested => self.shutdown(event_loop),
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    if let Some(renderer) = &mut self.renderer {
                        let size = self
                            .parent_window
                            .as_ref()
                            .map(Window::physical_size)
                            .unwrap_or_default();
                        renderer.resize(size.width, size.height);
                    }
                    self.sync_webview_surface();
                    if let Some(parent) = &self.parent_window {
                        parent.request_redraw();
                    }
                }
                WindowEvent::Moved(_) => self.sync_webview_surface(),
                WindowEvent::RedrawRequested => self.render_world(),
                _ => {}
            }
        } else if overlay_id == Some(window_id) {
            match event {
                WindowEvent::CloseRequested => self.shutdown(event_loop),
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    self.sync_webview_surface()
                }
                _ => {}
            }
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if self.native_renderer {
            if let Some(parent) = &self.parent_window {
                parent.request_redraw();
            }
            event_loop.set_control_flow(ControlFlow::Poll);
        } else {
            event_loop.set_control_flow(ControlFlow::Wait);
        }
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let server = configured_server()?;
    let native_renderer = native_renderer_enabled();
    let csp = match &server {
        Some(server) => LocalCsp::strict().with_websocket_origin(&server.csp_origin),
        None => LocalCsp::strict(),
    };
    let launch_assets = assets_for_launch()?;
    let page = local_page(csp, launch_assets.assets)?;

    let session = PageSessionId::parse("b9c9f5bbfae14dbdb3f5e2356b74d0aa")?;
    // The default bridge payload is 48 KiB, appropriate for ordinary UI
    // events but below one retained world display-list. This page is a fixed
    // local asset origin and NativeWorldState still validates command count,
    // depth, strings and values before allocation/tessellation. Keep a hard
    // bound rather than falling back silently to Canvas on every map.
    let default_limits = BridgeLimits::default();
    let limits = BridgeLimits::new(
        1,
        4 * 1024 * 1024,
        3 * 1024 * 1024,
        default_limits.max_endpoint_bytes(),
    )?;
    let outbound = Rc::new(RefCell::new(None::<WebViewHost>));
    let outbound_for_endpoint = Rc::clone(&outbound);
    let native_world = Rc::new(RefCell::new(NativeWorldState::default()));
    let native_world_for_endpoint = Rc::clone(&native_world);
    let native_world_for_scene_endpoint = Rc::clone(&native_world);
    let native_world_for_static_scene_endpoint = Rc::clone(&native_world);
    let native_world_for_dynamic_scene_endpoint = Rc::clone(&native_world);
    let server_url = server.map(|server| server.websocket_url);
    let content_version = launch_assets.version;
    let content_source = launch_assets.source;
    let mut bridge = BridgeRouter::new(session, limits);
    bridge.register(TypedEndpoint::new(
        EndpointName::parse("game.ready")?,
        move |_message: GameReady| {
            let outbound = outbound_for_endpoint.borrow();
            let Some(webview) = outbound.as_ref() else {
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
                    native_renderer,
                },
                limits,
            );
            if let Ok(event) = event {
                let _ = webview.emit_event(&event);
            }
        },
    ))?;
    bridge.register(TypedEndpoint::new(
        EndpointName::parse("world.frame")?,
        move |frame: NativeRenderFrame| native_world_for_endpoint.borrow_mut().apply(frame),
    ))?;
    bridge.register(TypedEndpoint::new(
        EndpointName::parse("world.scene")?,
        move |scene: NativeRenderScene| native_world_for_scene_endpoint.borrow_mut().apply_scene(scene),
    ))?;
    bridge.register(TypedEndpoint::new(
        EndpointName::parse("world.scene.static")?,
        move |scene: NativeRenderScene| {
            native_world_for_static_scene_endpoint
                .borrow_mut()
                .apply_static_scene(scene)
        },
    ))?;
    bridge.register(TypedEndpoint::new(
        EndpointName::parse("world.scene.dynamic")?,
        move |scene: NativeRenderScene| {
            native_world_for_dynamic_scene_endpoint
                .borrow_mut()
                .apply_dynamic_scene(scene)
        },
    ))?;
    let builder = WebViewBuilder::new()
        .with_local_page(page)
        .with_transparent(native_renderer)
        .with_bridge_router(bridge);
    let mut app = GameDesktopApp {
        native_renderer,
        session,
        limits,
        builder: Some(builder),
        outbound,
        native_world,
        parent_window: None,
        overlay_window: None,
        renderer: None,
        world_renderer: NativeWorldRenderer::default(),
        native_world_rendered: false,
    };
    let event_loop = EventLoop::new()?;
    event_loop.run_app(&mut app)?;
    Ok(())
}

fn emit_native_renderer_ready(
    outbound: &Rc<RefCell<Option<WebViewHost>>>,
    session: PageSessionId,
    limits: BridgeLimits,
) {
    let Ok(event) = PageEvent::from_typed(
        limits.protocol_version(),
        session,
        EndpointName::parse("world.renderer_ready").expect("static endpoint is valid"),
        NativeRendererReady { active: true },
        limits,
    ) else {
        return;
    };
    if let Some(webview) = outbound.borrow().as_ref() {
        let _ = webview.emit_event(&event);
    }
}

fn emit_native_renderer_metrics(
    outbound: &Rc<RefCell<Option<WebViewHost>>>,
    session: PageSessionId,
    limits: BridgeLimits,
    metrics: NativeRendererMetrics,
) {
    let Ok(event) = PageEvent::from_typed(
        limits.protocol_version(),
        session,
        EndpointName::parse("world.renderer_metrics").expect("static endpoint is valid"),
        metrics,
        limits,
    ) else {
        return;
    };
    if let Some(webview) = outbound.borrow().as_ref() {
        let _ = webview.emit_event(&event);
    }
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
            "--native-renderer" | "--canvas-renderer" => {}
            "--help" | "-h" => {
                println!(
                    "Usage: chibimadness-desktop [--server wss://game.example.com/ws] [--native-renderer]"
                );
                return Ok(None);
            }
            _ => return Err(format!("unknown argument {argument:?}").into()),
        }
    }
    server.map(parse_server_endpoint).transpose()
}

fn native_renderer_enabled() -> bool {
    env::args()
        .skip(1)
        .any(|argument| argument == "--native-renderer")
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
