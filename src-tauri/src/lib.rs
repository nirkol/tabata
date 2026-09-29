//! Native side of the yFit Tabata Timer Mac app (SPEC §9).
//!
//! The UI is the Phase 1 web app. This file adds what the Mac needs on top:
//! - routines and settings saved to a JSON file in the app's data folder,
//! - keeping the display awake while a routine runs.
//! App Nap is disabled in Info.plist and background throttling in tauri.conf.json,
//! so timing and beeps stay accurate when the window is in the background.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

const STORE_FILE: &str = "store.json";

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(STORE_FILE))
}

/// Returns the saved key/value store as a JSON object string ("{}" on first launch).
#[tauri::command]
fn load_store(app: AppHandle) -> Result<String, String> {
    let path = store_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) if serde_json::from_str::<serde_json::Value>(&text).map(|v| v.is_object()).unwrap_or(false) => Ok(text),
        Ok(_) => Ok("{}".into()), // unreadable file: start fresh rather than crash
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("{}".into()),
        Err(e) => Err(e.to_string()),
    }
}

/// Saves the whole key/value store. Writes to a temporary file first, then renames,
/// so a crash mid-write never leaves a half-written file.
#[tauri::command]
fn save_store(app: AppHandle, data: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&data).map_err(|e| e.to_string())?;
    let path = store_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[derive(Default)]
struct Awake(Mutex<Option<keepawake::KeepAwake>>);

/// Keeps the display awake while `on` is true (a routine is running).
#[tauri::command]
fn set_keep_awake(on: bool, state: State<'_, Awake>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if on {
        if guard.is_none() {
            let awake = keepawake::Builder::default()
                .display(true)
                .idle(true)
                .reason("A workout routine is running")
                .app_name("yFit Tabata Timer")
                .app_reverse_domain("com.yfit.tabatatimer")
                .create()
                .map_err(|e| e.to_string())?;
            *guard = Some(awake);
        }
    } else {
        *guard = None; // dropping the guard lets the display sleep again
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Awake::default())
        .invoke_handler(tauri::generate_handler![load_store, save_store, set_keep_awake])
        .run(tauri::generate_context!())
        .expect("error while running yFit Tabata Timer");
}
