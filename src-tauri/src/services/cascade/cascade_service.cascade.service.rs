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
use crate::helpers::response_helper::errResponseFormatted;

/* models */
use crate::entities::response_entity::ResponseModel;

#[derive(Default, serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CascadeIds {
  pub todoIds: Vec<String>,
  pub taskIds: Vec<String>,
  pub subtaskIds: Vec<String>,
  pub commentIds: Vec<String>,
  pub chatIds: Vec<String>,
}

impl CascadeIds {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn is_empty(&self) -> bool {
    self.todoIds.is_empty()
      && self.taskIds.is_empty()
      && self.subtaskIds.is_empty()
      && self.commentIds.is_empty()
      && self.chatIds.is_empty()
  }

  pub fn total_count(&self) -> usize {
    self.todoIds.len()
      + self.taskIds.len()
      + self.subtaskIds.len()
      + self.commentIds.len()
      + self.chatIds.len()
  }

  pub fn add_id(&mut self, collection: &str, id: String) {
    match collection {
      "todos" => {
        if !self.todoIds.contains(&id) {
          self.todoIds.push(id);
        }
      }
      "tasks" => {
        if !self.taskIds.contains(&id) {
          self.taskIds.push(id);
        }
      }
      "subtasks" => {
        if !self.subtaskIds.contains(&id) {
          self.subtaskIds.push(id);
        }
      }
      "comments" => {
        if !self.commentIds.contains(&id) {
          self.commentIds.push(id);
        }
      }
      "chats" => {
        if !self.chatIds.contains(&id) {
          self.chatIds.push(id);
        }
      }
      _ => {}
    }
  }

  pub fn add_todo_id(&mut self, id: String) {
    if !self.todoIds.contains(&id) {
      self.todoIds.push(id);
    }
  }

  pub fn add_task_id(&mut self, id: String) {
    if !self.taskIds.contains(&id) {
      self.taskIds.push(id);
    }
  }

  pub fn add_subtask_id(&mut self, id: String) {
    if !self.subtaskIds.contains(&id) {
      self.subtaskIds.push(id);
    }
  }

  pub fn add_comment_id(&mut self, id: String) {
    if !self.commentIds.contains(&id) {
      self.commentIds.push(id);
    }
  }

