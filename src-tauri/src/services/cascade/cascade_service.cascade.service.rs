/* sys lib */
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::error::OrmResult;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;
use serde_json::{json, Value};

/* helpers */
use crate::helpers::response_helper::err_response_formatted;

/* models */
use crate::entities::response_entity::ResponseModel;

#[derive(Default, serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CascadeIds {
  pub todo_ids: Vec<String>,
  pub task_ids: Vec<String>,
  pub subtask_ids: Vec<String>,
  pub comment_ids: Vec<String>,
  pub chat_ids: Vec<String>,
}

impl CascadeIds {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn is_empty(&self) -> bool {
    self.todo_ids.is_empty()
      && self.task_ids.is_empty()
      && self.subtask_ids.is_empty()
      && self.comment_ids.is_empty()
      && self.chat_ids.is_empty()
  }

  pub fn total_count(&self) -> usize {
    self.todo_ids.len()
      + self.task_ids.len()
      + self.subtask_ids.len()
      + self.comment_ids.len()
      + self.chat_ids.len()
  }

  pub fn add_id(&mut self, collection: &str, id: String) {
    match collection {
      "todos" => {
        if !self.todo_ids.contains(&id) {
          self.todo_ids.push(id);
        }
      }
      "tasks" => {
        if !self.task_ids.contains(&id) {
          self.task_ids.push(id);
        }
      }
      "subtasks" => {
        if !self.subtask_ids.contains(&id) {
          self.subtask_ids.push(id);
        }
      }
      "comments" => {
        if !self.comment_ids.contains(&id) {
          self.comment_ids.push(id);
        }
      }
      "chats" => {
        if !self.chat_ids.contains(&id) {
          self.chat_ids.push(id);
        }
      }
      _ => {}
    }
  }
}

pub struct CascadeService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
}

impl Clone for CascadeService {
  fn clone(&self) -> Self {
    CascadeService {
      json_provider: self.json_provider.clone(),
      mongodb_provider: self.mongodb_provider.clone(),
    }
  }
}

