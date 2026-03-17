/* sys lib */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum RelationType {
  OneToOne,
  OneToMany,
  ManyToOne,
  ManyToMany,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationConfig {
  pub relationType: RelationType,
  pub targetTable: String,
  pub joinColumn: String,
  pub targetColumn: Option<String>, // New: Column to join against in target table (default: "id")
  pub inverseColumn: Option<String>,
  pub joinTable: Option<String>,
}

/// Relation registry - defines all relations for each table
pub fn getRelationRegistry() -> HashMap<String, HashMap<String, RelationConfig>> {
  let mut registry: HashMap<String, HashMap<String, RelationConfig>> = HashMap::new();

  // ==================== TODOS ====================
  let mut todoRelations: HashMap<String, RelationConfig> = HashMap::new();

  // Todo.user (ManyToOne)
  todoRelations.insert(
    "user".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToOne,
      targetTable: "users".to_string(),
      joinColumn: "userId".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    },
  );

  // Todo.tasks (OneToMany)
  todoRelations.insert(
    "tasks".to_string(),
    RelationConfig {
      relationType: RelationType::OneToMany,
      targetTable: "tasks".to_string(),
      joinColumn: "id".to_string(),
      targetColumn: None,
      inverseColumn: Some("todoId".to_string()),
      joinTable: None,
    },
  );

  // Todo.categories (ManyToOne with array of IDs in document)
  todoRelations.insert(
    "categories".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToOne,
      targetTable: "categories".to_string(),
      joinColumn: "categories".to_string(),
      targetColumn: Some("id".to_string()),
      inverseColumn: None,
      joinTable: None,
    },
  );

  // Todo.assigneesProfiles (ManyToOne with array of IDs in document)
  todoRelations.insert(
    "assigneesProfiles".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToOne,
      targetTable: "profiles".to_string(),
      joinColumn: "assignees".to_string(),
      targetColumn: Some("userId".to_string()), // Join against userId in profiles
      inverseColumn: None,
      joinTable: None,
    },
  );

  registry.insert("todos".to_string(), todoRelations);

  // ==================== USERS ====================
  let mut userRelations: HashMap<String, RelationConfig> = HashMap::new();

  // User.profile (OneToOne)
  userRelations.insert(
    "profile".to_string(),
    RelationConfig {
      relationType: RelationType::OneToOne,
      targetTable: "profiles".to_string(),
      joinColumn: "profileId".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    },
  );

  registry.insert("users".to_string(), userRelations);

  // ==================== PROFILES ====================
  let mut profileRelations: HashMap<String, RelationConfig> = HashMap::new();

  // Profile.user (OneToOne)
  profileRelations.insert(
    "user".to_string(),
    RelationConfig {
      relationType: RelationType::OneToOne,
      targetTable: "users".to_string(),
      joinColumn: "userId".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    },
  );

  registry.insert("profiles".to_string(), profileRelations);

  // ==================== TASKS ====================
  let mut taskRelations: HashMap<String, RelationConfig> = HashMap::new();

  // Task.todo (ManyToOne)
  taskRelations.insert(
    "todo".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToOne,
      targetTable: "todos".to_string(),
      joinColumn: "todoId".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    },
  );

  // Task.subtasks (OneToMany)
  taskRelations.insert(
    "subtasks".to_string(),
    RelationConfig {
      relationType: RelationType::OneToMany,
      targetTable: "tasks".to_string(),
      joinColumn: "id".to_string(),
      targetColumn: None,
      inverseColumn: Some("taskId".to_string()),
      joinTable: None,
    },
  );

  // Task.comments (OneToMany)
  taskRelations.insert(
    "comments".to_string(),
    RelationConfig {
      relationType: RelationType::OneToMany,
      targetTable: "comments".to_string(),
      joinColumn: "id".to_string(),
      targetColumn: None,
      inverseColumn: Some("taskId".to_string()),
      joinTable: None,
    },
  );

  registry.insert("tasks".to_string(), taskRelations);

  // ==================== SUBTASKS ====================
  let mut subtaskRelations: HashMap<String, RelationConfig> = HashMap::new();

  // Subtask.task (ManyToOne)
  subtaskRelations.insert(
    "task".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToOne,
      targetTable: "tasks".to_string(),
      joinColumn: "taskId".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    },
  );

  // Subtask.comments (OneToMany)
  subtaskRelations.insert(
    "comments".to_string(),
    RelationConfig {
      relationType: RelationType::OneToMany,
      targetTable: "comments".to_string(),
      joinColumn: "id".to_string(),
      targetColumn: None,
      inverseColumn: Some("subtaskId".to_string()),
      joinTable: None,
    },
  );

  registry.insert("subtasks".to_string(), subtaskRelations);

  // ==================== CATEGORIES ====================
  let mut categoryRelations: HashMap<String, RelationConfig> = HashMap::new();

  // Category.todos (ManyToMany - inverse of Todo.categories)
  categoryRelations.insert(
    "todos".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToMany,
      targetTable: "todos".to_string(),
      joinColumn: "id".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: Some("todo_categories".to_string()),
    },
  );

  registry.insert("categories".to_string(), categoryRelations);

  // ==================== COMMENTS ====================
  let mut commentRelations: HashMap<String, RelationConfig> = HashMap::new();

  // Comment.task (ManyToOne)
  commentRelations.insert(
    "task".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToOne,
      targetTable: "tasks".to_string(),
      joinColumn: "taskId".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    },
  );

  // Comment.subtask (ManyToOne)
  commentRelations.insert(
    "subtask".to_string(),
    RelationConfig {
      relationType: RelationType::ManyToOne,
      targetTable: "subtasks".to_string(),
      joinColumn: "subtaskId".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    },
  );

  registry.insert("comments".to_string(), commentRelations);

  // ==================== PROFILES ====================
  // Add assignees relation to profiles (ManyToMany - inverse of Todo.assignees)
  if let Some(profileRelations) = registry.get_mut("profiles") {
    profileRelations.insert(
      "assignedTodos".to_string(),
      RelationConfig {
        relationType: RelationType::ManyToMany,
        targetTable: "todos".to_string(),
        joinColumn: "id".to_string(),
        targetColumn: None,
        inverseColumn: None,
        joinTable: Some("todo_assignees".to_string()),
      },
    );
  }

  registry
}

#[allow(dead_code)]
impl RelationConfig {
  pub fn oneToOne(target: &str, joinColumn: &str) -> Self {
    Self {
      relationType: RelationType::OneToOne,
      targetTable: target.to_string(),
      joinColumn: joinColumn.to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    }
  }

  pub fn oneToMany(target: &str, inverseColumn: &str) -> Self {
    Self {
      relationType: RelationType::OneToMany,
      targetTable: target.to_string(),
      joinColumn: "id".to_string(),
      targetColumn: None,
      inverseColumn: Some(inverseColumn.to_string()),
      joinTable: None,
    }
  }

  pub fn manyToOne(target: &str, joinColumn: &str) -> Self {
    Self {
      relationType: RelationType::ManyToOne,
      targetTable: target.to_string(),
      joinColumn: joinColumn.to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: None,
    }
  }

  pub fn manyToMany(target: &str, joinTable: &str) -> Self {
    Self {
      relationType: RelationType::ManyToMany,
      targetTable: target.to_string(),
      joinColumn: "id".to_string(),
      targetColumn: None,
      inverseColumn: None,
      joinTable: Some(joinTable.to_string()),
    }
  }
}
