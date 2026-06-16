/* imports */
mod entities;
mod errors;
mod helpers;
mod logger;
mod models;
mod providers;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;
use tauri::{Manager, State};

use crate::providers::data_provider::DataProvider;

/* helpers */
use crate::helpers::{activity_log::ActivityLogHelper, config::ConfigHelper};

/* routes */
use routes::{
  archive_route::{get_all_archive_data, get_all_archive_paginated, permanent_delete, soft_delete},
  update_route::{downloadUpdate, getBinaryNameFile, getCurrentVersion, installUpdate, openFile},
};

/* commands */
use routes::{
  admin_command::{
    batch_hard_delete_cascade, batch_restore_cascade, batch_restore_json,
    batch_soft_delete_cascade, batch_soft_delete_json, check_mongodb_connection,
    cleanup_non_private_from_json, delete_from_json, export_to_cloud, get_all_admin_data,
    get_all_admin_paginated, get_all_from_json, get_tasks_by_month, hard_remove_data,
    import_private_to_local, import_to_local, soft_remove_data, sync_visibility_to_provider,
    upsert_to_json, upsert_to_mongo,
  },
  auth_command::{
    change_password, check_token, disable_totp, enable_totp, get_user_security_status,
    github_check_device_flow, github_create_comment, github_create_issue, github_disconnect,
    github_get_connection_status, github_get_repos, github_oauth_callback, github_oauth_url,
    github_start_device_flow, github_update_issue, initialize_user_data, login, qr_approve,
    qr_generate, qr_generate_for_desktop, qr_login_complete, qr_status, qr_toggle, register,
    request_password_reset, reset_password, setup_totp, use_recovery_code, verify_code,
    verify_login_totp,
  },
  group_command::{
    add_group_members, add_message_reaction, create_group_cmd, delete_group_cascade,
    delete_group_cmd, delete_message, delete_room_messages, edit_message, ensure_rooms_for_groups,
    get_group_by_room, get_groups_cmd, get_messages_by_room, hard_delete_message,
    hard_delete_room_messages, mark_message_read, remove_group_members, remove_message_reaction,
    send_message, update_group_cmd,
  },
  room_command::{
    create_room, delete_room, delete_room_cmd, get_room, get_rooms, get_rooms_cmd, update_room,
  },
  stats_command::statistics_get,
  todo_command::{
    change_todo_visibility, create_todo, delete_todo, get_todo, get_todo_permissions, get_todos,
    transfer_todo_ownership, update_todo, update_todo_permissions,
  },
};

/* services */
use services::{
  about_service::AboutService,
  activity_monitor_service::ActivityMonitorService,
  auth::{auth_data_sync::AuthDataSyncService, auth_qr::QrAuthService, auth_totp::AuthTotpService},
  auth_service::AuthService,
  cascade::{CascadeService, CountService},
  category_service::CategoryService,
  chat_service::ChatService,
  entity_resolution_service::EntityResolutionService,
  group_service::GroupService,
  manage_db_service::ManageDbService,
  notification_service::NotificationService,
  profile::profile_sync_unified::ProfileSyncUnifiedService,
  profile_service::ProfileService,
  repository::service::RepositoryService,
  room_service::RoomService,
  statistics_service::StatisticsService,
  subtask_service::SubtaskService,
  task_service::TaskService,
  todo_service::TodoService,
  user::user_sync::UserSyncService,
};

/* nosql_orm */
use crate::entities::response_entity::ResponseModel;
use nosql_orm::providers::{JsonProvider, MongoProvider};

#[tauri::command]
async fn sync_data(state: State<'_, AppState>, user_id: String) -> Result<ResponseModel, String> {
  let export_result = state
    .system
    .manage_db_service
    .export_to_cloud(user_id.clone())
    .await
    .map_err(|e| e.message)?;

  let import_result = state
    .system
    .manage_db_service
    .import_to_local(user_id)
    .await
    .map_err(|e| e.message)?;

  Ok(ResponseModel {
    status: export_result.status,
    message: format!(
      "Export: {}, Import: {}",
      export_result.message, import_result.message
    ),
    data: export_result.data,
  })
}

