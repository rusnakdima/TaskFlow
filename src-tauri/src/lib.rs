#![allow(non_snake_case)]

/* imports */
mod errors;
mod helpers;
mod models;
mod providers;
mod repositories;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;
use tauri::Manager;

/* helpers */
use crate::helpers::{activity_log::ActivityLogHelper, config::ConfigHelper};

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* routes */
use routes::{
  about_route::{downloadUpdate, getBinaryNameFile, openFile},
  auth_route::{
    authenticateAndroidBiometric, checkAndroidBiometric, checkToken, completeBiometricAuth,
    completePasskeyAuthentication, completePasskeyRegistration, disableBiometric, disablePasskey,
    disableTotp, enableBiometric, enableTotp, getUserSecurityStatus, initBiometricAuth,
    initPasskeyAuthentication, initPasskeyRegistration, initTotpQrLogin, login, qrApprove,
    qrGenerate, qrLoginComplete, qrStatus, qrToggle, register, requestPasswordReset, resetPassword,
    setupTotp, useRecoveryCode, verifyCode, verifyLoginTotp,
  },
  manage_db_route::{
    exportToCloud, getAllDataForAdmin, getAllDataForArchive, importToLocal, manageData,
    permanentlyDeleteRecord, permanentlyDeleteRecordLocal, toggleDeleteStatus,
    toggleDeleteStatusLocal,
  },
  profile_route::{profileSyncAllForUser, profileSyncToCloud},
  statistics_route::statisticsGet,
};

/* services */
use services::{
  about_service::AboutService, activity_monitor_service::ActivityMonitorService,
  auth_service::AuthService, cascade::CascadeService, crud_service::CrudService,
  entity_resolution_service::EntityResolutionService, live_sync_service::LiveSyncService,
  manage_db_service::ManageDbService, profile_service::ProfileService,
  statistics_service::StatisticsService, websocket::WebSocketServerService,
};

/* repositories */
use repositories::routed_repository::RoutedRepository;

pub struct AppState {
  pub configHelper: Arc<ConfigHelper>,
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub aboutService: Arc<AboutService>,
  pub authService: Arc<AuthService>,
  pub crudService: Arc<CrudService>,
  pub liveSyncService: Option<Arc<LiveSyncService>>,
  pub manageDbService: Arc<ManageDbService>,
  pub profileService: Arc<ProfileService>,
  pub statisticsService: Arc<StatisticsService>,
  pub websocketServerService: Arc<WebSocketServerService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");

  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init());

  #[cfg(debug_assertions)]
  {
    builder = builder.plugin(tauri_plugin_mcp_bridge::init());
  }

  builder
    .setup(|app| {
      let configHelper = Arc::new(ConfigHelper::new());

      // Initialize MongoDB connection (optional - app works without it)
      let mongodbProvider = {
        let uri = configHelper.mongoDbUri.clone();
        let dbName = configHelper.mongoDbName.clone();
        match tauri::async_runtime::block_on(MongodbProvider::new(uri.clone(), dbName.clone())) {
          Ok(p) => Some(Arc::new(p)),
          Err(_e) => None,
        }
      };

      let jsonProvider = JsonProvider::new(
        app.handle().clone(),
        configHelper.appHomeFolder.clone(),
        configHelper.jsonDbName.clone(),
        mongodbProvider.clone(),
      );

      let activityLogHelper = Arc::new(ActivityLogHelper::new(jsonProvider.clone()));

      let aboutService = Arc::new(AboutService::new(configHelper.nameApp.clone()));
      let profileService = Arc::new(ProfileService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
      ));

      let cascadeService = CascadeService::new(jsonProvider.clone(), mongodbProvider.clone());
      let entityResolution = Arc::new(EntityResolutionService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
      ));
      let activityMonitor =
        ActivityMonitorService::new(activityLogHelper.clone(), entityResolution.clone());

      let routedRepository = Arc::new(RoutedRepository::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
        String::new(), // Table is set per operation
      ));

      let crudService = Arc::new(CrudService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
        cascadeService.clone(),
        entityResolution.clone(),
        activityMonitor,
        routedRepository,
      ));

      let authService = Arc::new(AuthService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
        configHelper.jwtSecret.clone(),
        configHelper.rpDomain.clone(),
      ));

      let statisticsService = Arc::new(StatisticsService::new(
        jsonProvider.clone(),
        activityLogHelper.clone(),
      ));
      let manageDbService = Arc::new(ManageDbService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
        cascadeService,
        entityResolution,
      ));

      let liveSyncService = mongodbProvider
        .as_ref()
        .map(|p| Arc::new(LiveSyncService::new(p.db.clone(), app.handle().clone())));

      let websocketServerService = Arc::new(WebSocketServerService::new(crudService.clone()));

      // Start WebSocket server
      let wsServiceClone = websocketServerService.clone();
      tauri::async_runtime::spawn(async move {
        wsServiceClone.start(8766).await;
      });

      app.manage(AppState {
        configHelper,
        jsonProvider,
        mongodbProvider,
        aboutService,
        authService,
        crudService,
        liveSyncService,
        manageDbService,
        profileService,
        statisticsService,
        websocketServerService,
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      downloadUpdate,
      getBinaryNameFile,
      openFile,
      checkToken,
      login,
      register,
      requestPasswordReset,
      resetPassword,
      verifyCode,
      setupTotp,
      enableTotp,
      verifyLoginTotp,
      disableTotp,
      useRecoveryCode,
      initPasskeyRegistration,
      completePasskeyRegistration,
      initPasskeyAuthentication,
      completePasskeyAuthentication,
      disablePasskey,
      enableBiometric,
      initBiometricAuth,
      completeBiometricAuth,
      disableBiometric,
      getUserSecurityStatus,
      initTotpQrLogin,
      qrGenerate,
      qrApprove,
      qrStatus,
      qrToggle,
      qrLoginComplete,
      checkAndroidBiometric,
      authenticateAndroidBiometric,
      exportToCloud,
      getAllDataForAdmin,
      getAllDataForArchive,
      importToLocal,
      manageData,
      permanentlyDeleteRecord,
      permanentlyDeleteRecordLocal,
      toggleDeleteStatus,
      toggleDeleteStatusLocal,
      profileSyncToCloud,
      profileSyncAllForUser,
      statisticsGet
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
