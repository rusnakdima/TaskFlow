#[macro_export]
macro_rules! crud_route {
  ($route:ident, $table:expr, $operation:expr) => {
    #[allow(clippy::too_many_arguments)]
    #[allow(dead_code)]
    #[tauri::command]
    pub async fn $route(
      state: tauri::State<'_, crate::AppState>,
      id: Option<String>,
      data: Option<serde_json::Value>,
      filter: Option<serde_json::Value>,
      load: Option<String>,
      visibility: Option<String>,
      page: Option<u64>,
      limit: Option<u64>,
      token: Option<String>,
    ) -> Result<crate::models::response::ResponseModel, crate::models::response::ResponseModel> {
      use crate::utils::auth::{extract_profile_from_token, extract_user_from_token};
      use crate::utils::response_helper::err_response;
      let user_id = extract_user_from_token(
        token.as_deref().unwrap_or(""),
        &state.config.config_helper.jwt_secret,
      )
      .ok();
      let profile_id = extract_profile_from_token(
        token.as_deref().unwrap_or(""),
        &state.config.config_helper.jwt_secret,
      )
      .ok();
      state
        .data
        .repository_service
        .execute(
          $operation.to_string(),
          $table.to_string(),
          id,
          data,
          filter,
          load,
          visibility,
          user_id,
          profile_id,
          page,
          limit,
        )
        .await
        .map_err(|e| err_response(&e.message))
    }
  };
}
