/* imports */
mod controllers;
mod helpers;
mod models;
mod routes;
mod services;

use std::env;
/* sys lib */
use std::{path::PathBuf, sync::Arc};
use tauri::{async_runtime::block_on, path::BaseDirectory, Manager};

/* routes */
use routes::about_route::{downloadUpdate, getBinaryNameFile};
use routes::auth_route::{checkToken, login, register};
use routes::category_route::{
  categoryCreate, categoryDelete, categoryGetAllByField, categoryGetByField, categoryUpdate,
};
use routes::profile_route::{
  profileCreate, profileDelete, profileGetAllByField, profileGetByField, profileUpdate,
};
use routes::subtask_route::{
  subtaskCreate, subtaskDelete, subtaskGetAllByField, subtaskGetByField, subtaskUpdate,
};
use routes::task_route::{taskCreate, taskDelete, taskGetAllByField, taskGetByField, taskUpdate};
use routes::task_shares_route::{
  taskSharesCreate, taskSharesDelete, taskSharesGetAllByField, taskSharesGetByField,
  taskSharesUpdate,
};
use routes::todo_route::{todoCreate, todoDelete, todoGetAllByField, todoGetByField, todoUpdate};

/* controllers */
use controllers::{
  about_controller::AboutController, auth_controller::AuthController,
  category_controller::CategoriesController, manage_db_controller::ManageDbController,
  profile_controller::ProfileController, subtask_controller::SubtaskController,
  task_controller::TaskController, task_shares_controller::TaskSharesController,
  todo_controller::TodoController,
};

/* helpers */
use crate::helpers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

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
  pub taskSharesController: Arc<TaskSharesController>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(non_snake_case)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let resourcePath: PathBuf = app
        .path()
        .resolve(".env", BaseDirectory::Resource)
        .expect("Failed to resolve .env resource path");
      dotenvy::from_path(&resourcePath).ok();

      let appHandle = app.handle();
      let jsonProvider = JsonProvider::new(
        appHandle.clone(),
        env::var("APP_HOME_FOLDER").expect("APP_HOME_FOLDER must be set"),
        env::var("JSONDB_NAME").expect("JSONDB_NAME must be set in .env"),
      );
      let mongodbProvider = block_on(MongodbProvider::new(
        env::var("MONGODB_URI").expect("MONGODB_URI must be set"),
        env::var("MONGODB_NAME").expect("MONGODB_NAME must be set"),
      ));

      app.manage(AppState {
        managedbController: Arc::new(ManageDbController::new(
          jsonProvider.clone(),
          mongodbProvider.clone(),
        )),
        aboutController: Arc::new(AboutController::new(
          env::var("NAME_APP").expect("NAME_APP must be set"),
        )),
        authController: Arc::new(AuthController::new(
          jsonProvider.clone(),
          env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
        )),
        profileController: Arc::new(ProfileController::new(jsonProvider.clone())),
        categoriesController: Arc::new(CategoriesController::new(jsonProvider.clone())),
        todoController: Arc::new(TodoController::new(jsonProvider.clone())),
        taskController: Arc::new(TaskController::new(jsonProvider.clone())),
        subtaskController: Arc::new(SubtaskController::new(jsonProvider.clone())),
        taskSharesController: Arc::new(TaskSharesController::new(jsonProvider.clone())),
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      downloadUpdate,
      getBinaryNameFile,
      checkToken,
      login,
      register,
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
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
