/* sys lib */
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;

/* models */
use crate::models::relation_config::{getRelationRegistry, RelationConfig, RelationType};

/* providers */
use crate::providers::base_crud::CrudProvider;

/// Relation loading statistics for performance monitoring
#[derive(Clone, Debug, Default)]
pub struct RelationLoadingStats {
  pub total_queries: usize,
  pub batch_queries: usize,
  pub cache_hits: usize,
  pub load_time_ms: u64,
}

/// RelationLoader - Parse dot notation and load relations efficiently
///
/// Features:
/// - Batch loading to reduce N+1 queries
/// - Per-request caching to avoid redundant fetches
/// - Circular reference detection
/// - Nested relation optimization
#[derive(Clone)]
pub struct RelationLoader<P: CrudProvider> {
  crudProvider: P,
  registry: HashMap<String, HashMap<String, RelationConfig>>,
  cache: Arc<RwLock<HashMap<String, Value>>>, // Cache key: "table:id"
  stats: Arc<RwLock<RelationLoadingStats>>,
}

impl<P: CrudProvider> RelationLoader<P> {
  pub fn new(crudProvider: P) -> Self {
    Self {
      crudProvider,
      registry: getRelationRegistry(),
      cache: Arc::new(RwLock::new(HashMap::new())),
      stats: Arc::new(RwLock::new(RelationLoadingStats::default())),
    }
  }

  /// Get current loading statistics
  pub async fn getStats(&self) -> RelationLoadingStats {
    self.stats.read().await.clone()
  }

  /// Reset statistics (call at start of request)
  pub async fn resetStats(&self) {
    let mut stats = self.stats.write().await;
    *stats = RelationLoadingStats::default();
  }

  /// Clear cache (call at end of request)
  pub async fn clearCache(&self) {
    let mut cache = self.cache.write().await;
    cache.clear();
  }

  /// Parse dot notation paths and load relations for an entity
  ///
  /// # Arguments
  /// * `entity` - The entity to load relations for
  /// * `table` - The table name of the entity
  /// * `relationPaths` - Dot notation paths like ["tasks.subtasks", "user"]
  pub async fn loadRelations(
    &self,
    entity: &mut Value,
    table: &str,
    relationPaths: &[String],
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self
      .loadRelationsWithVisited(entity, table, relationPaths, &mut HashSet::new())
      .await
  }

  /// Internal method with circular reference detection
  async fn loadRelationsWithVisited(
    &self,
    entity: &mut Value,
    table: &str,
    relationPaths: &[String],
    visited: &mut HashSet<String>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let start_time = std::time::Instant::now();

    // Track entity to prevent circular references
    if let Some(entity_id) = entity.get("id").and_then(|v| v.as_str()) {
      let entity_key = format!("{}:{}", table, entity_id);
      if visited.contains(&entity_key) {
        return Ok(());
      }
      visited.insert(entity_key);
    }

    // Expand wildcards first
    let expandedPaths = self.expandAllWildcards(table, relationPaths);

    // Group relations by first level to batch load
    let mut relationsByFirst: HashMap<String, Vec<Vec<String>>> = HashMap::new();

    for path in &expandedPaths {
      let parts: Vec<&str> = path.split('.').collect();
      if parts.is_empty() {
        continue;
      }

      let firstRelation = parts[0].to_string();
      let remaining: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();

      relationsByFirst
        .entry(firstRelation)
        .or_insert_with(Vec::new)
        .push(remaining);
    }

    // Load each first-level relation with batching
    for (relationName, nestedPaths) in relationsByFirst {
      self
        .loadSingleRelationWithVisited(entity, table, &relationName, &nestedPaths, visited)
        .await?;
    }

    let elapsed_ms = start_time.elapsed().as_millis() as u64;
    self.stats.write().await.load_time_ms = elapsed_ms;
    Ok(())
  }

