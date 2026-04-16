/* sys lib */
use serde_json::Value;

// Import all model types
use crate::entities::{
  category_entity::{CategoryCreateModel, CategoryEntity, CategoryUpdateModel},
  chat_entity::{ChatCreateModel, ChatEntity, ChatUpdateModel},
  comment_entity::{CommentCreateModel, CommentEntity, CommentUpdateModel},
  daily_activity_entity::{DailyActivityCreateModel, DailyActivityModel},
  profile_entity::{ProfileCreateModel, ProfileEntity, ProfileUpdateModel},
  subtask_entity::{SubtaskCreateModel, SubtaskEntity, SubtaskUpdateModel},
  task_entity::{TaskCreateModel, TaskEntity, TaskUpdateModel},
  todo_entity::{TodoCreateModel, TodoEntity, TodoUpdateModel},
  traits::Validatable,
  user_entity::{UserCreateModel, UserEntity, UserUpdateModel},
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
  Chat,
  Comment,
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
    "chats" => Ok(TableModelType::Chat),
    "comments" => Ok(TableModelType::Comment),
    _ => Err(format!(
      "Table '{}' is not supported. Allowed tables: todos, tasks, subtasks, categories, users, profiles, daily_activities, chats, comments",
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
    TableModelType::Chat => {
      if isCreate {
        let createModel: ChatCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid chat data: {}", e))?;
        createModel.validate()?;
        let model: ChatEntity = createModel.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize chat model: {}", e))
      } else {
        let updateModel: ChatUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid chat update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Todo => {
      if isCreate {
        let createModel: TodoCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid todo data: {}", e))?;
        createModel.validate()?;
        let model: TodoEntity = createModel.into();
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
        let model: TaskEntity = createModel.into();
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
        let model: SubtaskEntity = createModel.into();
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
        let model: CategoryEntity = createModel.into();
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
        let model: UserEntity = createModel.into();
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
        let model: ProfileEntity = createModel.into();
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
    TableModelType::Comment => {
      if isCreate {
        let createModel: CommentCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid comment data: {}", e))?;
        createModel.validate()?;
        let model: CommentEntity = createModel.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize comment model: {}", e))
      } else {
        let updateModel: CommentUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid comment update data: {}", e))?;
        updateModel.validate()?;
        Ok(data.clone())
      }
    }
  }
}
