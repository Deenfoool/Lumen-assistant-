use serde::Serialize;

/// Read-only health check. No OS, shell, file, or power actions are registered yet.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    app_name: &'static str,
    version: &'static str,
    os: &'static str,
    system_actions_enabled: bool,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        app_name: "LUMEN",
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        system_actions_enabled: false,
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_info])
        .run(tauri::generate_context!())
        .expect("failed to start LUMEN Desktop");
}