  /// Load a single relation and its nested relations
  async fn loadSingleRelationWithVisited(
    &self,
    entity: &mut Value,
    table: &str,
    relationName: &str,
    nestedPaths: &[Vec<String>],
    visited: &mut HashSet<String>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = self.getRelationConfig(table, relationName)?;

    let mut relationData = self.fetchRelationDataWithCache(entity, &config).await?;

    if !nestedPaths.is_empty() && nestedPaths.iter().any(|p| !p.is_empty()) {
      Box::pin(self.loadNestedRelationsWithVisited(
        &mut relationData,
        &config.targetTable,
        nestedPaths,
        visited,
      ))
      .await?;
    }

    if let Some(obj) = entity.as_object_mut() {
      obj.insert(relationName.to_string(), relationData);
    }

    Ok(())
  }

  /// Batch load relations for multiple entities at once
  /// This reduces N+1 queries to just 2 queries per relation level
  pub async fn loadRelationsBatch(
    &self,
    entities: &mut [Value],
    table: &str,
    relationPaths: &[String],
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if entities.is_empty() {
      return Ok(());
    }

    let start_time = std::time::Instant::now();

    // Expand wildcards
    let expandedPaths = self.expandAllWildcards(table, relationPaths);

    // Group by first level relation
    let mut relationsByFirst: HashMap<String, Vec<Vec<String>>> = HashMap::new();
    for path in &expandedPaths {
      let parts: Vec<&str> = path.split('.').collect();
      if parts.is_empty() {
        continue;
      }
      let firstRelation = parts[0].to_string();
      let remaining: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();
      relationsByFirst
        .entry(firstRelation)
        .or_insert_with(Vec::new)
        .push(remaining);
    }

    // Load each first-level relation in batch
    for (relationName, nestedPaths) in relationsByFirst {
      Box::pin(self.loadBatchRelation(entities, table, &relationName, &nestedPaths)).await?;
    }

    let elapsed = start_time.elapsed();
    let elapsed_ms = elapsed.as_millis() as u64;
    {
      let mut stats = self.stats.write().await;
      stats.load_time_ms = elapsed_ms;
      stats.batch_queries += 1;
    }

    Ok(())
  }

