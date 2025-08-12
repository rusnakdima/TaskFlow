/* imports */
mod controllers;
mod helpers;
mod models;
mod routes;
mod services;

/* sys lib */
use std::sync::Arc;

/* routes */
use routes::about_route::{download_update, get_binary_name_file};
use routes::auth_route::{check_token, login, register};
use routes::category_route::{
  category_create, category_delete, category_get, category_get_all, category_update,
};
use routes::profile_route::{
  profile_create, profile_delete, profile_get, profile_get_all, profile_get_by_user_id,
  profile_update,
};
use routes::subtask_route::{
  subtask_create, subtask_delete, subtask_get, subtask_get_all, subtask_update,
};
use routes::task_route::{task_create, task_delete, task_get, task_get_all, task_update};
use routes::task_shares_route::{
  task_shares_create, task_shares_delete, task_shares_get, task_shares_get_all, task_shares_update,
};
use routes::todo_route::{todo_create, todo_delete, todo_get, todo_get_all, todo_update};

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
      get_binary_name_file,
      download_update,
      check_token,
      login,
      register,
      profile_get_all,
      profile_get,
      profile_get_by_user_id,
      profile_create,
      profile_update,
      profile_delete,
      category_get_all,
      category_get,
      category_create,
      category_update,
      category_delete,
      todo_get_all,
      todo_get,
      todo_create,
      todo_update,
      todo_delete,
      task_get_all,
      task_get,
      task_create,
      task_update,
      task_delete,
      subtask_get_all,
      subtask_get,
      subtask_create,
      subtask_update,
      subtask_delete,
      task_shares_get_all,
      task_shares_get,
      task_shares_create,
      task_shares_update,
      task_shares_delete,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
