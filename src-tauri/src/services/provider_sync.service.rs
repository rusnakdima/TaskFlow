use chrono::Utc;
use nosql_orm::error::OrmResult;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct ProviderSyncService {
    json_provider: JsonProvider,
    mongo_provider: Option<Arc<MongoProvider>>,
}

impl ProviderSyncService {
    pub fn new(json_provider: JsonProvider, mongo_provider: Option<Arc<MongoProvider>>) -> Self {
        Self {
            json_provider,
            mongo_provider,
        }
    }

    pub async fn sync_todo_to_provider(&self, todo: &Value, is_private: bool) -> OrmResult<()> {
        let todo_id = match todo.get("id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return Ok(());
            }
        };

        self.sync_entity_to_provider(todo, "todos", is_private).await?;

        self.sync_related_entities(todo_id, is_private).await?;

        Ok(())
    }

    pub async fn sync_todo_visibility(&self, todo_id: &str, new_visibility: &str) -> OrmResult<()> {
        let is_private = new_visibility == "private";

        let todo_filter = Filter::Eq("id".to_string(), json!(todo_id));
        let todos = self
            .json_provider
            .find_many("todos", Some(&todo_filter), None, None, None, false)
            .await
            .unwrap_or_default();

        if let Some(todo) = todos.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(todo_id)) {
            let mut updated_todo = todo.clone();
            if let Some(obj) = updated_todo.as_object_mut() {
                obj.insert("visibility".to_string(), json!(new_visibility));
            }
            self.sync_todo_to_provider(&updated_todo, is_private).await?;
        }

        Ok(())
    }

    pub async fn sync_entity_to_provider(
        &self,
        entity: &Value,
        table: &str,
        is_private: bool,
    ) -> OrmResult<()> {
        let id = match entity.get("id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return Ok(());
            }
        };

        let (target_provider, source_provider) = if is_private {
            (&self.json_provider as &dyn nosql_orm::provider::DatabaseProvider, 
             self.mongo_provider.as_ref().map(|m| m.as_ref() as &dyn nosql_orm::provider::DatabaseProvider).unwrap_or(&*self.json_provider as &dyn nosql_orm::provider::DatabaseProvider))
        } else {
            (self.mongo_provider.as_ref().map(|m| m.as_ref() as &dyn nosql_orm::provider::DatabaseProvider).unwrap_or(&*self.json_provider as &dyn nosql_orm::provider::DatabaseProvider),
             &self.json_provider as &dyn nosql_orm::provider::DatabaseProvider)
        };

        let existing = source_provider.find_by_id(table, id).await.ok().flatten();

        if existing.is_some() {
            if let Err(_e) = target_provider.update_one(table, id, entity).await {
            }
        } else {
            if let Err(_e) = target_provider.insert_one(table, entity).await {
            }
        }

        let timestamp = Utc::now().to_rfc3339();
        let source_patch = json!({
            "visibility": if is_private { "private" } else { "shared" },
            "deleted_at": timestamp
        });

        if let Err(_e) = source_provider.update_one(table, id, &source_patch).await {
        }

        Ok(())
    }

    pub async fn sync_batch(
        &self,
        entities: &[Value],
        table: &str,
        is_private: bool,
    ) -> OrmResult<()> {
        if entities.is_empty() {
            return Ok(());
        }

        let mut synced = 0;
        for entity in entities {
            if let Err(_e) = self.sync_entity_to_provider(entity, table, is_private).await {
            } else {
                synced += 1;
            }
        }

        Ok(())
    }

    async fn sync_related_entities(&self, todo_id: &str, is_private: bool) -> OrmResult<()> {
        let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        let tasks = self
            .json_provider
            .find_many("tasks", Some(&task_filter), None, None, None, false)
            .await
            .unwrap_or_default();

        let task_ids: Vec<String> = tasks
            .iter()
            .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
            .collect();

        let subtask_filter = Filter::In(
            "task_id".to_string(),
            task_ids.iter().map(|id| json!(id)).collect(),
        );
        let subtasks = self
            .json_provider
            .find_many("subtasks", Some(&subtask_filter), None, None, None, false)
            .await
            .unwrap_or_default();

        let subtask_ids: Vec<String> = subtasks
            .iter()
            .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
            .collect();

        let comment_filter = if subtask_ids.is_empty() {
            Filter::In(
                "task_id".to_string(),
                task_ids.iter().map(|id| json!(id)).collect(),
            )
        } else {
            Filter::Or(vec![
                Filter::In(
                    "task_id".to_string(),
                    task_ids.iter().map(|id| json!(id)).collect(),
                ),
                Filter::In(
                    "subtask_id".to_string(),
                    subtask_ids.iter().map(|id| json!(id)).collect(),
                ),
            ])
        };
        let comments = self
            .json_provider
            .find_many("comments", Some(&comment_filter), None, None, None, false)
            .await
            .unwrap_or_default();

        let chat_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        let chats = self
            .json_provider
            .find_many("chats", Some(&chat_filter), None, None, None, false)
            .await
            .unwrap_or_default();

        self.sync_batch(&tasks, "tasks", is_private).await?;
        self.sync_batch(&subtasks, "subtasks", is_private).await?;
        self.sync_batch(&comments, "comments", is_private).await?;
        self.sync_batch(&chats, "chats", is_private).await?;

        Ok(())
    }

    pub async fn sync_from_mongo_to_json(&self, todo_id: &str, new_visibility: &str) -> OrmResult<()> {
        let Some(ref mongo) = self.mongo_provider else {
            return Ok(());
        };

        let is_private = new_visibility == "private";
        let todo_filter = Filter::Eq("id".to_string(), json!(todo_id));
        let todos = mongo
            .find_many("todos", Some(&todo_filter), None, None, None, false)
            .await
            .unwrap_or_default();

        if let Some(todo) = todos.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(todo_id)) {
            let mut updated_todo = todo.clone();
            if let Some(obj) = updated_todo.as_object_mut() {
                obj.insert("visibility".to_string(), json!(new_visibility));
            }

            self.sync_entity_to_provider(&updated_todo, "todos", is_private).await?;

            let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
            let tasks = mongo
                .find_many("tasks", Some(&task_filter), None, None, None, false)
                .await
                .unwrap_or_default();

            let task_ids: Vec<String> = tasks
                .iter()
                .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
                .collect();

            let subtask_filter = Filter::In(
                "task_id".to_string(),
                task_ids.iter().map(|id| json!(id)).collect(),
            );
            let subtasks = mongo
                .find_many("subtasks", Some(&subtask_filter), None, None, None, false)
                .await
                .unwrap_or_default();

            let subtask_ids: Vec<String> = subtasks
                .iter()
                .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
                .collect();

            let comment_filter = if subtask_ids.is_empty() {
                Filter::In(
                    "task_id".to_string(),
                    task_ids.iter().map(|id| json!(id)).collect(),
                )
            } else {
                Filter::Or(vec![
                    Filter::In(
                        "task_id".to_string(),
                        task_ids.iter().map(|id| json!(id)).collect(),
                    ),
                    Filter::In(
                        "subtask_id".to_string(),
                        subtask_ids.iter().map(|id| json!(id)).collect(),
                    ),
                ])
            };
            let comments = mongo
                .find_many("comments", Some(&comment_filter), None, None, None, false)
                .await
                .unwrap_or_default();

            let chat_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
            let chats = mongo
                .find_many("chats", Some(&chat_filter), None, None, None, false)
                .await
                .unwrap_or_default();

            self.sync_batch(&tasks, "tasks", is_private).await?;
            self.sync_batch(&subtasks, "subtasks", is_private).await?;
            self.sync_batch(&comments, "comments", is_private).await?;
            self.sync_batch(&chats, "chats", is_private).await?;
        }

        Ok(())
    }
}

impl Clone for ProviderSyncService {
    fn clone(&self) -> Self {
        Self {
            json_provider: self.json_provider.clone(),
            mongo_provider: self.mongo_provider.clone(),
        }
    }
}