  /// Load a batch relation for multiple entities
  async fn loadBatchRelation(
    &self,
    entities: &mut [Value],
    table: &str,
    relationName: &str,
    nestedPaths: &[Vec<String>],
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = self.getRelationConfig(table, relationName)?;

    // Collect all parent IDs
    let parentIds: Vec<&str> = entities
      .iter()
      .filter_map(|e| e.get("id").and_then(|v| v.as_str()))
      .collect();

    if parentIds.is_empty() {
      return Ok(());
    }

    // Accumulate query count locally; apply to stats once at the end
    let mut queries_this_call: usize = 0;

    // Fetch all related entities based on relation type
    let mut relatedByParent: HashMap<String, Value> = HashMap::new();

    match config.relationType {
      RelationType::ManyToOne | RelationType::OneToOne => {
        // For ManyToOne/OneToOne, collect all unique foreign keys for batch fetching
        let mut all_fks = HashSet::new();
        for entity in entities.iter() {
          if let Some(fk_val) = entity.get(&config.joinColumn) {
            if let Some(fk_str) = fk_val.as_str() {
              if !fk_str.is_empty() {
                all_fks.insert(fk_str.to_string());
              }
            } else if let Some(fk_arr) = fk_val.as_array() {
              for id_val in fk_arr {
                if let Some(id_str) = id_val.as_str() {
                  if !id_str.is_empty() {
                    all_fks.insert(id_str.to_string());
                  }
                }
              }
            }
          }
        }

        if !all_fks.is_empty() {
          // Fetch all related entities in one go
          let fks_vec: Vec<String> = all_fks.into_iter().collect();
          let target_col = config.targetColumn.as_deref().unwrap_or("id");
          let filter = serde_json::json!({ target_col: { "$in": fks_vec } });

          queries_this_call += 1;

          let allRelated: Vec<Value> = self
            .crudProvider
            .getAll(&config.targetTable, Some(filter))
            .await
            .unwrap_or_default();

          // Map related entities by the target column value (usually "id", but could be "userId")
          let mut relatedByTargetVal: HashMap<String, Value> = HashMap::new();
          for related in allRelated {
            if let Some(target_val) = related.get(target_col).and_then(|v| v.as_str()) {
              relatedByTargetVal.insert(target_val.to_string(), related);
            }
          }

          // Build relatedByParent mapping (parent entity ID -> related data)
          for entity in entities.iter() {
            if let Some(entity_id) = entity.get("id").and_then(|v| v.as_str()) {
              if let Some(fk_val) = entity.get(&config.joinColumn) {
                if let Some(fk_str) = fk_val.as_str() {
                  let related = relatedByTargetVal
                    .get(fk_str)
                    .cloned()
                    .unwrap_or(Value::Null);
                  relatedByParent.insert(entity_id.to_string(), related);
                } else if let Some(fk_arr) = fk_val.as_array() {
                  let mut records = Vec::new();
                  for id_val in fk_arr {
                    if let Some(id_str) = id_val.as_str() {
                      if let Some(related) = relatedByTargetVal.get(id_str) {
                        records.push(related.clone());
                      }
                    }
                  }
                  relatedByParent.insert(entity_id.to_string(), Value::Array(records));
                }
              }
            }
          }
        } else {
          // Handle empty FKs
          for entity in entities.iter() {
            if let Some(entity_id) = entity.get("id").and_then(|v| v.as_str()) {
              if let Some(fk_val) = entity.get(&config.joinColumn) {
                if fk_val.is_array() {
                  relatedByParent.insert(entity_id.to_string(), Value::Array(vec![]));
                } else {
                  relatedByParent.insert(entity_id.to_string(), Value::Null);
                }
              }
            }
          }
        }
      }

      RelationType::OneToMany => {
        // For OneToMany, fetch all children in single query
        let inverseCol = config
          .inverseColumn
          .as_ref()
          .ok_or("Missing inverse column for OneToMany")?;

        let filter = serde_json::json!({ inverseCol: { "$in": parentIds } });

        queries_this_call += 1;

        let allRelated: Vec<Value> = self
          .crudProvider
          .getAll(&config.targetTable, Some(filter))
          .await
          .unwrap_or_default();

        // Group by parent ID
        for related in allRelated {
          if let Some(parentId) = related.get(inverseCol).and_then(|v| v.as_str()) {
            let parentIdStr = parentId.to_string();
            let existing = relatedByParent
              .entry(parentIdStr)
              .or_insert(Value::Array(vec![]));
            if let Some(arr) = existing.as_array_mut() {
              arr.push(related);
            }
          }
        }

        // Ensure all parents have an array (even if empty)
        for parentId in &parentIds {
          relatedByParent
            .entry(parentId.to_string())
            .or_insert(Value::Array(vec![]));
        }
      }

      RelationType::ManyToMany => {
        // For ManyToMany, fetch through join table
        let joinTable = config
          .joinTable
          .as_ref()
          .ok_or("Missing join table for ManyToMany")?;

        // Fetch all join records in single query
        let joinFilter = serde_json::json!({
          self.getJoinTableFk(joinTable, table): { "$in": parentIds }
        });

        queries_this_call += 1;

        let joinRecords: Vec<Value> = self
          .crudProvider
          .getAll(joinTable, Some(joinFilter))
          .await
          .unwrap_or_default();

        // Extract related IDs
        let relatedFk = self.getJoinTableFk(joinTable, &config.targetTable);
        let relatedIds: Vec<&str> = joinRecords
          .iter()
          .filter_map(|r| r.get(&relatedFk).and_then(|v| v.as_str()))
          .collect();

        if !relatedIds.is_empty() {
          queries_this_call += 1;

          let targetFilter = serde_json::json!({
            "id": { "$in": relatedIds }
          });

          let allRelated: Vec<Value> = self
            .crudProvider
            .getAll(&config.targetTable, Some(targetFilter))
            .await
            .unwrap_or_default();

          // Build mapping from parent to related
          let mut relatedById: HashMap<&str, &Value> = HashMap::new();
          for related in &allRelated {
            if let Some(id) = related.get("id").and_then(|v| v.as_str()) {
              relatedById.insert(id, related);
            }
          }

          // Group by parent
          for joinRec in &joinRecords {
            let parentId = joinRec
              .get(&self.getJoinTableFk(joinTable, table))
              .and_then(|v| v.as_str())
              .unwrap_or("");

            let relatedId = joinRec
              .get(&relatedFk)
              .and_then(|v| v.as_str())
              .unwrap_or("");

            if let Some(related) = relatedById.get(relatedId) {
              let parentIdStr = parentId.to_string();
              let existing = relatedByParent
                .entry(parentIdStr)
                .or_insert(Value::Array(vec![]));
              if let Some(arr) = existing.as_array_mut() {
                arr.push((*related).clone());
              }
            }
          }
        }

        // Ensure all parents have an array (even if empty)
        for parentId in &parentIds {
          relatedByParent
            .entry(parentId.to_string())
            .or_insert(Value::Array(vec![]));
        }
      }
    }

    // Apply accumulated stats in a single lock acquisition
    if queries_this_call > 0 {
      let mut stats = self.stats.write().await;
      stats.total_queries += queries_this_call;
    }

    // Insert relations into entities
    for entity in entities.iter_mut() {
      if let Some(entity_id) = entity.get("id").and_then(|v| v.as_str()) {
        if let Some(related) = relatedByParent.remove(entity_id) {
          // Load nested relations first (before inserting, so we have mutable access)
          if !nestedPaths.is_empty() && nestedPaths.iter().any(|p| !p.is_empty()) {
            let mut nested_related = related.clone();
            let mut visited = HashSet::new();
            if let Some(entity_id) = entity.get("id").and_then(|v| v.as_str()) {
              visited.insert(format!("{}:{}", table, entity_id));
            }
            let _ = self
              .loadNestedRelationsWithVisited(
                &mut nested_related,
                &config.targetTable,
                nestedPaths,
                &mut visited,
              )
              .await;

            // Insert after nested loading
            if let Some(obj) = entity.as_object_mut() {
              obj.insert(relationName.to_string(), nested_related);
            }
          } else {
            // No nested relations, just insert
            if let Some(obj) = entity.as_object_mut() {
              obj.insert(relationName.to_string(), related);
            }
          }
        }
      }
    }

    Ok(())
  }

