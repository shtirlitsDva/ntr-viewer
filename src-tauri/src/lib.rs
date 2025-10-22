use encoding_rs::{Encoding, UTF_8, WINDOWS_1252};
use serde::Serialize;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

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
        path: path.to_string_lossy().to_string(),
        contents,
    })
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
        .invoke_handler(tauri::generate_handler![greet, open_ntr_file, load_ntr_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
