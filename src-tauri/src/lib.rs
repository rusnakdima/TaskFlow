/* imports */
mod controllers;
mod helpers;
mod models;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;

/* routes */
use routes::about_route::{downloadUpdate, getBinaryNameFile};
use routes::auth_route::{checkToken, login, register};
use routes::category_route::{
  categoryCreate, categoryDelete, categoryGet, categoryGetAll, categoryGetByField, categoryUpdate,
};
use routes::profile_route::{
  profileCreate, profileDelete, profileGet, profileGetAll, profileGetByField, profileUpdate,
};
use routes::subtask_route::{
  subtaskCreate, subtaskDelete, subtaskGet, subtaskGetAll, subtaskGetByField, subtaskUpdate,
};
use routes::task_route::{taskCreate, taskDelete, taskGet, taskGetAll, taskGetByField, taskUpdate};
use routes::task_shares_route::{
  taskSharesCreate, taskSharesDelete, taskSharesGet, taskSharesGetAll, taskSharesGetByField,
  taskSharesUpdate,
};
use routes::todo_route::{todoCreate, todoDelete, todoGet, todoGetAll, todoGetByField, todoUpdate};

/* controllers */
use controllers::about_controller::AboutController;
use controllers::auth_controller::AuthController;
use controllers::category_controller::CategoriesController;
use controllers::profile_controller::ProfileController;
use controllers::subtask_controller::SubtaskController;
use controllers::task_controller::TaskController;
use controllers::task_shares_controller::TaskSharesController;
use controllers::todo_controller::TodoController;

#[allow(non_snake_case)]
pub struct AppState {
  aboutController: Arc<AboutController>,
  authController: Arc<AuthController>,
  profileController: Arc<ProfileController>,
  categoriesController: Arc<CategoriesController>,
  todoController: Arc<TodoController>,
  taskController: Arc<TaskController>,
  subtaskController: Arc<SubtaskController>,
  taskSharesController: Arc<TaskSharesController>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(AppState {
      aboutController: Arc::new(AboutController::new()),
      authController: Arc::new(AuthController::new()),
      profileController: Arc::new(ProfileController::new()),
      categoriesController: Arc::new(CategoriesController::new()),
      todoController: Arc::new(TodoController::new()),
      taskController: Arc::new(TaskController::new()),
      subtaskController: Arc::new(SubtaskController::new()),
      taskSharesController: Arc::new(TaskSharesController::new()),
    })
    .invoke_handler(tauri::generate_handler![
      downloadUpdate,
      getBinaryNameFile,
      checkToken,
      login,
      register,
      profileGetAll,
      profileGetByField,
      profileGet,
      profileCreate,
      profileUpdate,
      profileDelete,
      categoryGetAll,
      categoryGetByField,
      categoryGet,
      categoryCreate,
      categoryUpdate,
      categoryDelete,
      todoGetAll,
      todoGetByField,
      todoGet,
      todoCreate,
      todoUpdate,
      todoDelete,
      taskGetAll,
      taskGetByField,
      taskGet,
      taskCreate,
      taskUpdate,
      taskDelete,
      subtaskGetAll,
      subtaskGetByField,
      subtaskGet,
      subtaskCreate,
      subtaskUpdate,
      subtaskDelete,
      taskSharesGetAll,
      taskSharesGetByField,
      taskSharesGet,
      taskSharesCreate,
      taskSharesUpdate,
      taskSharesDelete,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