  /// Load nested relations for already-fetched data
  async fn loadNestedRelationsWithVisited(
    &self,
    data: &mut Value,
    table: &str,
    nestedPaths: &[Vec<String>],
    visited: &mut HashSet<String>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if data.is_array() {
      // Handle array of entities - use batch loading for efficiency
      if let Some(arr) = data.as_array_mut() {
        if !arr.is_empty() {
          // Convert nested paths to flat paths for batch loading
          let flatPaths: Vec<String> = nestedPaths
            .iter()
            .filter(|p| !p.is_empty())
            .map(|p| p.join("."))
            .collect();

          if !flatPaths.is_empty() {
            return Box::pin(self.loadRelationsBatch(arr, table, &flatPaths)).await;
          }
        }
      }
    } else if !nestedPaths.is_empty() {
      // Handle single entity with nested paths
      for path in nestedPaths {
        if !path.is_empty() {
          let first = path[0].to_string();
          let remaining = if path.len() > 1 {
            vec![path[1..].to_vec()]
          } else {
            vec![]
          };
          Box::pin(self.loadSingleRelationWithVisited(data, table, &first, &remaining, visited))
            .await?;
        }
      }
    }

    Ok(())
  }

  /// Fetch relation data with caching
  async fn fetchRelationDataWithCache(
    &self,
    entity: &Value,
    config: &RelationConfig,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    match config.relationType {
      RelationType::ManyToOne | RelationType::OneToOne => {
        self.fetchSingleRelationWithCache(entity, config).await
      }
      RelationType::OneToMany => self.fetchOneToManyWithCache(entity, config).await,
      RelationType::ManyToMany => self.fetchManyToManyWithCache(entity, config).await,
    }
  }

