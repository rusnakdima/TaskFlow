use nosql_orm::providers::JsonProvider;
use nosql_orm::relations::RelationLoader;
use serde_json::Value;

use crate::entities::relation_config::user_projection;
use crate::entities::response_entity::ResponseModel;

pub struct RelationLoaderService {
  json_provider: JsonProvider,
}

impl RelationLoaderService {
  pub fn new(json_provider: JsonProvider) -> Self {
    Self { json_provider }
  }

  pub async fn load_relations_json(
    &self,
    docs: Vec<Value>,
    table: &str,
    load_paths: &[String],
    _use_mongo: bool,
  ) -> Result<Vec<Value>, ResponseModel> {
    if load_paths.is_empty() {
      let projection = user_projection();
      let projected: Vec<Value> = docs.iter().map(|d| projection.apply(d)).collect();
      return Ok(projected);
    }

    let mut current_docs = docs;
    let table = table.to_string();
    let projection = user_projection();

    let mut projected_docs: Vec<Value> = Vec::new();
    for doc in current_docs.iter() {
      projected_docs.push(projection.apply(doc));
    }
    current_docs = projected_docs;

    for path in load_paths {
      let segments: Vec<&str> = path.split('.').collect();
      if segments.is_empty() {
        continue;
      }

      tracing::info!(
        "[REPO] Loading relations for table={}, path={:?}, segments={:?}",
        table,
        path,
        segments
      );

      let mut docs_to_process = current_docs.clone();

      let mut parent_ids_by_segment: Vec<Vec<String>> = Vec::new();
      parent_ids_by_segment.push(Vec::new());

      for (idx, segment) in segments.iter().enumerate() {
        tracing::info!(
          "[REPO] Loading segment {} of {}: {}",
          idx + 1,
          segments.len(),
          segment
        );

        let loader = RelationLoader::new(self.json_provider.clone());

        let current_table = if idx == 0 { table.as_str() } else { segment };

        if idx > 0 {
          let parent_ids: Vec<String> = docs_to_process
            .iter()
            .filter_map(|d| d.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect();
          tracing::info!(
            "[REPO] Extracted {} parent IDs for segment '{}': {:?}",
            parent_ids.len(),
            segment,
            parent_ids.iter().take(3).collect::<Vec<_>>()
          );
          if parent_ids_by_segment.len() <= idx {
            parent_ids_by_segment.push(parent_ids);
          } else {
            parent_ids_by_segment[idx] = parent_ids;
          }
        }

        for doc in docs_to_process.iter_mut() {
          if let Some(obj) = doc.as_object_mut() {
            obj.insert(
              "_collection".to_string(),
              Value::String(current_table.to_string()),
            );
          }
        }

        match loader
          .load_nested(docs_to_process.clone(), &[*segment], true)
          .await
        {
          Ok(loaded_docs) => {
            tracing::info!(
              "[REPO] Segment '{}' loaded, {} docs returned",
              segment,
              loaded_docs.len()
            );
            if let Some(first) = loaded_docs.first() {
              tracing::debug!(
                "[REPO] First loaded doc keys: {:?}",
                first.as_object().map(|o| o.keys().collect::<Vec<_>>())
              );
              tracing::debug!("[REPO] First loaded doc: {}", first);
            }
            docs_to_process = loaded_docs;
          }
          Err(e) => {
            tracing::warn!("[REPO] Failed to load segment '{}': {}", segment, e);
            break;
          }
        }

        let mut projected: Vec<Value> = Vec::new();
        for doc in docs_to_process.iter() {
          if let Some(obj) = doc.as_object() {
            let mut obj_clone = obj.clone();
            obj_clone.remove("_collection");
            let p = projection.apply(&Value::Object(obj_clone));
            projected.push(p);
          } else {
            projected.push(doc.clone());
          }
        }
        docs_to_process = projected;
      }

      let final_docs = if !docs_to_process.is_empty() {
        docs_to_process.clone()
      } else {
        Vec::new()
      };

      if segments.len() == 1 {
        current_docs = docs_to_process;
      } else {
        if !final_docs.is_empty() {
          let merged = self.merge_nested_results(current_docs.clone(), final_docs, &segments);
          current_docs = merged;
        }
      }
    }

    Ok(current_docs)
  }

  fn merge_nested_results(
    &self,
    parents: Vec<Value>,
    nested_results: Vec<Value>,
    segments: &[&str],
  ) -> Vec<Value> {
    if segments.len() < 2 {
      return nested_results;
    }

    let parent_segment = segments[0];
    let child_segment = segments[1];

    tracing::info!(
      "[REPO] merge_nested_results: parent_segment={}, child_segment={}, parents={}, nested={}",
      parent_segment,
      child_segment,
      parents.len(),
      nested_results.len()
    );

    let foreign_key = match child_segment {
      "subtasks" => "task_id",
      "comments" => "task_id",
      "tasks" => "todo_id",
      _ => "id",
    };

    tracing::info!("[REPO] Using foreign_key='{}' for grouping", foreign_key);

    let mut grouped: std::collections::HashMap<String, Vec<Value>> =
      std::collections::HashMap::new();
    for doc in nested_results.iter() {
      if let Some(fk_value) = doc.get(foreign_key).and_then(|v| v.as_str()) {
        let key = fk_value.to_string();
        grouped
          .entry(key)
          .or_insert_with(Vec::new)
          .push(doc.clone());
      }
    }

    tracing::info!("[REPO] Grouped {} parent keys", grouped.len());

    let mut result: Vec<Value> = Vec::new();
    for parent in parents.iter() {
      if let Some(parent_obj) = parent.as_object() {
        let mut parent_clone = parent_obj.clone();

        if let Some(parent_id) = parent_obj.get("id").and_then(|v| v.as_str()) {
          if let Some(children) = grouped.get(parent_id) {
            parent_clone.insert(child_segment.to_string(), Value::Array(children.clone()));
            tracing::debug!(
              "[REPO] Attached {} {} to parent {}",
              children.len(),
              child_segment,
              parent_id
            );
          }
        }

        result.push(Value::Object(parent_clone));
      } else {
        result.push(parent.clone());
      }
    }

    tracing::info!(
      "[REPO] merge_nested_results returning {} docs",
      result.len()
    );
    result
  }
}