  pub fn add_chat_id(&mut self, id: String) {
    if !self.chatIds.contains(&id) {
      self.chatIds.push(id);
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
        cascade_ids.add_todo_id(id.to_string());
        let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(id));
        if let Ok(tasks) = self
          .json_provider
          .find_many("tasks", Some(&filter), None, None, None, true)
          .await
        {
          for task in tasks {
            if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
              cascade_ids.add_task_id(task_id.to_string());
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
        cascade_ids.add_task_id(id.to_string());
        self.collect_subtasks_json(id, &mut cascade_ids).await;
        self
          .collect_comments_by_task_json(id, &mut cascade_ids)
          .await;
      }
      "subtasks" => {
        cascade_ids.add_subtask_id(id.to_string());
        self
          .collect_comments_by_subtask_json(id, &mut cascade_ids)
          .await;
      }
      "comments" => {
        cascade_ids.add_comment_id(id.to_string());
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
          cascade_ids.add_comment_id(comment_id.to_string());
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
          cascade_ids.add_comment_id(comment_id.to_string());
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
          cascade_ids.add_chat_id(chat_id.to_string());
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
          cascade_ids.add_subtask_id(subtask_id);
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
          cascade_ids.add_todo_id(id.to_string());
          let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(id));
          if let Ok(tasks) = mongo
            .find_many("tasks", Some(&filter), None, None, None, true)
            .await
          {
            for task in tasks {
              if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
                cascade_ids.add_task_id(task_id.to_string());
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
          cascade_ids.add_task_id(id.to_string());
          self.collect_subtasks_mongo(id, &mut cascade_ids).await;
          self
            .collect_comments_by_task_mongo(id, &mut cascade_ids)
            .await;
        }
        "subtasks" => {
          cascade_ids.add_subtask_id(id.to_string());
          self
            .collect_comments_by_subtask_mongo(id, &mut cascade_ids)
            .await;
        }
        "comments" => {
          cascade_ids.add_comment_id(id.to_string());
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
            cascade_ids.add_comment_id(comment_id.to_string());
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
            cascade_ids.add_comment_id(comment_id.to_string());
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
            cascade_ids.add_chat_id(chat_id.to_string());
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
            cascade_ids.add_subtask_id(subtask_id);
          }
        }
      }
    }
  }

  pub async fn handleJsonCascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    self.collect_cascade_ids_json(table, id).await
  }

  pub async fn handleMongoCascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if self.mongodb_provider.is_none() {
      return Err(errResponseFormatted("MongoDB not available", ""));
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
      return Err(errResponseFormatted("MongoDB not available", ""));
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
      return Err(errResponseFormatted("MongoDB not available", ""));
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
      return Err(errResponseFormatted("MongoDB not available", ""));
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
        let _ = self.json_provider.insert(table, doc.clone()).await;
        let _ = self.json_provider.patch(table, doc_id, doc.clone()).await;
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
      return Err(errResponseFormatted("MongoDB not available", ""));
    }
    let cascade_ids = self.collect_cascade_ids_mongo(table, id).await?;
    let docs = self.fetch_cascade_docs_mongo(table, &cascade_ids).await?;

    if let Some(ref mongo) = self.mongodb_provider {
      for doc in docs {
        if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
          let _ = mongo.insert(table, doc.clone()).await;
          let _ = mongo.patch(table, doc_id, doc.clone()).await;
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
    for id in &cascade_ids.todoIds {
      let _ = self.json_provider.patch("todos", id, patch.clone()).await;
    }
    for id in &cascade_ids.taskIds {
      let _ = self.json_provider.patch("tasks", id, patch.clone()).await;
    }
    for id in &cascade_ids.subtaskIds {
      let _ = self
        .json_provider
        .patch("subtasks", id, patch.clone())
        .await;
    }
    for id in &cascade_ids.commentIds {
      let _ = self
        .json_provider
        .patch("comments", id, patch.clone())
        .await;
    }
    for id in &cascade_ids.chatIds {
      let _ = self.json_provider.patch("chats", id, patch.clone()).await;
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
      for id in &cascade_ids.todoIds {
        let _ = mongo.patch("todos", id, patch.clone()).await;
      }
      for id in &cascade_ids.taskIds {
        let _ = mongo.patch("tasks", id, patch.clone()).await;
      }
      for id in &cascade_ids.subtaskIds {
        let _ = mongo.patch("subtasks", id, patch.clone()).await;
      }
      for id in &cascade_ids.commentIds {
        let _ = mongo.patch("comments", id, patch.clone()).await;
      }
      for id in &cascade_ids.chatIds {
        let _ = mongo.patch("chats", id, patch.clone()).await;
      }
    }
    Ok(())
  }

  async fn apply_cascade_delete_json(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<(), ResponseModel> {
    for id in &cascade_ids.todoIds {
      let _ = self.json_provider.delete("todos", id).await;
    }
    for id in &cascade_ids.taskIds {
      let _ = self.json_provider.delete("tasks", id).await;
    }
    for id in &cascade_ids.subtaskIds {
      let _ = self.json_provider.delete("subtasks", id).await;
    }
    for id in &cascade_ids.commentIds {
      let _ = self.json_provider.delete("comments", id).await;
    }
    for id in &cascade_ids.chatIds {
      let _ = self.json_provider.delete("chats", id).await;
    }
    Ok(())
  }

  async fn apply_cascade_delete_mongo(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<(), ResponseModel> {
    if let Some(ref mongo) = self.mongodb_provider {
      for id in &cascade_ids.todoIds {
        let _ = mongo.delete("todos", id).await;
      }
      for id in &cascade_ids.taskIds {
        let _ = mongo.delete("tasks", id).await;
      }
      for id in &cascade_ids.subtaskIds {
        let _ = mongo.delete("subtasks", id).await;
      }
      for id in &cascade_ids.commentIds {
        let _ = mongo.delete("comments", id).await;
      }
      for id in &cascade_ids.chatIds {
        let _ = mongo.delete("chats", id).await;
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

    if let Ok(todos) = self
      .json_provider
      .find_many("todos", None, None, None, None, false)
      .await
    {
      docs.extend(todos.into_iter().filter(|d| {
        d.get("id")
          .and_then(|v| v.as_str())
          .map(|id| cascade_ids.todoIds.contains(&id.to_string()))
          .unwrap_or(false)
      }));
    }

    if let Ok(tasks) = self
      .json_provider
      .find_many("tasks", None, None, None, None, false)
      .await
    {
      docs.extend(tasks.into_iter().filter(|d| {
        d.get("id")
          .and_then(|v| v.as_str())
          .map(|id| cascade_ids.taskIds.contains(&id.to_string()))
          .unwrap_or(false)
      }));
    }

    if let Ok(subtasks) = self
      .json_provider
      .find_many("subtasks", None, None, None, None, false)
      .await
    {
      docs.extend(subtasks.into_iter().filter(|d| {
        d.get("id")
          .and_then(|v| v.as_str())
          .map(|id| cascade_ids.subtaskIds.contains(&id.to_string()))
          .unwrap_or(false)
      }));
    }

    if let Ok(comments) = self
      .json_provider
      .find_many("comments", None, None, None, None, false)
      .await
    {
      docs.extend(comments.into_iter().filter(|d| {
        d.get("id")
          .and_then(|v| v.as_str())
          .map(|id| cascade_ids.commentIds.contains(&id.to_string()))
          .unwrap_or(false)
      }));
    }

    if let Ok(chats) = self
      .json_provider
      .find_many("chats", None, None, None, None, false)
      .await
    {
      docs.extend(chats.into_iter().filter(|d| {
        d.get("id")
          .and_then(|v| v.as_str())
          .map(|id| cascade_ids.chatIds.contains(&id.to_string()))
          .unwrap_or(false)
      }));
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
      if let Ok(todos) = mongo
        .find_many("todos", None, None, None, None, false)
        .await
      {
        docs.extend(todos.into_iter().filter(|d| {
          d.get("id")
            .and_then(|v| v.as_str())
            .map(|id| cascade_ids.todoIds.contains(&id.to_string()))
            .unwrap_or(false)
        }));
      }

      if let Ok(tasks) = mongo
        .find_many("tasks", None, None, None, None, false)
        .await
      {
        docs.extend(tasks.into_iter().filter(|d| {
          d.get("id")
            .and_then(|v| v.as_str())
            .map(|id| cascade_ids.taskIds.contains(&id.to_string()))
            .unwrap_or(false)
        }));
      }

      if let Ok(subtasks) = mongo
        .find_many("subtasks", None, None, None, None, false)
        .await
      {
        docs.extend(subtasks.into_iter().filter(|d| {
          d.get("id")
            .and_then(|v| v.as_str())
            .map(|id| cascade_ids.subtaskIds.contains(&id.to_string()))
            .unwrap_or(false)
        }));
      }

      if let Ok(comments) = mongo
        .find_many("comments", None, None, None, None, false)
        .await
      {
        docs.extend(comments.into_iter().filter(|d| {
          d.get("id")
            .and_then(|v| v.as_str())
            .map(|id| cascade_ids.commentIds.contains(&id.to_string()))
            .unwrap_or(false)
        }));
      }

      if let Ok(chats) = mongo
        .find_many("chats", None, None, None, None, false)
        .await
      {
        docs.extend(chats.into_iter().filter(|d| {
          d.get("id")
            .and_then(|v| v.as_str())
            .map(|id| cascade_ids.chatIds.contains(&id.to_string()))
            .unwrap_or(false)
        }));
      }
    }

    Ok(docs)
  }
}
