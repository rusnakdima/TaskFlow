/* imports */
mod entities;
mod helpers;
mod providers;
mod routes;
mod services;
mod shared;

/* sys lib */
use std::sync::Arc;
use tauri::{Manager, State};

use crate::providers::data_provider::DataProvider;

/* helpers */
use crate::helpers::{activity_log::ActivityLogHelper, config::ConfigHelper};

/* routes */
use routes::{
  admin_route::{
    admin_permanently_delete, admin_permanently_delete_local, admin_toggle_delete,
    admin_toggle_delete_local, get_all_admin_data, get_all_admin_paginated,
  },
  archive_route::{get_all_archive_data, get_all_archive_paginated, permanent_delete, soft_delete},
  auth_data_sync_route::initialize_user_data,
  auth_route::{
    check_token, disable_totp, enable_totp, get_user_security_status, init_totp_qr_login, login,
    qr_approve, qr_generate, qr_generate_for_desktop, qr_login_complete, qr_status, qr_toggle,
    register, request_password_reset, reset_password, setup_totp, use_recovery_code, verify_code,
    verify_login_totp,
  },
  cascade_route::{
    batch_hard_delete_cascade, batch_restore_cascade, batch_soft_delete_cascade, hard_remove_data,
    soft_remove_data,
  },
  crud_routes::{
    create_category, create_chat, create_comment, create_profile, create_subtask, create_task,
    create_todo, delete_category, delete_chat, delete_comment, delete_profile, delete_subtask,
    delete_task, delete_todo, get_categories, get_category, get_chat, get_chats, get_comment,
    get_comments, get_profile, get_profiles, get_subtask, get_subtasks, get_task, get_tasks,
    get_todo, get_todos, get_user, get_users, update_category, update_chat, update_comment,
    update_profile, update_subtask, update_task, update_todo,
  },
  github_route::{
    github_check_device_flow, github_create_comment, github_create_issue, github_disconnect,
    github_get_connection_status, github_get_repos, github_oauth_callback, github_oauth_url,
    github_start_device_flow, github_update_issue,
  },
  manage_db_route::{
    check_mongodb_connection, export_to_cloud, get_tasks_by_month, import_to_local,
  },
  statistics_route::statistics_get,
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
  comment_service::CommentService,
  entity_resolution_service::EntityResolutionService,
  manage_db_service::ManageDbService,
  profile::profile_sync_unified::ProfileSyncUnifiedService,
  profile_service::ProfileService,
  repository::service::RepositoryService,
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
    .manage_db_service
    .export_to_cloud(user_id.clone())
    .await
    .map_err(|e| e.message)?;

  let import_result = state
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

pub struct AppState {
  pub config_helper: Arc<ConfigHelper>,
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub repository_service: Arc<RepositoryService>,
  pub todo_service: Arc<TodoService>,
  pub task_service: Arc<TaskService>,
  pub subtask_service: Arc<SubtaskService>,
  pub comment_service: Arc<CommentService>,
  pub category_service: Arc<CategoryService>,
  pub chat_service: Arc<ChatService>,
  pub about_service: Arc<AboutService>,
  pub auth_service: Arc<AuthService>,
  pub manage_db_service: Arc<ManageDbService>,
  pub profile_service: Arc<ProfileService>,
  pub statistics_service: Arc<StatisticsService>,
  pub cascade_service: CascadeService,
  pub qr_auth_service: Arc<QrAuthService>,
  pub totp_service: Arc<AuthTotpService>,
  pub auth_data_sync_service: Arc<AuthDataSyncService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");

  // Import entities to register their relations
  use crate::entities::category_entity::CategoryEntity;
  use crate::entities::chat_entity::ChatEntity;
  use crate::entities::comment_entity::CommentEntity;
  use crate::entities::profile_entity::ProfileEntity;
  use crate::entities::subtask_entity::SubtaskEntity;
  use crate::entities::task_entity::TaskEntity;
  use crate::entities::todo_entity::TodoEntity;
  use crate::entities::user_entity::UserEntity;

  // Use nosql_orm macros to auto-register relations from entity definitions
  use nosql_orm::relations::register_relations_for_entity;

  // Register relations from entity macros (auto-detected from #[one_to_many], #[many_to_one], etc.)
  register_relations_for_entity::<CategoryEntity>();
  register_relations_for_entity::<TodoEntity>();
  register_relations_for_entity::<TaskEntity>();
  register_relations_for_entity::<SubtaskEntity>();
  register_relations_for_entity::<CommentEntity>();
  register_relations_for_entity::<ChatEntity>();
  register_relations_for_entity::<ProfileEntity>();
  register_relations_for_entity::<UserEntity>();

  let builder = tauri::Builder::default();

  // Skip frontend issues for testing - just run backend
  if std::env::var("SKIP_FRONTEND").is_ok() {
    return;
  }

  builder
    .setup(|app| {
      let config_helper = Arc::new(ConfigHelper::new());

      let document_dir = app.path().document_dir().unwrap();
      let json_db_path = document_dir
        .join(&config_helper.app_home_folder)
        .join(&config_helper.json_db_name);
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
      let comment_service = Arc::new(CommentService::new(
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

      app.manage(AppState {
        config_helper,
        json_provider,
        mongodb_provider,
        repository_service,
        todo_service,
        task_service,
        subtask_service,
        comment_service,
        category_service,
        chat_service,
        about_service,
        auth_service,
        manage_db_service,
        profile_service,
        statistics_service,
        cascade_service,
        qr_auth_service,
        totp_service,
        auth_data_sync_service,
      });

      Ok(())
    })
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      check_token,
      login,
      register,
      request_password_reset,
      reset_password,
      verify_code,
      setup_totp,
      enable_totp,
      verify_login_totp,
      disable_totp,
      use_recovery_code,
      get_user_security_status,
      init_totp_qr_login,
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
      get_task,
      get_tasks,
      create_task,
      update_task,
      delete_task,
      get_subtask,
      get_subtasks,
      create_subtask,
      update_subtask,
      delete_subtask,
      get_category,
      get_categories,
      create_category,
      update_category,
      delete_category,
      get_chat,
      get_chats,
      create_chat,
      update_chat,
      delete_chat,
      get_comment,
      get_comments,
      create_comment,
      update_comment,
      delete_comment,
      get_profile,
      get_profiles,
      create_profile,
      update_profile,
      delete_profile,
      get_user,
      get_users,
      sync_data,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
