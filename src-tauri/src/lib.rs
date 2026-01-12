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
  activity_log::ActivityLogHelper, config::ConfigHelper, json_provider::JsonProvider,
  mongodb_provider::MongodbProvider,
};

/* routes */
use routes::{
  about_route::{downloadUpdate, getBinaryNameFile, openFile},
  auth_route::{checkToken, login, register, requestPasswordReset, resetPassword, verifyCode},
  category_route::{
    categoryCreate, categoryDelete, categoryGetAllByField, categoryGetByField, categoryUpdate,
  },
  manage_db_route::{exportToCloud, getAllDataForAdmin, importToLocal, permanentlyDeleteRecord},
  profile_route::{
    profileCreate, profileDelete, profileGetAllByField, profileGetByField, profileUpdate,
  },
  statistics_route::statisticsGet,
  subtask_route::{
    subtaskCreate, subtaskDelete, subtaskGetAllByField, subtaskGetByField, subtaskUpdate,
    subtaskUpdateAll,
  },
  task_route::{
    taskCreate, taskDelete, taskGetAllByField, taskGetByField, taskUpdate, taskUpdateAll,
  },
  todo_route::{
    todoCreate, todoDelete, todoGetAllByField, todoGetByAssignee, todoGetByField, todoUpdate,
    todoUpdateAll,
  },
};

/* controllers */
use controllers::{
  about_controller::AboutController, auth_controller::AuthController,
  category_controller::CategoriesController, manage_db_controller::ManageDbController,
  profile_controller::ProfileController, statistics_controller::StatisticsController,
  subtask_controller::SubtaskController, task_controller::TaskController,
  todo_controller::TodoController,
};

/* services */

#[allow(non_snake_case)]
pub struct AppState {
  pub managedbController: Arc<ManageDbController>,
  pub aboutController: Arc<AboutController>,
  pub authController: Arc<AuthController>,
  pub profileController: Arc<ProfileController>,
  pub categoriesController: Arc<CategoriesController>,
  pub todoController: Arc<TodoController>,
  pub taskController: Arc<TaskController>,
  pub subtaskController: Arc<SubtaskController>,
  pub statisticsController: Arc<StatisticsController>,
  pub activityLogHelper: Arc<ActivityLogHelper>,
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

      let activityLogHelper = Arc::new(ActivityLogHelper::new(jsonProvider.clone()));

      let managedbController = Arc::new(ManageDbController::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
      ));

      app.manage(AppState {
        managedbController,
        aboutController: Arc::new(AboutController::new(config.nameApp.clone())),
        authController: Arc::new(AuthController::new(
          jsonProvider.clone(),
          mongodbProvider
            .clone()
            .expect("MongoDB provider required for AuthController"),
          config.clone(),
        )),
        profileController: Arc::new(ProfileController::new(jsonProvider.clone())),
        categoriesController: Arc::new(CategoriesController::new(jsonProvider.clone())),
        todoController: Arc::new(TodoController::new(
          jsonProvider.clone(),
          mongodbProvider
            .clone()
            .expect("MongoDB provider required for TaskController"),
          (*activityLogHelper).clone(),
        )),
        taskController: Arc::new(TaskController::new(
          jsonProvider.clone(),
          mongodbProvider
            .clone()
            .expect("MongoDB provider required for TaskController"),
          (*activityLogHelper).clone(),
        )),
        subtaskController: Arc::new(SubtaskController::new(
          jsonProvider.clone(),
          mongodbProvider
            .clone()
            .expect("MongoDB provider required for SubtaskController"),
          (*activityLogHelper).clone(),
        )),
        statisticsController: Arc::new(StatisticsController::new(
          jsonProvider.clone(),
          mongodbProvider
            .clone()
            .expect("MongoDB provider required for StatisticsController"),
          (*activityLogHelper).clone(),
        )),
        activityLogHelper,
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
      todoUpdateAll,
      todoDelete,
      taskGetAllByField,
      taskGetByField,
      taskCreate,
      taskUpdate,
      taskUpdateAll,
      taskDelete,
      subtaskGetAllByField,
      subtaskGetByField,
      subtaskCreate,
      subtaskUpdate,
      subtaskUpdateAll,
      subtaskDelete,
      statisticsGet,
      importToLocal,
      exportToCloud,
      getAllDataForAdmin,
      permanentlyDeleteRecord,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
