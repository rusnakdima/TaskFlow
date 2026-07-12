#![allow(non_snake_case)]
use crate::utils::response_helper::{err_response, success_response};
use crate::AppState;
use tauri::{AppHandle, State};
use tauri_shared::update::{
    check_for_update, download_update, get_temp_download_path, install_update, CheckUpdateResult,
};
use crate::models::response::ResponseModel;

#[tauri::command(rename_all = "camelCase")]
pub async fn checkForUpdate(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
) -> Result<CheckUpdateResult, String> {
    let app_name = state.config.config_helper.name_app.clone();
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    match check_for_update(&owner, &repo, &current_version, &app_name).await {
        Ok(update_info) => Ok(CheckUpdateResult {
            has_update: true,
            update_info: Some(update_info),
            error: None,
        }),
        Err(e) => {
            if e.contains("You are running the latest version") {
                Ok(CheckUpdateResult {
                    has_update: false,
                    update_info: None,
                    error: None,
                })
            } else {
                Ok(CheckUpdateResult {
                    has_update: false,
                    update_info: None,
                    error: Some(e),
                })
            }
        }
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn downloadUpdate(
    url: String,
    file_name: String,
    app_handle: AppHandle,
) -> Result<ResponseModel, ResponseModel> {
    let app_name = env!("CARGO_PKG_NAME");
    let dest_path = get_temp_download_path(&file_name, app_name)
        .map_err(|e| err_response(&e))?;

    let _downloaded = download_update(&url, &dest_path, &app_handle, app_name)
        .await
        .map_err(|e| err_response(&e))?;

    Ok(success_response(serde_json::Value::String(
        dest_path.display().to_string(),
    )))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn installUpdate(
    installer_path: String,
    app_handle: AppHandle,
) -> Result<ResponseModel, ResponseModel> {
    install_update(&installer_path, &app_handle)
        .map_err(|e| err_response(&e))?;
    Ok(success_response(serde_json::Value::Bool(true)))
}

#[tauri::command(rename_all = "camelCase")]
pub fn getCurrentVersion() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
