#![allow(non_snake_case)]

/* imports */
mod errors;
mod helpers;
mod entities;
mod providers;
mod repositories;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;
use tauri::Manager;

/* helpers */
use crate::helpers::{activity_log::ActivityLogHelper, config::ConfigHelper};

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
  auth_service::AuthService, cascade::CascadeService, repository_service::RepositoryService,
  entity_resolution_service::EntityResolutionService, live_sync_service::LiveSyncService,
  manage_db_service::ManageDbService, profile_service::ProfileService,
  statistics_service::StatisticsService, websocket::WebSocketServerService,
};

/* nosql_orm */
use nosql_orm::providers::{JsonProvider, MongoProvider};

pub struct AppState {
  pub configHelper: Arc<ConfigHelper>,
  pub repositoryService: Arc<RepositoryService>,
  pub aboutService: Arc<AboutService>,
  pub authService: Arc<AuthService>,
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

      let documentDir = app.path().document_dir().unwrap();
      let jsonDbPath = documentDir.join(&configHelper.appHomeFolder).join(&configHelper.jsonDbName);
      std::fs::create_dir_all(&jsonDbPath).ok();

      let jsonProvider = tauri::async_runtime::block_on(JsonProvider::new(&jsonDbPath))
        .expect("Failed to create JSON provider");

      let mongodbProvider = {
        let uri = configHelper.mongoDbUri.clone();
        let dbName = configHelper.mongoDbName.clone();
        match tauri::async_runtime::block_on(MongoProvider::connect(&uri, &dbName)) {
          Ok(p) => Some(Arc::new(p)),
          Err(_e) => None,
        }
      };

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

      let json_for_repo = jsonProvider.clone();
      let json_for_auth = jsonProvider.clone();
      let json_for_stats = jsonProvider.clone();
      let json_for_mdb = jsonProvider.clone();
      let mongo_for_repo = mongodbProvider.clone();
      let mongo_for_auth = mongodbProvider.clone();
      let mongo_for_mdb = mongodbProvider.clone();
      let cas_for_repo = cascadeService.clone();
      let ent_for_repo = entityResolution.clone();
      let act_for_stats = activityLogHelper.clone();

      let repositoryService = Arc::new(RepositoryService::new(
        json_for_repo,
        mongo_for_repo,
        cas_for_repo,
        ent_for_repo,
        activityMonitor,
      ));

      let authService = Arc::new(AuthService::new(
        json_for_auth,
        mongo_for_auth,
        configHelper.jwtSecret.clone(),
        configHelper.rpDomain.clone(),
      ));

      let statisticsService = Arc::new(StatisticsService::new(
        json_for_stats,
        act_for_stats,
      ));
      let manageDbService = Arc::new(ManageDbService::new(
        json_for_mdb,
        mongo_for_mdb,
        cascadeService,
        entityResolution,
      ));

      let websocketServerService = Arc::new(WebSocketServerService::new(repositoryService.clone()));

      let wsServiceClone = websocketServerService.clone();
      tauri::async_runtime::spawn(async move {
        wsServiceClone.start(8766).await;
      });

      app.manage(AppState {
        configHelper,
        repositoryService,
        aboutService,
        authService,
        liveSyncService: None,
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