  /// Fetch ManyToOne or OneToOne relation with caching
  async fn fetchSingleRelationWithCache(
    &self,
    entity: &Value,
    config: &RelationConfig,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let fkValue = entity
      .get(&config.joinColumn)
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if fkValue.is_empty() {
      return Ok(Value::Null);
    }

    // Check cache first
    let cache_key = format!("{}:{}", config.targetTable, fkValue);
    if let Some(cached) = self.cache.read().await.get(&cache_key) {
      let mut stats = self.stats.write().await;
      stats.cache_hits += 1;
      return Ok(cached.clone());
    }

    let mut stats = self.stats.write().await;
    stats.total_queries += 1;

    match self.crudProvider.get(&config.targetTable, fkValue).await {
      Ok(data) => {
        self.cache.write().await.insert(cache_key, data.clone());
        Ok(data)
      }
      Err(_) => Ok(Value::Null),
    }
  }

  /// Fetch OneToMany relation with caching
  async fn fetchOneToManyWithCache(
    &self,
    entity: &Value,
    config: &RelationConfig,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let id = entity.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if id.is_empty() {
      return Ok(Value::Array(vec![]));
    }

    let inverseCol = config
      .inverseColumn
      .as_ref()
      .ok_or("Missing inverse column for OneToMany")?;

    // Check cache for this specific parent's children
    let cache_key = format!("{}:{}:{}", config.targetTable, inverseCol, id);
    if let Some(cached) = self.cache.read().await.get(&cache_key) {
      let mut stats = self.stats.write().await;
      stats.cache_hits += 1;
      return Ok(cached.clone());
    }

    let filter = serde_json::json!({ inverseCol: id });

    let mut stats = self.stats.write().await;
    stats.total_queries += 1;

    match self
      .crudProvider
      .getAll(&config.targetTable, Some(filter))
      .await
    {
      Ok(data) => {
        let result = Value::Array(data.clone());
        self.cache.write().await.insert(cache_key, result.clone());
        Ok(result)
      }
      Err(_) => Ok(Value::Array(vec![])),
    }
  }

  /// Fetch ManyToMany relation with caching
  async fn fetchManyToManyWithCache(
    &self,
    entity: &Value,
    config: &RelationConfig,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let id = entity.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if id.is_empty() {
      return Ok(Value::Array(vec![]));
    }

    let joinTable = config
      .joinTable
      .as_ref()
      .ok_or("Missing join table for ManyToMany")?;

    // Check cache first
    let cache_key = format!("{}:{}:{}", config.targetTable, joinTable, id);
    if let Some(cached) = self.cache.read().await.get(&cache_key) {
      let mut stats = self.stats.write().await;
      stats.cache_hits += 1;
      return Ok(cached.clone());
    }

    let joinFk = self.getJoinTableFk(joinTable, config.targetTable.as_str());
    let joinFilter = serde_json::json!({ joinFk: id });

    let mut stats = self.stats.write().await;
    stats.total_queries += 1;

    let joinRecords: Vec<Value> = match self.crudProvider.getAll(joinTable, Some(joinFilter)).await
    {
      Ok(records) => records,
      Err(_) => return Ok(Value::Array(vec![])),
    };

    let relatedFk = self.getJoinTableFk(joinTable, config.targetTable.as_str());
    let relatedIds: Vec<&str> = joinRecords
      .iter()
      .filter_map(|record| record.get(&relatedFk).and_then(|v| v.as_str()))
      .collect();

    if relatedIds.is_empty() {
      return Ok(Value::Array(vec![]));
    }

    stats.total_queries += 1;

    let targetFilter = serde_json::json!({
        "id": { "$in": relatedIds }
    });

    match self
      .crudProvider
      .getAll(&config.targetTable, Some(targetFilter))
      .await
    {
      Ok(data) => {
        let result = Value::Array(data.clone());
        self.cache.write().await.insert(cache_key, result.clone());
        Ok(result)
      }
      Err(_) => Ok(Value::Array(vec![])),
    }
  }

