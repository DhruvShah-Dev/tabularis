use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use urlencoding::encode;

/// Persisted geometry so a re-opened detached results window restores where the
/// user last left it. Mirrors the pattern used by `json_viewer.rs`.
#[derive(Debug, Clone, Copy)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Default)]
pub struct ResultsWindowStore {
    pub last_bounds: Mutex<Option<WindowBounds>>,
}

/// One detached results window per editor tab. The frontend keeps each window's
/// data in sync over Tauri events keyed by `tab_id`.
fn window_label(tab_id: &str) -> String {
    format!("results-window-{}", tab_id)
}

/// Open (or focus) the detached results window for a given tab. Result data is
/// streamed from the main window via the `results-window:sync` event (keyed by
/// `tabId`), so no payload is passed here.
#[tauri::command]
pub async fn open_results_window(
    app: AppHandle,
    store: tauri::State<'_, ResultsWindowStore>,
    tab_id: String,
    title: Option<String>,
) -> Result<(), String> {
    let label = window_label(&tab_id);

    // If it already exists, just bring it to the front.
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let window_title = title.unwrap_or_else(|| "Query Results".to_string());

    let remembered = store
        .last_bounds
        .lock()
        .map_err(|e| format!("Failed to acquire bounds lock: {}", e))?
        .clone();

    let url = format!("/results-window?tab={}", encode(&tab_id));
    let mut builder =
        WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
            .title(&window_title)
            .min_inner_size(500.0, 300.0)
            .background_color(tauri::webview::Color(2, 6, 23, 255));

    builder = match remembered {
        Some(b) => builder
            .inner_size(b.width as f64, b.height as f64)
            .position(b.x as f64, b.y as f64),
        None => builder.inner_size(900.0, 600.0).center(),
    };

    match builder.build() {
        Err(e) => Err(format!("Failed to create results window: {}", e)),
        Ok(window) => {
            let app_handle = app.clone();
            let captured_label = label.clone();
            let captured_tab_id = tab_id.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { .. } = event {
                    if let Some(win) = app_handle.get_webview_window(&captured_label) {
                        if let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) {
                            let store = app_handle.state::<ResultsWindowStore>();
                            if let Ok(mut bounds) = store.last_bounds.lock() {
                                *bounds = Some(WindowBounds {
                                    x: pos.x,
                                    y: pos.y,
                                    width: size.width,
                                    height: size.height,
                                });
                            };
                        }
                    }
                    // Let the main window re-attach this tab's results panel.
                    let _ = app_handle.emit(
                        "results-window:closed",
                        serde_json::json!({ "tabId": captured_tab_id }),
                    );
                }
            });
            Ok(())
        }
    }
}

/// Programmatically close a tab's detached results window (used by the
/// "Re-attach" button and when the bound tab is closed).
#[tauri::command]
pub async fn close_results_window(app: AppHandle, tab_id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&window_label(&tab_id)) {
        window
            .close()
            .map_err(|e| format!("Failed to close results window: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds_round_trip() {
        let store = ResultsWindowStore::default();
        {
            let mut bounds = store.last_bounds.lock().unwrap();
            *bounds = Some(WindowBounds {
                x: 100,
                y: 200,
                width: 800,
                height: 600,
            });
        }
        let bounds = store.last_bounds.lock().unwrap();
        let b = bounds.unwrap();
        assert_eq!(b.x, 100);
        assert_eq!(b.y, 200);
        assert_eq!(b.width, 800);
        assert_eq!(b.height, 600);
    }

    #[test]
    fn bounds_default_is_none() {
        let store = ResultsWindowStore::default();
        assert!(store.last_bounds.lock().unwrap().is_none());
    }
}
