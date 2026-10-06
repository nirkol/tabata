//! Native side of the yFit Workout Timer Mac app (SPEC §9).
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
                .app_name("yFit Workout Timer")
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

/// The fixed words of the voice cues: "start" → "Start!", "ten" → "Ten!".
fn cue_text(cue: &str) -> Result<&'static str, String> {
    match cue {
        "start" => Ok("Start!"),
        "ten" => Ok("Ten!"),
        _ => Err("unknown cue".into()),
    }
}

/// Clear, energetic delivery for the cues (same feel as the web version: a bit higher and faster).
#[cfg(target_os = "macos")]
const CUE_VOICE: &str = "Samantha";
#[cfg(target_os = "macos")]
const CUE_RATE: &str = "200";
#[cfg(target_os = "macos")]
const CUE_STYLE: &str = "[[pbas 52]] [[emph +]]";

/// Fallback cue playback: speaks the cue right away with macOS's `say` (no shell).
#[tauri::command]
fn say_cue(cue: String, volume: f32) -> Result<(), String> {
    let text = cue_text(&cue)?;
    #[cfg(target_os = "macos")]
    {
        let v = if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 1.0 };
        let line = format!("[[volm {v:.2}]] {CUE_STYLE} {text}");
        std::thread::spawn(move || {
            let ok = std::process::Command::new("/usr/bin/say")
                .args(["-v", CUE_VOICE, "-r", CUE_RATE, &line])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if !ok {
                let _ = std::process::Command::new("/usr/bin/say").args(["-r", CUE_RATE, &line]).status();
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (text, volume);
    Ok(())
}

/// Renders a voice cue once to WAV audio (16-bit, 22.05 kHz) with macOS's voice, so the app
/// can play it instantly through Web Audio, like the beeps, instead of starting `say` each time.
#[tauri::command]
async fn render_cue(cue: String) -> Result<tauri::ipc::Response, String> {
    let text = cue_text(&cue)?;
    #[cfg(target_os = "macos")]
    {
        let path = std::env::temp_dir().join(format!("yfit-cue-{}-{}.wav", cue, std::process::id()));
        let render = |voice: Option<&str>| -> bool {
            let mut cmd = std::process::Command::new("/usr/bin/say");
            if let Some(v) = voice {
                cmd.args(["-v", v]);
            }
            cmd.args(["-r", CUE_RATE, "--file-format=WAVE", "--data-format=LEI16@22050", "-o"])
                .arg(&path)
                .arg(format!("{CUE_STYLE} {text}"));
            cmd.status().map(|s| s.success()).unwrap_or(false)
        };
        if !render(Some(CUE_VOICE)) && !render(None) {
            return Err("say failed".into());
        }
        let bytes = std::fs::read(&path).map_err(|e| e.to_string());
        let _ = std::fs::remove_file(&path);
        return Ok(tauri::ipc::Response::new(bytes?));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
        Err("not supported".into())
    }
}

/// Speaks a short free-text statement (the end-of-cycle encouragement) with macOS's voice.
/// The text is limited to 80 characters, control characters and `say`'s embedded
/// "[[ ]]" commands are removed, and `say` runs without a shell.
#[tauri::command]
fn say_text(text: String, volume: f32) -> Result<(), String> {
    let clean: String = text
        .chars()
        .filter(|c| !c.is_control())
        .take(80)
        .collect::<String>()
        .replace("[[", "")
        .replace("]]", "");
    let clean = clean.trim().to_string();
    if clean.is_empty() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let v = if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 1.0 };
        // Upbeat delivery: higher pitch base, lively pitch changes and emphasis.
        let line = format!("[[volm {v:.2}]] [[pbas 56]] [[pmod 80]] [[emph +]] {clean}");
        // Prefer the expressive "Samantha" voice; fall back to the system voice if it's missing.
        std::thread::spawn(move || {
            let ok = std::process::Command::new("/usr/bin/say")
                .args(["-v", "Samantha", "-r", "195", &line])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if !ok {
                let _ = std::process::Command::new("/usr/bin/say").args(["-r", "195", &line]).status();
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = volume;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Awake::default())
        .invoke_handler(tauri::generate_handler![load_store, save_store, set_keep_awake, say_cue, say_text, render_cue])
        .run(tauri::generate_context!())
        .expect("error while running yFit Workout Timer");
}
