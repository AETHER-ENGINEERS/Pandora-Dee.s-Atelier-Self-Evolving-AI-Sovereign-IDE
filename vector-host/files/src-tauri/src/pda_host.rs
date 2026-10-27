//! PDA SEASIDE host mode: Vector's own engine, with its window hidden, so the PDA SEASIDE desktop can show
//! Vector's own interface in one of its windows (and on the phones that reach the desktop).
//!
//! Off unless the desktop starts this build with PDA_HOST_BRIDGE and PDA_HOST_TOKEN set. Then:
//! - it has its own identifier and data folder, so it runs next to the person's regular Vector without
//!   touching its data, its single-instance lock or its vector:// links;
//! - its one window loads `pda-host.html`, a bridge that relays the desktop's calls into Vector's engine and
//!   Vector's events back, and never shows.

use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub struct Host {
    /// The desktop's bridge address, e.g. http://127.0.0.1:15693/vh-bridge
    pub bridge: String,
    pub token: String,
    pub data: Option<PathBuf>,
}

pub fn host() -> Option<&'static Host> {
    static HOST: OnceLock<Option<Host>> = OnceLock::new();
    HOST.get_or_init(|| {
        let bridge = std::env::var("PDA_HOST_BRIDGE").ok().filter(|s| !s.is_empty())?;
        let token = std::env::var("PDA_HOST_TOKEN").ok().filter(|s| !s.is_empty())?;
        let data = std::env::var_os("PDA_HOST_DATA").map(PathBuf::from);
        Some(Host { bridge, token, data })
    })
    .as_ref()
}

/// Where this host keeps Vector's accounts (the desktop's data folder), when it says.
pub fn data_dir() -> Option<PathBuf> {
    host()?.data.as_ref().map(|d| d.join("data"))
}

/// Vector's own app-data folder, unless host mode gives it the desktop's: every `.app_data_dir()` in Vector's
/// code calls this instead (vector-host/build.mjs swaps them), so all of it finds the same accounts and files.
pub trait PdaAppData {
    fn pda_app_data_dir(&self) -> tauri::Result<PathBuf>;
}
impl<R: Runtime> PdaAppData for tauri::path::PathResolver<R> {
    fn pda_app_data_dir(&self) -> tauri::Result<PathBuf> {
        match data_dir() {
            Some(dir) => Ok(dir),
            None => self.app_data_dir(),
        }
    }
}

/// Where received files go: next to the accounts, not the person's own Downloads\vector.
pub fn download_dir() -> Option<PathBuf> {
    host()?.data.as_ref().map(|d| d.join("downloads"))
}

/// Before the app starts: its own identity, no window from the config, and room for the bridge to reach the desktop.
pub fn adjust<R: Runtime>(context: &mut tauri::Context<R>) {
    let Some(h) = host() else { return };
    let config = context.config_mut();
    config.identifier = "io.vectorapp.pdahost".into();
    config.app.windows.clear();
    let origin = h.bridge.split('/').take(3).collect::<Vec<_>>().join("/");
    if let Some(tauri::utils::config::Csp::Policy(policy)) = config.app.security.csp.as_mut() {
        *policy = policy.replacen("connect-src ", &format!("connect-src {origin} "), 1);
    }
}

/// In setup, before anything looks for the "main" window: the hidden bridge window.
pub fn open_window<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<()> {
    let Some(h) = host() else { return Ok(()) };
    let init = format!(
        "window.__PDA_BRIDGE__ = {};",
        serde_json::json!({ "url": h.bridge, "token": h.token })
    );
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("pda-host.html".into()))
        .title("Vector (PDA SEASIDE)")
        .initialization_script(&init)
        .visible(false)
        .skip_taskbar(true);
    if let Some(d) = &h.data {
        builder = builder.data_directory(d.join("webview"));
    }
    builder.build()?;
    Ok(())
}
