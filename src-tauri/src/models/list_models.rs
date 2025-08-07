use crate::models::{
  profile_model::ProfileModel, subtask_model::SubtaskModel, task_model::TaskModel,
  task_shares_model::TaskSharesModel, todo_model::TodoModel, user_model::UserModel,
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
