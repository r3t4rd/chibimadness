//! Native Windows package for the ChibiMadness web game.
//!
//! The compiled Vite bundle is embedded in memory; the process does not expose
//! a local HTTP server or read game files at runtime.

use std::{cell::RefCell, env, error::Error, rc::Rc};

use serde::{Deserialize, Serialize};
use url::Url;
use yuyib::{
    app::{Application, ApplicationWebView, ApplicationWebViewHandle, RenderLoop},
    platform::{WindowConfig, WindowMode},
    webview::{
        AssetBundle, AssetLimits, AssetPath, BridgeLimits, BridgeRouter, ControlledUrl,
        EndpointName, LocalCsp, LocalPage, MimePolicy, PageEvent, PageSessionId, TypedEndpoint,
        WebViewBuilder,
    },
};

include!(concat!(env!("OUT_DIR"), "/embedded_assets.rs"));

const DEFAULT_SERVER_URL: Option<&str> = option_env!("CHIBIMADNESS_SERVER_URL");

#[derive(Deserialize)]
struct GameReady {}

#[derive(Serialize)]
struct GameConfiguration {
    server_url: Option<String>,
}

struct ServerEndpoint {
    websocket_url: String,
    csp_origin: ControlledUrl,
}

fn main() -> Result<(), Box<dyn Error>> {
    let server = configured_server()?;
    let csp = match &server {
        Some(server) => LocalCsp::strict().with_connect_origin(&server.csp_origin),
        None => LocalCsp::strict(),
    };
    let page = local_page(csp)?;

    let session = PageSessionId::parse("b9c9f5bbfae14dbdb3f5e2356b74d0aa")?;
    let limits = BridgeLimits::default();
    let outbound = Rc::new(RefCell::new(None::<ApplicationWebViewHandle>));
    let outbound_for_endpoint = Rc::clone(&outbound);
    let server_url = server.map(|server| server.websocket_url);
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
        .render_loop(RenderLoop::OnDemand)
        .webview(webview)
        .run()?;
    Ok(())
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
    let mut url = Url::parse(&value)?;
    if url.scheme() != "wss" {
        return Err("server URL must use wss://".into());
    }
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        return Err("server URL must include a host and must not contain credentials".into());
    }
    url.set_scheme("https").expect("wss scheme can be converted to https");
    Ok(ServerEndpoint {
        websocket_url: value,
        csp_origin: ControlledUrl::parse(url.as_str())?,
    })
}