#[tauri::command]
async fn search_data(
  state: State<'_, AppState>,
  table: String,
  query: String,
  visibility: Option<String>,
  page: Option<u64>,
  limit: Option<u64>,
  token: Option<String>,
  load: Option<String>,
  _offline: Option<bool>,
) -> Result<ResponseModel, String> {
  use crate::helpers::auth::extract_user_from_token;

  let user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .ok();

  let filter = if !query.is_empty() {
    Some(serde_json::json!({ "query": query }))
  } else {
    None
  };

  state
    .data
    .repository_service
    .execute(
      "search".to_string(),
      table,
      None,
      None,
      filter,
      load,
      visibility,
      user_id,
      None,
      page,
      limit,
    )
    .await
    .map_err(|e| e.message)
}

#[tauri::command]
async fn get_notifications(
  state: State<'_, AppState>,
  user_id: String,
  page: Option<u64>,
  limit: Option<u64>,
) -> Result<ResponseModel, String> {
  state
    .system
    .notification_service
    .get_by_user(&user_id, "private", page, limit)
    .await
    .map_err(|e| e.message)
}

#[tauri::command]
async fn create_notification(
  state: State<'_, AppState>,
  data: serde_json::Value,
  visibility: Option<String>,
) -> Result<ResponseModel, String> {
  let vis = visibility.unwrap_or_else(|| "private".to_string());
  state
    .system
    .notification_service
    .create(data, &vis)
    .await
    .map_err(|e| e.message)
}

#[tauri::command]
async fn mark_notification_read(
  state: State<'_, AppState>,
  id: String,
  visibility: Option<String>,
) -> Result<ResponseModel, String> {
  let vis = visibility.unwrap_or_else(|| "private".to_string());
  state
    .system
    .notification_service
    .mark_as_read(&id, &vis)
    .await
    .map_err(|e| e.message)
}

#[tauri::command]
async fn mark_all_notifications_read(
  state: State<'_, AppState>,
  user_id: String,
  visibility: Option<String>,
) -> Result<ResponseModel, String> {
  let vis = visibility.unwrap_or_else(|| "private".to_string());
  state
    .system
    .notification_service
    .mark_all_as_read(&user_id, &vis)
    .await
    .map_err(|e| e.message)
}

#[tauri::command]
async fn delete_notification(
  state: State<'_, AppState>,
  id: String,
  visibility: Option<String>,
) -> Result<ResponseModel, String> {
  let vis = visibility.unwrap_or_else(|| "private".to_string());
  state
    .system
    .notification_service
    .delete(&id, &vis)
    .await
    .map_err(|e| e.message)
}

#[tauri::command]
async fn clear_all_notifications(
  state: State<'_, AppState>,
  user_id: String,
  visibility: Option<String>,
) -> Result<ResponseModel, String> {
  let vis = visibility.unwrap_or_else(|| "private".to_string());
  state
    .system
    .notification_service
    .clear_all(&user_id, &vis)
    .await
    .map_err(|e| e.message)
}

pub struct AppState {
  pub logger: Arc<()>,
  pub config: ConfigState,
  pub auth: AuthState,
  pub data: DataState,
  pub chat: ChatState,
  pub system: SystemState,
}

pub struct ConfigState {
  pub config_helper: Arc<ConfigHelper>,
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
}

pub struct AuthState {
  pub auth_service: Arc<AuthService>,
  pub totp_service: Arc<AuthTotpService>,
  pub qr_auth_service: Arc<QrAuthService>,
  pub auth_data_sync_service: Arc<AuthDataSyncService>,
}

pub struct DataState {
  pub repository_service: Arc<RepositoryService>,
  pub todo_service: Arc<TodoService>,
  pub task_service: Arc<TaskService>,
  pub subtask_service: Arc<SubtaskService>,
  pub category_service: Arc<CategoryService>,
  pub cascade_service: CascadeService,
}

pub struct ChatState {
  pub chat_service: Arc<ChatService>,
  pub group_service: Arc<GroupService>,
  pub room_service: Arc<RoomService>,
}

pub struct SystemState {
  pub about_service: Arc<AboutService>,
  pub manage_db_service: Arc<ManageDbService>,
  pub notification_service: Arc<NotificationService>,
  pub profile_service: Arc<ProfileService>,
  pub statistics_service: Arc<StatisticsService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  logger::init_logger();

  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");

