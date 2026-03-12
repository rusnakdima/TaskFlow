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
  auth_route::{checkToken, login, register, requestPasswordReset, resetPassword, verifyCode},
  manage_db_route::{
    exportToCloud, getAllDataForAdmin, importToLocal, manageData, permanentlyDeleteRecord,
    toggleDeleteStatus,
  },
  profile_route::{profileSyncToCloud, profileSyncAllForUser},
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
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    .setup(|app| {
      let configHelper = Arc::new(ConfigHelper::new());

      let mongodbProvider = {
        let uri = configHelper.mongoDbUri.clone();
        let dbName = configHelper.mongoDbName.clone();
        match tauri::async_runtime::block_on(MongodbProvider::new(uri, dbName)) {
          Ok(p) => Some(Arc::new(p)),
          Err(_) => None,
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
      let profileService = Arc::new(ProfileService::new(jsonProvider.clone()));

      let cascadeService = CascadeService::new(jsonProvider.clone(), mongodbProvider.clone());
      let entityResolution = Arc::new(EntityResolutionService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
      ));
      let activityMonitor =
        ActivityMonitorService::new(activityLogHelper.clone(), entityResolution.clone());

      let crudService = Arc::new(CrudService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
        cascadeService.clone(),
        entityResolution.clone(),
        activityMonitor,
      ));

      let authService = Arc::new(AuthService::new(
        jsonProvider.clone(),
        mongodbProvider.clone().expect("MongoDB required for Auth"),
        configHelper.jwtSecret.clone(),
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
      exportToCloud,
      getAllDataForAdmin,
      importToLocal,
      manageData,
      permanentlyDeleteRecord,
      toggleDeleteStatus,
      profileSyncToCloud,
      profileSyncAllForUser,
      statisticsGet
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
