mod commands;
mod crypto;
mod jimeng;
mod state;
mod storage;

use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir)?;
            log::info!("app data dir: {}", app_dir.display());

            let state = AppState::new(app_dir.clone())?;
            app.manage(Mutex::new(state));

            // 启动时全量自检:扫所有资产,补下缺失 / 文件已不存在的本地缓存。
            // fire-and-forget,不等结果——前端通过 `assets://local-backfilled`
            // 事件拿到增量更新,避免切项目时整板 re-render。
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::startup_backfill_assets(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_api_key,
            commands::set_api_key,
            commands::clear_api_key,
            commands::jimeng_generate,
            commands::jimeng_generate_stream,
            commands::list_projects,
            commands::create_project,
            commands::delete_project,
            commands::rename_project,
            commands::create_asset,
            commands::list_assets,
            commands::delete_asset,
            commands::backfill_local_assets,
            commands::backfill_output_format,
            commands::get_pref,
            commands::set_pref,
            commands::explain_error,
            commands::read_image_data_url,
            commands::agent_context_get,
            commands::agent_context_update,
            commands::style_contract_get,
            commands::style_contract_update,
            commands::agent_llm_get,
            commands::agent_llm_update,
            commands::agent_llm_clear,
            commands::chat_session_get_or_create,
            commands::chat_message_list,
            commands::chat_message_insert,
            commands::chat_message_update,
            commands::chat_message_delete,
            commands::chat_session_clear,
            commands::split_sprite_sheet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
