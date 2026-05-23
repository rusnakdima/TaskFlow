#[macro_export]
macro_rules! crud_route {
  ($route:ident, $table:expr, $operation:expr) => {
    #[allow(clippy::too_many_arguments)]
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
      offline: Option<bool>,
    ) -> Result<crate::entities::response_entity::ResponseModel, String> {
      use crate::helpers::auth_helper::extract_user_from_token;

      let user_id = extract_user_from_token(
        token.as_deref().unwrap_or(""),
        &state.config_helper.jwt_secret,
      )
      .ok();

      state
        .repository_service
        .execute(
          $operation.to_string(),
          $table.to_string(),
          id,
          data,
          filter,
          load,
          visibility,
          offline.unwrap_or(false),
          user_id,
          page,
          limit,
        )
        .await
        .map_err(|e| e.message)
    }
  };
}
