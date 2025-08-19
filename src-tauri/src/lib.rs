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
  category_controller::CategoriesController, profile_controller::ProfileController,
  subtask_controller::SubtaskController, task_controller::TaskController,
  task_shares_controller::TaskSharesController, todo_controller::TodoController,
};

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