  use crate::entities::category_entity::CategoryEntity;
  use crate::entities::chat_entity::ChatEntity;
  use crate::entities::comment_entity::CommentEntity;
  use crate::entities::profile_entity::ProfileEntity;
  use crate::entities::room_entity::RoomEntity;
  use crate::entities::subtask_entity::SubtaskEntity;
  use crate::entities::task_entity::TaskEntity;
  use crate::entities::todo_entity::TodoEntity;
  use crate::entities::user_entity::UserEntity;

  use nosql_orm::relations::register_relations_for_entity;

  register_relations_for_entity::<RoomEntity>();
  register_relations_for_entity::<CategoryEntity>();
  register_relations_for_entity::<TodoEntity>();
  register_relations_for_entity::<TaskEntity>();
  register_relations_for_entity::<SubtaskEntity>();
  register_relations_for_entity::<CommentEntity>();
  register_relations_for_entity::<ChatEntity>();
  register_relations_for_entity::<ProfileEntity>();
  register_relations_for_entity::<UserEntity>();

  let builder = tauri::Builder::default();

  if std::env::var("SKIP_FRONTEND").is_ok() {
    return;
  }

  builder
    .setup(|app| {
      let config_helper = Arc::new(ConfigHelper::new());

      let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory. Ensure app is properly initialized.");
      let json_db_path = app_data_dir.join(&config_helper.json_db_name);
      std::fs::create_dir_all(&json_db_path).ok();

      let json_provider = tauri::async_runtime::block_on(JsonProvider::new(&json_db_path))
        .expect("Failed to create JSON provider");

      let mongodb_provider = {
        let uri = config_helper.mongo_db_uri.clone();
        let db_name = config_helper.mongo_db_name.clone();
        match tauri::async_runtime::block_on(MongoProvider::connect(&uri, &db_name)) {
          Ok(p) => Some(Arc::new(p)),
          Err(_e) => None,
        }
      };

      let activity_log_helper = Arc::new(ActivityLogHelper::new(json_provider.clone()));

      let about_service = Arc::new(AboutService::new(config_helper.name_app.clone()));
      let profile_service = Arc::new(ProfileService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));

      let user_sync_service = Arc::new(UserSyncService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));

