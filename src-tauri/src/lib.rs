/* imports */
mod controllers;
mod helpers;
mod models;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;
use tauri::{async_runtime::block_on, Manager};

/* helpers */
use crate::helpers::{
  config::ConfigHelper,
  {json_provider::JsonProvider, mongodb_provider::MongodbProvider},
};

/* routes */
use routes::about_route::{downloadUpdate, getBinaryNameFile};
use routes::auth_route::{
  checkToken, login, register, requestPasswordReset, resetPassword, verifyCode,
};
use routes::category_route::{
  categoryCreate, categoryDelete, categoryGetAllByField, categoryGetByField, categoryUpdate,
};
use routes::manage_db_route::{
  exportToCloud, getAllDataForAdmin, importToLocal, permanentlyDeleteRecord,
};
use routes::profile_route::{
  profileCreate, profileDelete, profileGetAllByField, profileGetByField, profileUpdate,
};
use routes::statistics_route::statisticsGet;
use routes::subtask_route::{
  subtaskCreate, subtaskDelete, subtaskGetAllByField, subtaskGetByField, subtaskUpdate,
};
use routes::task_route::{taskCreate, taskDelete, taskGetAllByField, taskGetByField, taskUpdate};
use routes::task_shares_route::{
  taskSharesCreate, taskSharesDelete, taskSharesGetAllByField, taskSharesGetByField,
  taskSharesUpdate,
};
use routes::todo_route::{
  todoCreate, todoDelete, todoGetAllByField, todoGetByAssignee, todoGetByField, todoUpdate,
};

/* controllers */
use controllers::{
  about_controller::AboutController, auth_controller::AuthController,
  category_controller::CategoriesController, manage_db_controller::ManageDbController,
  profile_controller::ProfileController, statistics_controller::StatisticsController,
  subtask_controller::SubtaskController, task_controller::TaskController,
  task_shares_controller::TaskSharesController, todo_controller::TodoController,
};

/* services */
use services::daily_activity_service::DailyActivityService;

#[allow(non_snake_case)]
pub struct AppState {
  pub managedbController: Arc<ManageDbController>,
  pub aboutController: Arc<AboutController>,
  pub authController: Option<Arc<AuthController>>,
  pub profileController: Option<Arc<ProfileController>>,
  pub categoriesController: Arc<CategoriesController>,
  pub todoController: Arc<TodoController>,
  pub taskController: Arc<TaskController>,
  pub subtaskController: Arc<SubtaskController>,
  pub taskSharesController: Arc<TaskSharesController>,
  pub statisticsController: Arc<StatisticsController>,
  pub dailyActivityService: Arc<DailyActivityService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(non_snake_case)]
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

      let authController = mongodbProvider
        .as_ref()
        .map(|mp| Arc::new(AuthController::new(mp.clone(), config.clone())));

      let profileController = mongodbProvider
        .as_ref()
        .map(|mp| Arc::new(ProfileController::new(mp.clone())));

      let managedbController = Arc::new(ManageDbController::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
      ));

      app.manage(AppState {
        managedbController,
        aboutController: Arc::new(AboutController::new(config.nameApp.clone())),
        authController,
        profileController,
        categoriesController: Arc::new(CategoriesController::new(jsonProvider.clone())),
        todoController: Arc::new(TodoController::new(
          jsonProvider.clone(),
          DailyActivityService::new(jsonProvider.clone()),
        )),
        taskController: Arc::new(TaskController::new(
          jsonProvider.clone(),
          DailyActivityService::new(jsonProvider.clone()),
        )),
        subtaskController: Arc::new(SubtaskController::new(
          jsonProvider.clone(),
          DailyActivityService::new(jsonProvider.clone()),
        )),
        taskSharesController: Arc::new(TaskSharesController::new(jsonProvider.clone())),
        statisticsController: Arc::new(StatisticsController::new(jsonProvider.clone())),
        dailyActivityService: Arc::new(DailyActivityService::new(jsonProvider.clone())),
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      downloadUpdate,
      getBinaryNameFile,
      checkToken,
      login,
      register,
      requestPasswordReset,
      verifyCode,
      resetPassword,
      profileGetAllByField,
      profileGetByField,
      profileCreate,
      profileUpdate,
      profileDelete,
      categoryGetAllByField,
      categoryGetByField,
      categoryCreate,
      categoryUpdate,
      categoryDelete,
      todoGetAllByField,
      todoGetByField,
      todoGetByAssignee,
      todoCreate,
      todoUpdate,
      todoDelete,
      taskGetAllByField,
      taskGetByField,
      taskCreate,
      taskUpdate,
      taskDelete,
      subtaskGetAllByField,
      subtaskGetByField,
      subtaskCreate,
      subtaskUpdate,
      subtaskDelete,
      taskSharesGetAllByField,
      taskSharesGetByField,
      taskSharesCreate,
      taskSharesUpdate,
      taskSharesDelete,
      statisticsGet,
      importToLocal,
      exportToCloud,
      getAllDataForAdmin,
      permanentlyDeleteRecord,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
