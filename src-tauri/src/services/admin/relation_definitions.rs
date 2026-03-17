use crate::models::relation_obj::{RelationObj, TypesField};

pub fn getUserRelations() -> Vec<RelationObj> {
  vec![RelationObj {
    nameTable: "profiles".to_string(),
    typeField: TypesField::OneToOne,
    nameField: "profileId".to_string(),
    newNameField: "profile".to_string(),
    targetField: None,
    relations: None,
  }]
}

pub fn getTableRelations(table: &str) -> Option<Vec<RelationObj>> {
  match table {
    "profiles" => Some(vec![RelationObj {
      nameTable: "users".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "userId".to_string(),
      newNameField: "user".to_string(),
      targetField: None,
      relations: None,
    }]),
    "todos" => Some(vec![
      RelationObj {
        nameTable: "users".to_string(),
        typeField: TypesField::OneToOne,
        nameField: "userId".to_string(),
        newNameField: "user".to_string(),
        targetField: None,
        relations: Some(vec![RelationObj {
          nameTable: "profiles".to_string(),
          typeField: TypesField::OneToOne,
          nameField: "profileId".to_string(),
          newNameField: "profile".to_string(),
          targetField: None,
          relations: None,
        }]),
      },
      RelationObj {
        nameTable: "categories".to_string(),
        typeField: TypesField::ManyToOne,
        nameField: "categories".to_string(),
        newNameField: "categories".to_string(),
        targetField: None,
        relations: None,
      },
      RelationObj {
        nameTable: "profiles".to_string(),
        typeField: TypesField::ManyToOne,
        nameField: "assignees".to_string(),
        newNameField: "assigneesProfiles".to_string(),
        targetField: Some("userId".to_string()),
        relations: Some(vec![RelationObj {
          nameTable: "users".to_string(),
          typeField: TypesField::OneToOne,
          nameField: "userId".to_string(),
          newNameField: "user".to_string(),
          targetField: None,
          relations: None,
        }]),
      },
    ]),
    "categories" => Some(vec![RelationObj {
      nameTable: "users".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "userId".to_string(),
      newNameField: "user".to_string(),
      targetField: None,
      relations: Some(vec![RelationObj {
        nameTable: "profiles".to_string(),
        typeField: TypesField::OneToOne,
        nameField: "profileId".to_string(),
        newNameField: "profile".to_string(),
        targetField: None,
        relations: None,
      }]),
    }]),
    "tasks" => Some(vec![RelationObj {
      nameTable: "todos".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "todoId".to_string(),
      newNameField: "todo".to_string(),
      targetField: None,
      relations: None,
    }]),
    "subtasks" => Some(vec![RelationObj {
      nameTable: "tasks".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "taskId".to_string(),
      newNameField: "task".to_string(),
      targetField: None,
      relations: None,
    }]),
    _ => None,
  }
}
