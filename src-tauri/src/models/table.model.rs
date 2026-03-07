/* sys lib */
use serde_json::Value;

// Import all model types
use crate::models::{
  category_model::{CategoryCreateModel, CategoryModel, CategoryUpdateModel},
  daily_activity_model::{DailyActivityCreateModel, DailyActivityModel},
  profile_model::{ProfileCreateModel, ProfileModel, ProfileUpdateModel},
  subtask_model::{SubtaskCreateModel, SubtaskModel, SubtaskUpdateModel},
  task_model::{TaskCreateModel, TaskModel, TaskUpdateModel},
  todo_model::{TodoCreateModel, TodoModel, TodoUpdateModel},
  user_model::{UserCreateModel, UserModel, UserUpdateModel},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TableModelType {
  Todo,
  Task,
  Subtask,
  Category,
  User,
  Profile,
  DailyActivity,
}

pub fn validateTable(tableName: &str) -> Result<TableModelType, String> {
  match tableName {
    "todos" => Ok(TableModelType::Todo),
    "tasks" => Ok(TableModelType::Task),
    "subtasks" => Ok(TableModelType::Subtask),
    "categories" => Ok(TableModelType::Category),
    "users" => Ok(TableModelType::User),
    "profiles" => Ok(TableModelType::Profile),
    "daily_activities" => Ok(TableModelType::DailyActivity),
    _ => Err(format!(
      "Table '{}' is not supported. Allowed tables: todos, tasks, subtasks, categories, users, profiles, daily_activities",
      tableName
    )),
  }
}

/// Validate data for create or update operation
/// Returns validated data ready for database operation
pub fn validateModel(tableName: &str, data: &Value, isCreate: bool) -> Result<Value, String> {
  let modelType = validateTable(tableName)?;

  if !data.is_object() {
    return Err("Data must be a JSON object".to_string());
  }

  match modelType {
    TableModelType::Todo => {
      if isCreate {
        let createModel: TodoCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid todo data: {}", e))?;
        createModel.validate()?;
        let model: TodoModel = createModel.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize todo model: {}", e))
      } else {
        let updateModel: TodoUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid todo update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Task => {
      if isCreate {
        let createModel: TaskCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid task data: {}", e))?;
        createModel.validate()?;
        let model: TaskModel = createModel.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize task model: {}", e))
      } else {
        let updateModel: TaskUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid task update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Subtask => {
      if isCreate {
        let createModel: SubtaskCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid subtask data: {}", e))?;
        createModel.validate()?;
        let model: SubtaskModel = createModel.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize subtask model: {}", e))
      } else {
        let updateModel: SubtaskUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid subtask update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Category => {
      if isCreate {
        let createModel: CategoryCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid category data: {}", e))?;
        createModel.validate()?;
        let model: CategoryModel = createModel.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize category model: {}", e))
      } else {
        let updateModel: CategoryUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid category update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::User => {
      if isCreate {
        let createModel: UserCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid user data: {}", e))?;
        createModel.validate()?;
        let model: UserModel = createModel.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize user model: {}", e))
      } else {
        let updateModel: UserUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid user update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Profile => {
      if isCreate {
        let createModel: ProfileCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid profile data: {}", e))?;
        createModel.validate()?;
        let model: ProfileModel = createModel.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize profile model: {}", e))
      } else {
        let updateModel: ProfileUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid profile update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::DailyActivity => {
      if isCreate {
        let createModel: DailyActivityCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid daily activity data: {}", e))?;
        createModel.validate()?;
        let model: DailyActivityModel = createModel.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize daily activity model: {}", e))
      } else {
        // DailyActivity update - just return data as-is
        Ok(data.clone())
      }
    }
  }
}
