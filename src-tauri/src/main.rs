#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            // Placeholder for future initialization of file dialogs or telemetry toggles.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
