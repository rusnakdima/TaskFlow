/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::error::{OrmError, OrmResult};
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;

#[derive(Clone)]
pub struct EntityResolutionService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
}

impl EntityResolutionService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  fn get_relation_path(table: &str) -> Option<Vec<&'static str>> {
    match table {
      "tasks" => Some(vec!["todo"]),
      "subtasks" => Some(vec!["task", "todo"]),
      _ => None,
    }
  }

  #[allow(clippy::multiple_bound_locations)]
  async fn get_user_id_via_entity_relations<P>(
    provider: &P,
    table: &str,
    data: &Value,
  ) -> OrmResult<Option<Value>>
  where
    P: DatabaseProvider + Send + Sync,
  {
    let relation_path = Self::get_relation_path(table)
      .ok_or_else(|| OrmError::InvalidQuery(format!("No relation path for {}", table)))?;

    let mut current_id: String = data
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| OrmError::InvalidInput("No id in data".to_string()))?
      .to_string();
    let mut current_table = table;

    for relation in relation_path {
      let filter = Filter::Eq("id".to_string(), json!(&current_id));
      let docs: Vec<Value> = provider
        .find_many(current_table, Some(&filter), None, None, None, false)
        .await?;
      let doc: Value = docs
        .into_iter()
        .next()
        .ok_or_else(|| OrmError::NotFound(format!("{} not found", current_table)))?;

      current_id = match current_table {
        "tasks" => doc
          .get("todo_id")
          .and_then(|v| v.as_str())
          .ok_or_else(|| OrmError::InvalidInput("Missing todo_id".to_string()))?
          .to_string(),
        "subtasks" => doc
          .get("task_id")
          .and_then(|v| v.as_str())
          .ok_or_else(|| OrmError::InvalidInput("Missing task_id".to_string()))?
          .to_string(),
        _ => return Ok(None),
      };
      current_table = relation;
    }

    let filter = Filter::Eq("id".to_string(), json!(&current_id));
    let todos: Vec<Value> = provider
      .find_many(current_table, Some(&filter), None, None, None, false)
      .await?;
    Ok(todos.into_iter().next())
  }

  pub async fn get_user_id_for_entity(&self, table: &str, data: &Value) -> Option<String> {
    if let Some(user_id) = data.get("user_id").and_then(|v| v.as_str()) {
      return Some(user_id.to_string());
    }

    if let Ok(Some(todo)) =
      Self::get_user_id_via_entity_relations(&self.json_provider, table, data).await
    {
      if let Some(user_id) = todo.get("user_id").and_then(|v| v.as_str()) {
        return Some(user_id.to_string());
      }
    }

    if let Some(ref mongo) = self.mongodb_provider {
      if let Ok(Some(todo)) =
        Self::get_user_id_via_entity_relations(mongo.as_ref(), table, data).await
      {
        if let Some(user_id) = todo.get("user_id").and_then(|v| v.as_str()) {
          return Some(user_id.to_string());
        }
      }
    }

    None
  }

  pub async fn get_task_id_for_subtask(&self, subtask_id: &str) -> OrmResult<Option<String>> {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Ok(Some(subtask)) = mongo.find_by_id("subtasks", subtask_id).await {
        if let Some(task_id) = subtask.get("task_id").and_then(|v| v.as_str()) {
          return Ok(Some(task_id.to_string()));
        }
      }
    }
    if let Ok(Some(subtask)) = self.json_provider.find_by_id("subtasks", subtask_id).await {
      if let Some(task_id) = subtask.get("task_id").and_then(|v| v.as_str()) {
        return Ok(Some(task_id.to_string()));
      }
    }
    Ok(None)
  }

  pub async fn get_todo_id_for_task(&self, task_id: &str) -> OrmResult<Option<String>> {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Ok(Some(task)) = mongo.find_by_id("tasks", task_id).await {
        if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
          return Ok(Some(todo_id.to_string()));
        }
      }
    }
    if let Ok(Some(task)) = self.json_provider.find_by_id("tasks", task_id).await {
      if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
        return Ok(Some(todo_id.to_string()));
      }
    }
    Ok(None)
  }
}
