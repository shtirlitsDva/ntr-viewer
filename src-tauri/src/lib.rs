use encoding_rs::{Encoding, UTF_8, WINDOWS_1252};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{path::{Path, PathBuf}, sync::{Arc, Mutex}};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct WatcherState {
    inner: Mutex<Option<ActiveWatcher>>,
}

struct ActiveWatcher {
    _watcher: RecommendedWatcher,
    _file_path: PathBuf,
}

#[derive(Clone, Serialize)]
struct FileChangePayload {
    path: String,
    kind: String,
}

#[cfg(debug_assertions)]
fn log_watch_event(message: &str) {
    println!("[watch] {message}");
}

#[cfg(not(debug_assertions))]
fn log_watch_event(_message: &str) {}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize)]
struct OpenFileResponse {
    path: String,
    contents: String,
}

#[tauri::command]
fn open_ntr_file(app: tauri::AppHandle) -> Result<Option<OpenFileResponse>, String> {
    let selection = app
        .dialog()
        .file()
        .add_filter("NTR files", &["ntr"])
        .blocking_pick_file();

    let Some(file) = selection else {
        return Ok(None);
    };

    let Some(path) = file.as_path() else {
        return Err("Selected file is not accessible on this platform".into());
    };

    let response = read_ntr_file(path)?;
    Ok(Some(response))
}

#[tauri::command]
fn load_ntr_file(path: String) -> Result<OpenFileResponse, String> {
    let resolved = Path::new(&path);
    if !resolved.exists() {
        return Err("File not found".into());
    }
    if !resolved.is_file() {
        return Err("Path does not point to a file".into());
    }
    read_ntr_file(resolved)
}

fn read_ntr_file(path: &Path) -> Result<OpenFileResponse, String> {
    let bytes = std::fs::read(path)
        .map_err(|err| format!("Failed to read file bytes: {err}"))?;
    let contents = decode_ntr_bytes(&bytes)?;
    Ok(OpenFileResponse {
        path: normalize_path(path),
        contents,
    })
}

#[tauri::command]
fn start_file_watch(
    app: tauri::AppHandle,
    state: tauri::State<WatcherState>,
    path: String,
) -> Result<(), String> {
    log_watch_event(&format!("Starting watch for {}", path));
    let input_path = PathBuf::from(&path);
    if !input_path.exists() {
        return Err("File not found".into());
    }
    if !input_path.is_file() {
        return Err("Path is not a file".into());
    }

    let canonical_path = input_path
        .canonicalize()
        .unwrap_or_else(|_| input_path.clone());
    let normalized_path = Arc::new(normalize_path(&canonical_path));
    let emit_path_for_watch = normalized_path.clone();
    let app_handle = app.clone();

    {
        let mut guard = state.inner.lock().expect("watcher state poisoned");
        guard.take();
    }

    let file_path_for_match = normalized_path.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                if should_emit_event(&event.kind) && paths_match(&event.paths, &file_path_for_match)
                {
                    #[cfg(debug_assertions)]
                    {
                        let paths: Vec<String> = event
                            .paths
                            .iter()
                            .map(|path| normalize_path(path))
                            .collect();
                        log_watch_event(&format!(
                            "Event {:?} for paths {:?}",
                            event.kind, paths
                        ));
                    }

                    let payload = FileChangePayload {
                        path: emit_path_for_watch.as_ref().clone(),
                        kind: format_event_kind(&event.kind),
                    };
                    if let Err(err) = app_handle.emit("ntr-file-changed", payload) {
                        eprintln!("Failed to emit file change event: {err}");
                    }
                }
            }
            Err(err) => {
                eprintln!("File watcher error: {err}");
                log_watch_event(&format!("Watcher error: {err}"));
                let _ = app_handle.emit(
                    "ntr-file-watch-error",
                    FileChangePayload {
                        path: emit_path_for_watch.as_ref().clone(),
                        kind: format!("error:{err}"),
                    },
                );
            }
        }
    })
    .map_err(|err| err.to_string())?;

    watcher
        .configure(Config::default())
        .map_err(|err| err.to_string())?;
    let watch_target = canonical_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| canonical_path.clone());
    watcher
        .watch(&watch_target, RecursiveMode::NonRecursive)
        .map_err(|err| err.to_string())?;

    let mut guard = state.inner.lock().expect("watcher state poisoned");
    *guard = Some(ActiveWatcher {
        _watcher: watcher,
        _file_path: canonical_path,
    });
    Ok(())
}

#[tauri::command]
fn stop_file_watch(state: tauri::State<WatcherState>) -> Result<(), String> {
    let mut guard = state.inner.lock().expect("watcher state poisoned");
    #[cfg(debug_assertions)]
    {
        if guard.is_some() {
            log_watch_event("Stopping active watcher");
        }
    }
    guard.take();
    Ok(())
}

fn should_emit_event(kind: &EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

fn format_event_kind(kind: &EventKind) -> String {
    match kind {
        EventKind::Modify(_) => "modify".into(),
        EventKind::Create(_) => "create".into(),
        EventKind::Remove(_) => "remove".into(),
        EventKind::Access(_) => "access".into(),
        EventKind::Any => "any".into(),
        _ => "other".into(),
    }
}

fn paths_match(event_paths: &[PathBuf], target: &str) -> bool {
    if event_paths.is_empty() {
        return true;
    }
    event_paths
        .iter()
        .map(|path| normalize_path(path))
        .any(|candidate| candidate == target)
}

fn normalize_path(path: &Path) -> String {
    let mut normalized = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        if normalized.starts_with("//?/UNC/") {
            normalized = format!("//{}", &normalized[8..]);
        } else if normalized.starts_with("//?/") {
            normalized = normalized[4..].to_string();
        }
        normalized = normalized.to_lowercase();
    }
    normalized
}

fn decode_ntr_bytes(bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Ok(String::new());
    }

    if let Some((encoding, bom_len)) = Encoding::for_bom(bytes) {
        let (decoded, _, had_errors) = encoding.decode(&bytes[bom_len..]);
        if had_errors {
            return Err(format!(
                "File encoding {} contains invalid sequences",
                encoding.name()
            ));
        }
        return Ok(decoded.into_owned());
    }

    let (utf8, _, utf8_errors) = UTF_8.decode(bytes);
    if !utf8_errors {
        return Ok(utf8.into_owned());
    }

    let (fallback, _, fallback_errors) = WINDOWS_1252.decode(bytes);
    if !fallback_errors {
        return Ok(fallback.into_owned());
    }

    Err("Unsupported file encoding; expected UTF-8 or Windows-1252".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_ntr_file,
            load_ntr_file,
            start_file_watch,
            stop_file_watch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
