#![allow(non_snake_case)]

/* imports */
mod helpers;
mod models;
mod providers;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;
use tauri::{async_runtime::block_on, Manager};

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
  profile_route::{profileCreate, profileDelete, profileGet, profileGetAll, profileUpdate},
  statistics_route::statisticsGet,
};

/* services */
use services::{
  about_service::AboutService, auth_service::AuthService, crud_service::CrudService,
  manage_db_service::ManageDbService, profile_service::ProfileService,
  statistics_service::StatisticsService, websocket_server_service::WebSocketServerService,
};

pub struct AppState {
  pub config: ConfigHelper,
  pub crudService: Arc<CrudService>,
  pub authService: Arc<AuthService>,
  pub profileService: Arc<ProfileService>,
  pub manageDbService: Arc<ManageDbService>,
  pub aboutService: Arc<AboutService>,
  pub statisticsService: Arc<StatisticsService>,
  pub webSocketServerService: Arc<WebSocketServerService>,
  pub activityLogHelper: Arc<ActivityLogHelper>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let config = ConfigHelper::new();

      let appHandle = app.handle();
      let mongodbProvider = match block_on(MongodbProvider::new(
        config.mongoDbUri.clone(),
        config.mongoDbName.clone(),
      )) {
        Ok(provider) => Some(Arc::new(provider)),
        Err(e) => {
          println!("Failed to connect to MongoDB: {:?}", e);
          None
        }
      };

      let jsonProvider = JsonProvider::new(
        appHandle.clone(),
        config.appHomeFolder.clone(),
        config.jsonDbName.clone(),
        mongodbProvider.clone(),
      );

      let activityLogHelper = Arc::new(ActivityLogHelper::new(jsonProvider.clone()));

      // Create unified CRUD service
      let crudService = Arc::new(CrudService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
        activityLogHelper.clone(),
      ));

      // Create auth service
      let authService = Arc::new(AuthService::new(
        jsonProvider.clone(),
        mongodbProvider
          .clone()
          .expect("MongoDB provider required for AuthController"),
        config.jwtSecret.clone(),
      ));

      // Create profile service
      let profileService = Arc::new(ProfileService::new(jsonProvider.clone()));

      // Create manage DB service for sync operations
      let manageDbService = Arc::new(ManageDbService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
      ));

      // Create about service
      let aboutService = Arc::new(AboutService::new(config.nameApp.clone()));

      // Create statistics service
      let statisticsService = Arc::new(StatisticsService::new(
        jsonProvider.clone(),
        activityLogHelper.clone(),
      ));

      // Create WebSocket service for real-time updates using crud_service
      let webSocketServerService = Arc::new(WebSocketServerService::new(crudService.clone()));

      #[cfg(not(mobile))]
      {
        let wsClone = webSocketServerService.clone();
        tauri::async_runtime::spawn(async move {
          let _ = wsClone.start(8766).await;
        });
      }

      app.manage(AppState {
        config: config.clone(),
        crudService,
        authService,
        profileService,
        manageDbService,
        aboutService,
        statisticsService,
        webSocketServerService,
        activityLogHelper,
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // Unified CRUD endpoint
      manageData,
      // Auth endpoints (special logic, not CRUD)
      checkToken,
      login,
      register,
      requestPasswordReset,
      verifyCode,
      resetPassword,
      // Profile endpoints (special logic, not CRUD)
      profileGetAll,
      profileGet,
      profileCreate,
      profileUpdate,
      profileDelete,
      // Sync operations
      importToLocal,
      exportToCloud,
      getAllDataForAdmin,
      permanentlyDeleteRecord,
      toggleDeleteStatus,
      // About endpoints
      downloadUpdate,
      getBinaryNameFile,
      openFile,
      // Statistics endpoints
      statisticsGet,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
