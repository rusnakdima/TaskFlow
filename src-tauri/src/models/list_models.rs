/* sys lib */
use mongodb::{bson::Document, Collection, Database};

use crate::models::{
  profile::ProfileModel, subtask::SubtaskModel, task::TaskModel, task_shares::TaskSharesModel,
  todo::TodoModel, user::UserModel,
};

#[derive(Debug, Clone)]
pub enum ListModels {
  User(UserModel),
  Profile(ProfileModel),
  Todo(TodoModel),
  Task(TaskModel),
  Subtask(SubtaskModel),
  TaskShares(TaskSharesModel),
}
