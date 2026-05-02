/* imports */
mod entities;
mod errors;
mod helpers;
mod providers;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;
use tauri::Manager;
use tracing_subscriber::{fmt, layer::SubscriberExt, EnvFilter, Layer};

/* global re-export for nosql_orm Entity trait */
#[allow(unused_imports)]
use nosql_orm::Entity;

/* helpers */
use crate::helpers::{activity_log::ActivityLogHelper, config::ConfigHelper};

/* routes */
use routes::{
  about_route::{download_update, get_binary_name_file, open_file},
  auth_data_sync_route::initialize_user_data,
  auth_route::{
    authenticate_android_biometric, check_android_biometric, check_token, complete_biometric_auth,
    complete_passkey_authentication, complete_passkey_registration, disable_biometric,
    disable_passkey, disable_totp, enable_biometric, enable_totp, get_user_security_status,
    init_biometric_auth, init_passkey_authentication, init_passkey_registration,
    init_totp_qr_login, login, qr_approve, qr_generate, qr_generate_for_desktop, qr_login_complete,
    qr_status, qr_toggle, register, request_password_reset, reset_password, setup_totp,
    use_recovery_code, verify_code, verify_login_totp,
  },
  manage_db_route::{
    export_to_cloud, get_all_data_for_admin, get_all_data_for_archive, import_to_local,
    manage_data, permanently_delete_record, permanently_delete_record_local,
    sync_visibility_to_provider, toggle_delete_status, toggle_delete_status_local,
  },
  profile_route::{profile_sync_all_for_user, profile_sync_to_cloud},
  statistics_route::statistics_get,
};

/* services */
use services::{
  about_service::AboutService,
  activity_monitor_service::ActivityMonitorService,
  auth::{
    auth_biometric::AuthBiometricService, auth_data_sync::AuthDataSyncService,
    auth_passkey::AuthPasskeyService, auth_qr::QrAuthService, auth_totp::AuthTotpService,
  },
  auth_service::AuthService,
  cascade::CascadeService,
  entity_resolution_service::EntityResolutionService,
  manage_db_service::ManageDbService,
  profile::profile_sync::ProfileSyncService,
  profile_service::ProfileService,
  repository_service::RepositoryService,
  statistics_service::StatisticsService,
  user::user_sync::UserSyncService,
};

/* nosql_orm */
use nosql_orm::providers::{JsonProvider, MongoProvider};

pub struct AppState {
  pub config_helper: Arc<ConfigHelper>,
  pub repository_service: Arc<RepositoryService>,
  pub about_service: Arc<AboutService>,
  pub auth_service: Arc<AuthService>,
  pub manage_db_service: Arc<ManageDbService>,
  pub profile_service: Arc<ProfileService>,
  pub statistics_service: Arc<StatisticsService>,
  pub qr_auth_service: Arc<QrAuthService>,
  pub totp_service: Arc<AuthTotpService>,
  pub passkey_service: Arc<AuthPasskeyService>,
  pub biometric_service: Arc<AuthBiometricService>,
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

  let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

  let stdout_layer = fmt::layer()
    .with_target(true)
    .with_level(true)
    .with_writer(std::io::stdout)
    .with_ansi(true)
    .with_filter(filter);

  let _ =
    tracing::subscriber::set_global_default(tracing_subscriber::registry().with(stdout_layer));

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

      let _json_provider_setup = json_provider.clone();

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

      let profile_sync_service = Arc::new(ProfileSyncService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));

      let auth_data_sync_service = Arc::new(AuthDataSyncService::new(
        user_sync_service.clone(),
        profile_sync_service.clone(),
      ));

      let cascade_service = CascadeService::new(json_provider.clone(), mongodb_provider.clone());
      let entity_resolution = Arc::new(EntityResolutionService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));
      let activity_monitor =
        ActivityMonitorService::new(activity_log_helper.clone(), entity_resolution.clone());

      let json_for_repo = json_provider.clone();
      let json_for_auth = json_provider.clone();
      let json_for_stats = json_provider.clone();
      let json_for_mdb = json_provider.clone();
      let mongo_for_repo = mongodb_provider.clone();
      let mongo_for_auth = mongodb_provider.clone();
      let mongo_for_mdb = mongodb_provider.clone();
      let cas_for_repo = cascade_service.clone();
      let ent_for_repo = entity_resolution.clone();
      let act_for_stats = activity_log_helper.clone();

      let repository_service = Arc::new(RepositoryService::new(
        json_for_repo,
        mongo_for_repo,
        cas_for_repo,
        ent_for_repo,
        activity_monitor,
        profile_service.as_ref().clone(),
      ));

      let auth_service = Arc::new(AuthService::new(
        json_for_auth,
        mongo_for_auth,
        config_helper.jwt_secret.clone(),
        config_helper.rp_domain.clone(),
        Some(auth_data_sync_service.clone()),
      ));

      let totp_service = Arc::new(AuthTotpService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        Some(auth_service.token_service.clone()),
      ));

      let passkey_service = Arc::new(AuthPasskeyService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        Arc::clone(&auth_service.webauthn_state),
      ));

      let biometric_service = Arc::new(AuthBiometricService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
      ));

      let qr_auth_service = Arc::new(QrAuthService::new(
        json_provider.clone(),
        mongodb_provider.clone(),
        auth_service.token_service.clone(),
      ));

      let statistics_service = Arc::new(StatisticsService::new(json_for_stats, act_for_stats));
      let manage_db_service = Arc::new(ManageDbService::new(
        json_for_mdb,
        mongo_for_mdb,
        cascade_service,
        entity_resolution,
      ));

      app.manage(AppState {
        config_helper,
        repository_service,
        about_service,
        auth_service,
        manage_db_service,
        profile_service,
        statistics_service,
        qr_auth_service,
        totp_service,
        passkey_service,
        biometric_service,
        auth_data_sync_service,
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      download_update,
      get_binary_name_file,
      open_file,
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
      init_passkey_registration,
      complete_passkey_registration,
      init_passkey_authentication,
      complete_passkey_authentication,
      disable_passkey,
      enable_biometric,
      init_biometric_auth,
      complete_biometric_auth,
      disable_biometric,
      get_user_security_status,
      init_totp_qr_login,
      qr_generate,
      qr_generate_for_desktop,
      qr_approve,
      qr_status,
      qr_toggle,
      qr_login_complete,
      check_android_biometric,
      authenticate_android_biometric,
      export_to_cloud,
      get_all_data_for_admin,
      get_all_data_for_archive,
      import_to_local,
      manage_data,
      permanently_delete_record,
      permanently_delete_record_local,
      toggle_delete_status,
      toggle_delete_status_local,
      sync_visibility_to_provider,
      profile_sync_to_cloud,
      profile_sync_all_for_user,
      statistics_get,
      initialize_user_data
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