impl CascadeService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  async fn collect_cascade_ids_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let mut cascade_ids = CascadeIds::default();

    match table {
      "todos" => {
        cascade_ids.add_id("todos", id.to_string());
        let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(id));
        if let Ok(tasks) = self
          .json_provider
          .find_many("tasks", Some(&filter), None, None, None, true)
          .await
        {
          for task in tasks {
            if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
              cascade_ids.add_id("tasks", task_id.to_string());
              self.collect_subtasks_json(task_id, &mut cascade_ids).await;
              self
                .collect_comments_by_task_json(task_id, &mut cascade_ids)
                .await;
            }
          }
        }
        self.collect_chats_by_todo_json(id, &mut cascade_ids).await;
      }
      "tasks" => {
        cascade_ids.add_id("tasks", id.to_string());
        self.collect_subtasks_json(id, &mut cascade_ids).await;
        self
          .collect_comments_by_task_json(id, &mut cascade_ids)
          .await;
      }
      "subtasks" => {
        cascade_ids.add_id("subtasks", id.to_string());
        self
          .collect_comments_by_subtask_json(id, &mut cascade_ids)
          .await;
      }
      "comments" => {
        cascade_ids.add_id("comments", id.to_string());
      }
      _ => {}
    }

    Ok(cascade_ids)
  }

  async fn collect_comments_by_task_json(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
    if let Ok(comments) = self
      .json_provider
      .find_many("comments", Some(&filter), None, None, None, true)
      .await
    {
      for comment in comments {
        if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
          cascade_ids.add_id("comments", comment_id.to_string());
        }
      }
    }
  }

  async fn collect_comments_by_subtask_json(&self, subtask_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("subtask_id".to_string(), serde_json::json!(subtask_id));
    if let Ok(comments) = self
      .json_provider
      .find_many("comments", Some(&filter), None, None, None, true)
      .await
    {
      for comment in comments {
        if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
          cascade_ids.add_id("comments", comment_id.to_string());
        }
      }
    }
  }

  async fn collect_chats_by_todo_json(&self, todo_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id));
    if let Ok(chats) = self
      .json_provider
      .find_many("chats", Some(&filter), None, None, None, true)
      .await
    {
      for chat in chats {
        if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
          cascade_ids.add_id("chats", chat_id.to_string());
        }
      }
    }
  }

  async fn collect_subtasks_json(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
    let result: OrmResult<Vec<Value>> = self
      .json_provider
      .find_many("subtasks", Some(&filter), None, None, None, true)
      .await;
    if let Ok(subtasks) = result {
      for subtask in subtasks {
        let sid = subtask.get("id").and_then(|v| v.as_str()).map(String::from);
        if let Some(subtask_id) = sid {
          cascade_ids.add_id("subtasks", subtask_id);
        }
      }
    }
  }

  async fn collect_cascade_ids_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let mut cascade_ids = CascadeIds::default();

    if let Some(ref mongo) = self.mongodb_provider {
      match table {
        "todos" => {
          cascade_ids.add_id("todos", id.to_string());
          let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(id));
          if let Ok(tasks) = mongo
            .find_many("tasks", Some(&filter), None, None, None, true)
            .await
          {
            for task in tasks {
              if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
                cascade_ids.add_id("tasks", task_id.to_string());
                self.collect_subtasks_mongo(task_id, &mut cascade_ids).await;
                self
                  .collect_comments_by_task_mongo(task_id, &mut cascade_ids)
                  .await;
              }
            }
          }
          self.collect_chats_by_todo_mongo(id, &mut cascade_ids).await;
        }
        "tasks" => {
          cascade_ids.add_id("tasks", id.to_string());
          self.collect_subtasks_mongo(id, &mut cascade_ids).await;
          self
            .collect_comments_by_task_mongo(id, &mut cascade_ids)
            .await;
        }
        "subtasks" => {
          cascade_ids.add_id("subtasks", id.to_string());
          self
            .collect_comments_by_subtask_mongo(id, &mut cascade_ids)
            .await;
        }
        "comments" => {
          cascade_ids.add_id("comments", id.to_string());
        }
        _ => {}
      }
    }

    Ok(cascade_ids)
  }

  async fn collect_comments_by_task_mongo(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
      if let Ok(comments) = mongo
        .find_many("comments", Some(&filter), None, None, None, true)
        .await
      {
        for comment in comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            cascade_ids.add_id("comments", comment_id.to_string());
          }
        }
      }
    }
  }

  async fn collect_comments_by_subtask_mongo(
    &self,
    subtask_id: &str,
    cascade_ids: &mut CascadeIds,
  ) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("subtask_id".to_string(), serde_json::json!(subtask_id));
      if let Ok(comments) = mongo
        .find_many("comments", Some(&filter), None, None, None, true)
        .await
      {
        for comment in comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            cascade_ids.add_id("comments", comment_id.to_string());
          }
        }
      }
    }
  }

  async fn collect_chats_by_todo_mongo(&self, todo_id: &str, cascade_ids: &mut CascadeIds) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id));
      if let Ok(chats) = mongo
        .find_many("chats", Some(&filter), None, None, None, true)
        .await
      {
        for chat in chats {
          if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
            cascade_ids.add_id("chats", chat_id.to_string());
          }
        }
      }
    }
  }

  async fn collect_subtasks_mongo(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
      let result: OrmResult<Vec<Value>> = mongo
        .find_many("subtasks", Some(&filter), None, None, None, true)
        .await;
      if let Ok(subtasks) = result {
        for subtask in subtasks {
          let sid = subtask.get("id").and_then(|v| v.as_str()).map(String::from);
          if let Some(subtask_id) = sid {
            cascade_ids.add_id("subtasks", subtask_id);
          }
        }
      }
    }
  }

  pub async fn handle_json_cascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    self.collect_cascade_ids_json(table, id).await
  }

  pub async fn handle_mongo_cascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if self.mongodb_provider.is_none() {
      return Err(err_response_formatted("MongoDB not available", ""));
    }
    self.collect_cascade_ids_mongo(table, id).await
  }

  // ==================== SOFT DELETE CASCADE ====================

  pub async fn soft_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let cascade_ids = self.collect_cascade_ids_json(table, id).await?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    let patch = json!({ "deleted_at": timestamp });

    self
      .apply_cascade_patch_json(table, &cascade_ids, patch.clone())
      .await?;
    Ok(cascade_ids)
  }

  pub async fn soft_delete_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    if self.mongodb_provider.is_none() {
      return Err(err_response_formatted("MongoDB not available", ""));
    }
    let cascade_ids = self.collect_cascade_ids_mongo(table, id).await?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    let patch = json!({ "deleted_at": timestamp });

    self
      .apply_cascade_patch_mongo(table, &cascade_ids, patch)
      .await?;
    Ok(cascade_ids)
  }

  // ==================== PERMANENT DELETE CASCADE ====================

  pub async fn permanent_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let cascade_ids = self.collect_cascade_ids_json(table, id).await?;

    self.apply_cascade_delete_json(table, &cascade_ids).await?;
    Ok(cascade_ids)
  }

  pub async fn permanent_delete_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    if self.mongodb_provider.is_none() {
      return Err(err_response_formatted("MongoDB not available", ""));
    }
    let cascade_ids = self.collect_cascade_ids_mongo(table, id).await?;

    self.apply_cascade_delete_mongo(table, &cascade_ids).await?;
    Ok(cascade_ids)
  }

  // ==================== RESTORE CASCADE ====================

  pub async fn restore_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let cascade_ids = self.collect_cascade_ids_json(table, id).await?;
    let patch = json!({ "deleted_at": serde_json::Value::Null });

    self
      .apply_cascade_patch_json(table, &cascade_ids, patch)
      .await?;
    Ok(cascade_ids)
  }

  pub async fn restore_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    if self.mongodb_provider.is_none() {
      return Err(err_response_formatted("MongoDB not available", ""));
    }
    let cascade_ids = self.collect_cascade_ids_mongo(table, id).await?;
    let patch = json!({ "deleted_at": serde_json::Value::Null });

    self
      .apply_cascade_patch_mongo(table, &cascade_ids, patch)
      .await?;
    Ok(cascade_ids)
  }

  // ==================== SYNC TO PROVIDER ====================

  pub async fn sync_entity_to_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let cascade_ids = self.collect_cascade_ids_json(table, id).await?;
    let docs = self.fetch_cascade_docs_json(table, &cascade_ids).await?;

    for doc in docs {
      if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
        if let Err(e) = self.json_provider.insert(table, doc.clone()).await {
          tracing::warn!(
            "[CascadeService] Failed to insert {} in sync_entity_to_json: {}",
            doc_id,
            e
          );
        }
        if let Err(e) = self.json_provider.patch(table, doc_id, doc.clone()).await {
          tracing::warn!(
            "[CascadeService] Failed to patch {} in sync_entity_to_json: {}",
            doc_id,
            e
          );
        }
      }
    }
    Ok(cascade_ids)
  }

  pub async fn sync_entity_to_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    if self.mongodb_provider.is_none() {
      return Err(err_response_formatted("MongoDB not available", ""));
    }
    let cascade_ids = self.collect_cascade_ids_mongo(table, id).await?;
    let docs = self.fetch_cascade_docs_mongo(table, &cascade_ids).await?;

    if let Some(ref mongo) = self.mongodb_provider {
      for doc in docs {
        if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
          if let Err(e) = mongo.insert(table, doc.clone()).await {
            tracing::warn!(
              "[CascadeService] Failed to insert {} in sync_entity_to_mongo: {}",
              doc_id,
              e
            );
          }
          if let Err(e) = mongo.patch(table, doc_id, doc.clone()).await {
            tracing::warn!(
              "[CascadeService] Failed to patch {} in sync_entity_to_mongo: {}",
              doc_id,
              e
            );
          }
        }
      }
    }
    Ok(cascade_ids)
  }

  // ==================== PRIVATE HELPERS ====================

  async fn apply_cascade_patch_json(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
    patch: Value,
  ) -> Result<(), ResponseModel> {
    for id in &cascade_ids.todo_ids {
      if let Err(e) = self.json_provider.patch("todos", id, patch.clone()).await {
        tracing::warn!(
          "[CascadeService] Failed to patch todo {} in apply_cascade_patch_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.task_ids {
      if let Err(e) = self.json_provider.patch("tasks", id, patch.clone()).await {
        tracing::warn!(
          "[CascadeService] Failed to patch task {} in apply_cascade_patch_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.subtask_ids {
      if let Err(e) = self
        .json_provider
        .patch("subtasks", id, patch.clone())
        .await
      {
        tracing::warn!(
          "[CascadeService] Failed to patch subtask {} in apply_cascade_patch_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.comment_ids {
      if let Err(e) = self
        .json_provider
        .patch("comments", id, patch.clone())
        .await
      {
        tracing::warn!(
          "[CascadeService] Failed to patch comment {} in apply_cascade_patch_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.chat_ids {
      if let Err(e) = self.json_provider.patch("chats", id, patch.clone()).await {
        tracing::warn!(
          "[CascadeService] Failed to patch chat {} in apply_cascade_patch_json: {}",
          id,
          e
        );
      }
    }
    Ok(())
  }

  async fn apply_cascade_patch_mongo(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
    patch: Value,
  ) -> Result<(), ResponseModel> {
    if let Some(ref mongo) = self.mongodb_provider {
      for id in &cascade_ids.todo_ids {
        if let Err(e) = mongo.patch("todos", id, patch.clone()).await {
          tracing::warn!(
            "[CascadeService] Failed to patch todo {} in apply_cascade_patch_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.task_ids {
        if let Err(e) = mongo.patch("tasks", id, patch.clone()).await {
          tracing::warn!(
            "[CascadeService] Failed to patch task {} in apply_cascade_patch_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.subtask_ids {
        if let Err(e) = mongo.patch("subtasks", id, patch.clone()).await {
          tracing::warn!(
            "[CascadeService] Failed to patch subtask {} in apply_cascade_patch_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.comment_ids {
        if let Err(e) = mongo.patch("comments", id, patch.clone()).await {
          tracing::warn!(
            "[CascadeService] Failed to patch comment {} in apply_cascade_patch_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.chat_ids {
        if let Err(e) = mongo.patch("chats", id, patch.clone()).await {
          tracing::warn!(
            "[CascadeService] Failed to patch chat {} in apply_cascade_patch_mongo: {}",
            id,
            e
          );
        }
      }
    }
    Ok(())
  }

  async fn apply_cascade_delete_json(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<(), ResponseModel> {
    for id in &cascade_ids.todo_ids {
      if let Err(e) = self.json_provider.delete("todos", id).await {
        tracing::warn!(
          "[CascadeService] Failed to delete todo {} in apply_cascade_delete_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.task_ids {
      if let Err(e) = self.json_provider.delete("tasks", id).await {
        tracing::warn!(
          "[CascadeService] Failed to delete task {} in apply_cascade_delete_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.subtask_ids {
      if let Err(e) = self.json_provider.delete("subtasks", id).await {
        tracing::warn!(
          "[CascadeService] Failed to delete subtask {} in apply_cascade_delete_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.comment_ids {
      if let Err(e) = self.json_provider.delete("comments", id).await {
        tracing::warn!(
          "[CascadeService] Failed to delete comment {} in apply_cascade_delete_json: {}",
          id,
          e
        );
      }
    }
    for id in &cascade_ids.chat_ids {
      if let Err(e) = self.json_provider.delete("chats", id).await {
        tracing::warn!(
          "[CascadeService] Failed to delete chat {} in apply_cascade_delete_json: {}",
          id,
          e
        );
      }
    }
    Ok(())
  }

  async fn apply_cascade_delete_mongo(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<(), ResponseModel> {
    if let Some(ref mongo) = self.mongodb_provider {
      for id in &cascade_ids.todo_ids {
        if let Err(e) = mongo.delete("todos", id).await {
          tracing::warn!(
            "[CascadeService] Failed to delete todo {} in apply_cascade_delete_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.task_ids {
        if let Err(e) = mongo.delete("tasks", id).await {
          tracing::warn!(
            "[CascadeService] Failed to delete task {} in apply_cascade_delete_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.subtask_ids {
        if let Err(e) = mongo.delete("subtasks", id).await {
          tracing::warn!(
            "[CascadeService] Failed to delete subtask {} in apply_cascade_delete_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.comment_ids {
        if let Err(e) = mongo.delete("comments", id).await {
          tracing::warn!(
            "[CascadeService] Failed to delete comment {} in apply_cascade_delete_mongo: {}",
            id,
            e
          );
        }
      }
      for id in &cascade_ids.chat_ids {
        if let Err(e) = mongo.delete("chats", id).await {
          tracing::warn!(
            "[CascadeService] Failed to delete chat {} in apply_cascade_delete_mongo: {}",
            id,
            e
          );
        }
      }
    }
    Ok(())
  }

  async fn fetch_cascade_docs_json(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<Vec<Value>, ResponseModel> {
    let mut docs = Vec::new();

    if !cascade_ids.todo_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .todo_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(todos) = self
        .json_provider
        .find_many("todos", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(todos);
      }
    }

    if !cascade_ids.task_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .task_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(tasks) = self
        .json_provider
        .find_many("tasks", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(tasks);
      }
    }

    if !cascade_ids.subtask_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .subtask_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(subtasks) = self
        .json_provider
        .find_many("subtasks", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(subtasks);
      }
    }

    if !cascade_ids.comment_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .comment_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(comments) = self
        .json_provider
        .find_many("comments", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(comments);
      }
    }

    if !cascade_ids.chat_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .chat_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(chats) = self
        .json_provider
        .find_many("chats", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(chats);
      }
    }

    Ok(docs)
  }

  async fn fetch_cascade_docs_mongo(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<Vec<Value>, ResponseModel> {
    let mut docs = Vec::new();

    if let Some(ref mongo) = self.mongodb_provider {
      if !cascade_ids.todo_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .todo_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(todos) = mongo
          .find_many("todos", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(todos);
        }
      }

      if !cascade_ids.task_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .task_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(tasks) = mongo
          .find_many("tasks", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(tasks);
        }
      }

      if !cascade_ids.subtask_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .subtask_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(subtasks) = mongo
          .find_many("subtasks", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(subtasks);
        }
      }

      if !cascade_ids.comment_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .comment_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(comments) = mongo
          .find_many("comments", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(comments);
        }
      }

      if !cascade_ids.chat_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .chat_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(chats) = mongo
          .find_many("chats", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(chats);
        }
      }
    }

    Ok(docs)
  }
}
