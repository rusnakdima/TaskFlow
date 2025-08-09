use crate::models::{
  category_model::{CategoryFullModel, CategoryModel},
  profile_model::{ProfileFullModel, ProfileModel},
  subtask_model::{SubtaskFullModel, SubtaskModel},
  task_model::{TaskFullModel, TaskModel},
  task_shares_model::{TaskSharesFullModel, TaskSharesModel},
  todo_model::{TodoFullModel, TodoModel},
  user_model::{UserFullModel, UserModel},
};

#[derive(Debug, Clone)]
pub enum ListModels {
  User(UserModel),
  Profile(ProfileModel),
  Category(CategoryModel),
  Todo(TodoModel),
  Task(TaskModel),
  Subtask(SubtaskModel),
  TaskShares(TaskSharesModel),
}

#[derive(Debug, Clone)]
pub enum ListFullModels {
  User(UserFullModel),
  Profile(ProfileFullModel),
  Category(CategoryFullModel),
  Todo(TodoFullModel),
  Task(TaskFullModel),
  Subtask(SubtaskFullModel),
  TaskShares(TaskSharesFullModel),
}