      let profile_sync_unified_service = Arc::new(ProfileSyncUnifiedService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));

      let auth_data_sync_service = Arc::new(AuthDataSyncService::new(
        user_sync_service.clone(),
        profile_sync_unified_service.clone(),
      ));

      let entity_resolution = Arc::new(EntityResolutionService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));
      let activity_monitor =
        ActivityMonitorService::new(activity_log_helper.clone(), entity_resolution.clone());
      let cascade_service = CascadeService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        Some(activity_monitor.clone()),
      );
      let count_service = Arc::new(CountService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));

      let repository_service = Arc::new(RepositoryService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        cascade_service.clone(),
        count_service.clone(),
        entity_resolution.clone(),
        activity_monitor,
        profile_service.as_ref().clone(),
        app.handle().clone(),
      ));

      let data_provider = DataProvider::Json(Arc::new(json_provider.clone()));
      let mongo_data_provider: Option<DataProvider> = mongodb_provider
        .as_ref()
        .map(|p| DataProvider::Mongo(p.clone()));

      let todo_service = Arc::new(TodoService::new(
        data_provider.clone(),
        mongo_data_provider.clone(),
      ));
      let task_service = Arc::new(TaskService::new(
        data_provider.clone(),
        mongo_data_provider.clone(),
      ));
      let subtask_service = Arc::new(SubtaskService::new(
        data_provider.clone(),
        mongo_data_provider.clone(),
      ));
      let category_service = Arc::new(CategoryService::new(
        data_provider.clone(),
        mongo_data_provider.clone(),
      ));
      let chat_service = Arc::new(ChatService::new(
        data_provider.clone(),
        mongo_data_provider.clone(),
      ));
      let group_service = Arc::new(GroupService::new(
        data_provider.clone(),
        mongo_data_provider.clone(),
      ));
      let room_service = Arc::new(RoomService::new(
        data_provider.clone(),
        mongo_data_provider.clone(),
      ));

      let auth_service = Arc::new(AuthService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        config_helper.jwt_secret.clone(),
        config_helper.rp_domain.clone(),
        Some(auth_data_sync_service.clone()),
        profile_sync_unified_service.as_ref().clone(),
      ));

      let totp_service = Arc::new(AuthTotpService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        Some(auth_service.token_service.clone()),
      ));

      let qr_auth_service = Arc::new(QrAuthService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        auth_service.token_service.clone(),
      ));

      let statistics_service = Arc::new(StatisticsService::new(json_provider.clone()));
      let manage_db_service = Arc::new(ManageDbService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        cascade_service.clone(),
        config_helper.mongo_db_uri.clone(),
        config_helper.mongo_db_name.clone(),
      ));
      let notification_service = Arc::new(NotificationService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));

      app.manage(AppState {
        logger: Arc::new(()),
        config: ConfigState {
          config_helper,
          json_provider,
          mongodb_provider,
        },
        auth: AuthState {
          auth_service,
          totp_service,
          qr_auth_service,
          auth_data_sync_service,
        },
        data: DataState {
          repository_service,
          todo_service,
          task_service,
          subtask_service,
          category_service,
          cascade_service,
        },
        chat: ChatState {
          chat_service,
          group_service,
          room_service,
        },
        system: SystemState {
          about_service,
          manage_db_service,
          notification_service,
          profile_service,
          statistics_service,
        },
      });

      Ok(())
    })
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_mcp_bridge::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      check_token,
      login,
      register,
      request_password_reset,
      reset_password,
      change_password,
      verify_code,
      setup_totp,
      enable_totp,
      verify_login_totp,
      disable_totp,
      use_recovery_code,
      get_user_security_status,
      qr_generate,
      qr_generate_for_desktop,
      qr_approve,
      qr_status,
      qr_toggle,
      qr_login_complete,
      export_to_cloud,
      get_tasks_by_month,
      check_mongodb_connection,
      import_to_local,
      import_private_to_local,
      sync_visibility_to_provider,
      cleanup_non_private_from_json,
      upsert_to_json,
      upsert_to_mongo,
      delete_from_json,
      batch_soft_delete_json,
      batch_restore_json,
      get_all_from_json,
      get_all_admin_data,
      get_all_admin_paginated,
      get_all_archive_data,
      get_all_archive_paginated,
      soft_delete,
      permanent_delete,
      statistics_get,
      batch_soft_delete_cascade,
      batch_hard_delete_cascade,
      batch_restore_cascade,
      soft_remove_data,
      hard_remove_data,
      initialize_user_data,
      github_oauth_url,
      github_oauth_callback,
      github_get_repos,
      github_get_connection_status,
      github_disconnect,
      github_create_issue,
      github_create_comment,
      github_start_device_flow,
      github_check_device_flow,
      github_update_issue,
      get_todo,
      get_todos,
      create_todo,
      update_todo,
      delete_todo,
      get_room,
      get_rooms,
      create_room,
      update_room,
      delete_room,
      get_group_by_room,
      get_groups_cmd,
      create_group_cmd,
      update_group_cmd,
      add_group_members,
      remove_group_members,
      delete_group_cmd,
      delete_group_cascade,
      ensure_rooms_for_groups,
      get_messages_by_room,
      send_message,
      mark_message_read,
      delete_message,
      hard_delete_message,
      edit_message,
      add_message_reaction,
      remove_message_reaction,
      delete_room_cmd,
      delete_room_messages,
      hard_delete_room_messages,
      getBinaryNameFile,
      downloadUpdate,
      openFile,
      installUpdate,
      getCurrentVersion,
      sync_data,
      change_todo_visibility,
      get_todo_permissions,
      update_todo_permissions,
      transfer_todo_ownership,
      get_rooms_cmd,
      delete_room_cmd,
      search_data,
      get_notifications,
      create_notification,
      mark_notification_read,
      mark_all_notifications_read,
      delete_notification,
      clear_all_notifications,
    ])
    .run(tauri::generate_context!())
    .unwrap_or_else(|e| {
      eprintln!("Error while running tauri application: {}", e);
      std::process::exit(1);
    });
}
