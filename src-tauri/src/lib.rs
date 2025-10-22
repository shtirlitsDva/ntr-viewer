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

    let contents = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let response = OpenFileResponse {
        path: path.to_string_lossy().to_string(),
        contents,
    };
    Ok(Some(response))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, open_ntr_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
use serde::Serialize;