  /// Get the foreign key column name in a join table for a given target table
  fn getJoinTableFk(&self, joinTable: &str, targetTable: &str) -> String {
    // Convention: join table FK is source_table_singular + "Id"
    // For todo_categories: todoId (refers to todos), categoryId (refers to categories)
    // For todo_assignees: todoId (refers to todos), profileId (refers to profiles)

    // Extract the two table names from join table name
    let parts: Vec<&str> = joinTable.split('_').collect();
    if parts.len() == 2 {
      let table1 = parts[0];
      let table2 = parts[1];

      // Determine which table this FK refers to
      // Check exact match first, then check plural form
      if targetTable == table1 || targetTable == &format!("{}s", table1) {
        return format!("{}Id", table1);
      } else if targetTable == table2 || targetTable == &format!("{}s", table2) {
        return format!("{}Id", table2);
      }
    }

    // Fallback to old logic - handle plural forms properly
    let singular = if targetTable.ends_with("ies") {
      // Handle categories -> category
      format!("{}y", &targetTable[..targetTable.len() - 3])
    } else if targetTable.ends_with('s') {
      // Handle todos -> todo, tasks -> task, etc.
      targetTable.trim_end_matches('s').to_string()
    } else {
      targetTable.to_string()
    };

    format!("{}Id", singular)
  }

  /// Get relation config from registry
  fn getRelationConfig(
    &self,
    table: &str,
    relationName: &str,
  ) -> Result<&RelationConfig, Box<dyn std::error::Error + Send + Sync>> {
    let tableRelations = self
      .registry
      .get(table)
      .ok_or_else(|| format!("No relations defined for table: {}", table))?;

    let config = tableRelations
      .get(relationName)
      .ok_or_else(|| format!("Unknown relation '{}' for table '{}'", relationName, table))?;

    Ok(config)
  }

  /// Expand wildcard patterns like "tasks.*" to all nested relations
  fn expandAllWildcards(&self, table: &str, paths: &[String]) -> Vec<String> {
    let mut expanded = Vec::new();

    for path in paths {
      if path.contains(".*") {
        let expandedPaths = self.expandWildcard(table, path);
        expanded.extend(expandedPaths);
      } else {
        expanded.push(path.clone());
      }
    }

    expanded
  }

  /// Expand a single wildcard path
  fn expandWildcard(&self, table: &str, path: &str) -> Vec<String> {
    if !path.ends_with(".*") && !path.contains(".*") {
      return vec![path.to_string()];
    }

    let parts: Vec<&str> = path.split('.').collect();
    let mut result = Vec::new();

    // Find wildcard position
    for (i, part) in parts.iter().enumerate() {
      if *part == "*" {
        // Get the parent path
        let parentPath = if i > 0 {
          parts[..i].join(".")
        } else {
          String::new()
        };

        // Get relations for the parent's target table
        let parentTable = if i == 0 {
          table.to_string()
        } else {
          // Need to resolve the chain to find the table
          self.resolveTableFromPath(table, &parts[..i])
        };

        // Get all relations for that table
        if let Some(relations) = self.registry.get(&parentTable) {
          for relationName in relations.keys() {
            let mut newPath = if parentPath.is_empty() {
              relationName.clone()
            } else {
              format!("{}.{}", parentPath, relationName)
            };

            // Add remaining parts after wildcard
            if i + 1 < parts.len() {
              newPath.push('.');
              newPath.push_str(&parts[i + 1..].join("."));
            }

            result.push(newPath);
          }
        }
        break;
      }
    }

    if result.is_empty() {
      result.push(path.to_string());
    }

    result
  }

  /// Resolve the target table from a relation path
  fn resolveTableFromPath(&self, startTable: &str, pathParts: &[&str]) -> String {
    let mut currentTable = startTable.to_string();

    for part in pathParts {
      if let Some(relations) = self.registry.get(&currentTable) {
        if let Some(config) = relations.get(*part) {
          currentTable = config.targetTable.clone();
        }
      }
    }

    currentTable
  }
}
